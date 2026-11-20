// Builds what gets sent with each reply, as named layers:
// 1 Global prompt, 2 Connection prompt, 3 Character persona, 4 Your persona,
// 5 Notes and summary, then the chat history (trimmed to fit the context size).
import { estimateTokens } from './util.js';
import { bondsLayer } from './chronicle.js';
import { clockLayer } from './clock.js';
import { tiesLayer } from './ties.js';
import { textOf, matchLore } from './store.js';
import { PROVIDERS } from './providers.js';
import { compileSheet } from './blueprint.js';
import { sceneSystem, STEER, turnAsScene, hasCastLines } from './scene.js';

export const macro = (t, ch, persona) =>
  (t || '').replace(/\{\{\s*char\s*\}\}/gi, ch?.name || 'Character').replace(/\{\{\s*user\s*\}\}/gi, persona?.name?.trim() || 'the user');

// group: { people: [characters], scene: '', mode: 'turns' | 'scene', passengers } inside an Interchange.
// In 'scene' mode (a Carriage) one reply narrates the whole scene and voices every character.
export function buildPrompt({ char, chat, conn, settings, persona, upto = null, mode = 'reply', group = null }) {
  const layers = [];
  const m = (t) => macro(t, char, persona).trim();
  const useGlobal = settings.globalOn && char.useGlobal !== false && !conn?.replaceGlobal;

  if (useGlobal && settings.globalPrompt?.trim()) layers.push({ key: 'global', name: 'Global prompt', text: m(settings.globalPrompt) });
  if (conn?.prompt?.trim()) layers.push({ key: 'connection', name: 'Connection prompt', text: m(conn.prompt) });
  // World: an imported story's setting and rules, or a narrator character's scenario.
  const world = group?.world || (!group && char.scenario) || '';
  if (world.trim()) layers.push({ key: 'world', name: 'World', text: m(world) });

  // The Blueprint sheet (if filled) plus Extra notes; older characters are just their prompt text.
  const personaText = [m(compileSheet(char)) || `You are ${char.name}.`, char.tagline ? `${char.name} in a few words: ${char.tagline}.` : '']
    .filter(Boolean)
    .join('\n');
  const isScene = group?.mode === 'scene';
  const youName = persona?.name?.trim() || 'the user';
  let groupText = '';
  if (isScene) {
    layers.push({ key: 'persona', name: 'Cast and scene', text: sceneSystem({ people: group.people, scene: group.scene, passengers: group.passengers !== false, you: youName, fill: (t, p) => macro(t, p, persona).trim() }) });
  } else if (group) {
    const others = group.people.filter((p) => p.id !== char.id);
    groupText =
      `\n\nThis is a group scene (an Interchange). Also present: ${others.map((p) => p.name + (p.tagline ? ` (${p.tagline})` : '')).join('; ')}.` +
      (group.scene?.trim() ? `\nScene: ${m(group.scene)}` : '') +
      `\nOther characters' lines arrive prefixed with their names. Write only ${char.name}'s next message. Never write dialogue or actions for ${others.map((p) => p.name).join(' or ')}, or for ${persona?.name?.trim() || 'the user'}.`;
  }
  if (!isScene) layers.push({ key: 'persona', name: 'Character persona', text: personaText + groupText });

  if (persona.useEverywhere && (persona.about?.trim() || persona.name?.trim())) {
    layers.push({
      key: 'user',
      name: 'Your persona',
      text: (isScene ? `The user plays ${youName}.` : `You are talking with ${youName}.`) + (persona.about?.trim() ? ` About them: ${m(persona.about)}` : ''),
    });
  }

  // Lorebook: entries whose keywords appear in the recent chat (or that are always on).
  const end0 = upto == null ? chat.messages.length : upto;
  const recent = chat.messages.slice(Math.max(0, end0 - 8), end0).map((x) => textOf(x)).join('\n');
  // Entries can target characters, or an Interchange/Carriage itself (its chat's owner id).
  const lineIds = group ? [...group.people.map((p) => p.id), chat.characterId] : [char.id];
  const lore = matchLore(recent, lineIds).slice(0, 12);
  if (lore.length) layers.push({ key: 'lore', name: 'Lorebook', text: lore.map((e) => (e.title?.trim() ? `${e.title.trim()}: ` : '') + m(e.text)).join('\n\n') });

  // Reply style (Depot): only non-default choices add instructions.
  const rs = settings.replyStyle || {};
  const style = [];
  const remind = [];
  if ((rs.format || 'asterisks') === 'asterisks')
    style.push('Formatting: wrap every action, thought and line of narration in *asterisks*, and put spoken words in "double quotes". Never leave narration or actions unmarked. Put shouted or forceful statements in `backticks`.'), remind.push('narration, actions and thoughts in *asterisks*, speech in "quotes"');
  if (rs.length === 'short') style.push('Keep each reply short: two to four sentences, under 60 words. This overrides any other length guidance above.'), remind.push('short, under 60 words');
  if (rs.length === 'long') style.push('Write long, rich replies: three to five paragraphs with sensory detail, body language and inner thoughts, about 250 to 400 words. This overrides any shorter length limit above.'), remind.push('long, 250 to 400 words');
  if (rs.person === 'first' && !isScene) style.push(`Write ${char.name}'s actions and narration in first person ("I smile"), even if earlier messages use third person. This overrides other guidance above.`), remind.push('first person');
  if (rs.person === 'third' && !isScene) style.push(`Write ${char.name}'s actions and narration in third person ("${char.name} smiles"), even if earlier messages use first person. This overrides other guidance above.`), remind.push('third person');
  if (style.length) layers.push({ key: 'style', name: 'Reply style', text: style.join('\n') });

  // Content rules (Depot › Content › 18+ content).
  layers.push({
    key: 'content',
    name: 'Content rules',
    text: settings.mature
      ? 'The user is a confirmed adult and has allowed mature content. Explicit romantic and sexual content between adult characters is allowed when the story leads there and everyone involved is willing. Every character is an adult (18 or older); never sexualise minors or anyone who seems underage.'
      : 'Keep the story free of explicit sexual content: if a scene heads that way, fade to black or cut away. Every character is an adult (18 or older); never sexualise minors or anyone who seems underage.',
  });

  const memory = [];
  if (chat.summary?.text) memory.push('Story so far:\n' + chat.summary.text.trim());
  if (chat.notes?.length) memory.push('Remember:\n' + chat.notes.map((n) => '- ' + m(n.text)).join('\n'));
  // Bonds: how the cast feels about you right now (Route map › Bonds).
  const bonds = bondsLayer(chat, group?.people || [char], persona?.name?.trim() || 'the user');
  if (bonds) memory.push(bonds);
  const ties = tiesLayer(chat, group?.people, isScene ? null : char.id);
  if (ties) memory.push(ties);
  const time = clockLayer(chat);
  if (time) memory.push(time);
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
      const t = macro(textOf(x), own, persona).replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '').trim();
      if (isScene) {
        // Replies from Take turns (one speaker each) are rewritten as "Name: …" so the scene keeps its format.
        if (x.role === 'assistant') return { role: 'assistant', content: x.speaker && !hasCastLines(t, group.people) ? turnAsScene(t, nameOf(x.speaker)) : t };
        if (x.dir) return { role: 'user', content: `[${STEER[x.dir]?.note || t}]` };
        if (x.as) return { role: 'user', content: `[${you} writes this line for ${nameOf(x.as)}]\n${nameOf(x.as)}: ${t}` };
        return { role: 'user', content: `${you}: ${t}` };
      }
      // Stage directions (time skips, While you were away) are notes for the AI, never your words.
      if (x.dir) return { role: 'user', content: `[${STEER[x.dir]?.note || t}]` };
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

  // Models follow instructions placed after the history best: repeat the reply style there in one line.
  const lastTurn = merged[merged.length - 1];
  if (remind.length && lastTurn?.role === 'user') lastTurn.content += `\n\n[Reply style: ${remind.join(', ')}]`;
  const histTokens = merged.reduce((a, x) => a + estimateTokens(x.content), 0);
  return {
    system,
    messages: merged,
    layers,
    histTokens,
    loreIds: lore.map((e) => e.id),
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
