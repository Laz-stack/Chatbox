// Builds what gets sent with each reply, as named layers:
// 1 Global prompt, 2 Connection prompt, 3 Character persona, 4 Your persona,
// 5 Notes and summary, then the chat history (trimmed to fit the context size).
import { estimateTokens } from './util.js';
import { textOf } from './store.js';
import { PROVIDERS } from './providers.js';

export const macro = (t, ch, persona) =>
  (t || '').replace(/\{\{\s*char\s*\}\}/gi, ch?.name || 'Character').replace(/\{\{\s*user\s*\}\}/gi, persona?.name?.trim() || 'the user');

// group: { people: [characters], scene: '' } when this reply is one speaker inside an Interchange.
export function buildPrompt({ char, chat, conn, settings, persona, upto = null, mode = 'reply', group = null }) {
  const layers = [];
  const m = (t) => macro(t, char, persona).trim();
  const useGlobal = settings.globalOn && char.useGlobal !== false && !conn?.replaceGlobal;

  if (useGlobal && settings.globalPrompt?.trim()) layers.push({ key: 'global', name: 'Global prompt', text: m(settings.globalPrompt) });
  if (conn?.prompt?.trim()) layers.push({ key: 'connection', name: 'Connection prompt', text: m(conn.prompt) });

  const personaText = [m(char.persona) || `You are ${char.name}.`, char.tagline ? `${char.name} in a few words: ${char.tagline}.` : '']
    .filter(Boolean)
    .join('\n');
  let groupText = '';
  if (group) {
    const others = group.people.filter((p) => p.id !== char.id);
    groupText =
      `\n\nThis is a group scene (an Interchange). Also present: ${others.map((p) => p.name + (p.tagline ? ` (${p.tagline})` : '')).join('; ')}.` +
      (group.scene?.trim() ? `\nScene: ${m(group.scene)}` : '') +
      `\nOther characters' lines arrive prefixed with their names. Write only ${char.name}'s next message. Never write dialogue or actions for ${others.map((p) => p.name).join(' or ')}, or for ${persona?.name?.trim() || 'the user'}.`;
  }
  layers.push({ key: 'persona', name: 'Character persona', text: personaText + groupText });

  if (persona.useEverywhere && (persona.about?.trim() || persona.name?.trim())) {
    layers.push({
      key: 'user',
      name: 'Your persona',
      text: `You are talking with ${persona.name?.trim() || 'the user'}.` + (persona.about?.trim() ? ` About them: ${m(persona.about)}` : ''),
    });
  }

  const memory = [];
  if (chat.summary?.text) memory.push('Story so far:\n' + chat.summary.text.trim());
  if (chat.notes?.length) memory.push('Remember:\n' + chat.notes.map((n) => '- ' + m(n.text)).join('\n'));
  if (memory.length) layers.push({ key: 'notes', name: 'Notes and summary', text: memory.join('\n\n') });

  const system = layers.map((l) => l.text).join('\n\n');
  layers.forEach((l) => (l.tokens = estimateTokens(l.text)));
  const sysTokens = estimateTokens(system);

  // History after the summary, up to (not including) `upto`.
  const end = upto == null ? chat.messages.length : upto;
  const start = Math.min(chat.summary?.upto || 0, end);
  const you = persona?.name?.trim() || 'User';
  const nameOf = (id) => group?.people.find((p) => p.id === id)?.name || 'Someone';
  // In a group, only this speaker's own lines are "assistant"; everyone else's arrive as named user lines.
  let hist = chat.messages
    .slice(start, end)
    .filter((x) => !x.error)
    .map((x) => {
      const own = group?.people.find((p) => p.id === x.speaker) || char;
      const t = macro(textOf(x), own, persona);
      if (!group) return { role: x.role, content: t };
      if (x.role === 'assistant' && x.speaker === char.id) return { role: 'assistant', content: t };
      return { role: 'user', content: `${x.role === 'user' ? you : nameOf(x.speaker)}: ${t}` };
    });

  const budget = Math.max(1000, (conn?.context || 16000) - (conn?.maxTokens || 600) - sysTokens);
  let used = hist.reduce((a, x) => a + estimateTokens(x.content), 0);
  while (hist.length > 2 && used > budget) {
    used -= estimateTokens(hist[0].content);
    hist.shift();
  }

  const fmt = PROVIDERS[conn?.provider]?.format;
  if (mode === 'continue') {
    if (fmt === 'anthropic') {
      // Anthropic continues a trailing assistant message (prefill).
      if (hist.length && hist[hist.length - 1].role === 'assistant') hist[hist.length - 1].content = hist[hist.length - 1].content.trimEnd();
    } else {
      hist.push({ role: 'user', content: '(Continue your last message from exactly where it stopped. Do not repeat it.)' });
    }
  }

  // Providers expect alternating roles starting with the user.
  const merged = [];
  for (const x of hist) {
    if (!x.content.trim()) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === x.role) prev.content += '\n\n' + x.content;
    else merged.push({ ...x });
  }
  if (merged.length && merged[0].role === 'assistant') merged.unshift({ role: 'user', content: '(The scene begins.)' });
  if (!merged.length) merged.push({ role: 'user', content: '(The scene begins.)' });

  const histTokens = merged.reduce((a, x) => a + estimateTokens(x.content), 0);
  return {
    system,
    messages: merged,
    layers,
    histTokens,
    histCount: merged.length,
    total: sysTokens + histTokens,
  };
}

// Plain-text rendering of the whole request, for copying.
export function promptAsText(built) {
  return (
    '=== SYSTEM ===\n' +
    built.system +
    '\n\n' +
    built.messages.map((m) => `=== ${m.role.toUpperCase()} ===\n${m.content}`).join('\n\n')
  );
}
