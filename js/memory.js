// Auto-summary: when a chat grows past ~55% of the connection's context size,
// older messages are condensed into a running summary. The last 8 stay verbatim.
import { complete } from './providers.js';
import { estimateTokens } from './util.js';
import { textOf, saveChat } from './store.js';
import { macro } from './prompt.js';

const KEEP = 8;

export function historyTokens(chat) {
  const from = chat.summary?.upto || 0;
  return chat.messages.slice(from).reduce((a, m) => a + estimateTokens(textOf(m)), 0);
}

export function shouldSummarize(chat, conn) {
  const from = chat.summary?.upto || 0;
  const n = chat.messages.length - from;
  return n > KEEP + 4 && historyTokens(chat) > (conn?.context || 16000) * 0.55;
}

export async function summarize({ chat, char, conn, persona, force = false, signal }) {
  const from = chat.summary?.upto || 0;
  const cut = chat.messages.length - KEEP;
  if (cut <= from && !force) return false;
  // A forced redo rewrites the summary from the start, up to the usual cut point
  // (or nearly everything, for a short chat).
  const end = force ? Math.max(from, cut > 0 ? cut : chat.messages.length - 2) : cut;
  const chunk = chat.messages.slice(force ? 0 : from, end);
  if (!chunk.length) return false;
  const user = persona?.name?.trim() || 'User';
  const transcript = chunk
    .map((m) => `${m.role === 'user' ? user : char.name}: ${textOf(m)}`)
    .join('\n');
  const prev = force ? '' : chat.summary?.text || '';
  const text = await complete(conn, {
    system:
      'You condense roleplay transcripts into a compact memory. Write in past tense, third person. Keep names, facts, promises, feelings, places and open threads. No commentary.',
    messages: [
      {
        role: 'user',
        content: macro(
          (prev ? `Summary so far:\n${prev}\n\n` : '') +
            `New part of the story:\n${transcript}\n\nWrite the updated summary in under 180 words.`,
          char,
          persona
        ),
      },
    ],
    stream: false,
    maxTokens: 400,
    temperature: 0.3,
    signal,
    character: char,
  });
  if (!text.trim()) return false;
  chat.summary = { text: text.trim(), upto: end, covers: end, at: Date.now() };
  await saveChat(chat, false);
  return true;
}
