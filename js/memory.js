// Auto-summary: when a chat grows past ~55% of the connection's context size,
// older messages are condensed into a running summary. The last 8 stay verbatim.
import { complete } from './providers.js';
import { helperFor } from './helper.js';
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
  // The summary may run on the Helper connection: keep the part it reads within that model's context.
  const run = helperFor(conn, 'summary');
  // The summary may run on a smaller model: read from the oldest message forward only as much as fits,
  // and mark just that much as summarized; the rest is picked up by the next run.
  const room = (run?.context || 16000) * 0.6;
  const lines = [];
  let used = 0;
  for (const m of chunk) {
    const l = `${m.role === 'user' ? user : char.name}: ${textOf(m)}`;
    const t = estimateTokens(l);
    if (lines.length && used + t > room) break;
    lines.push(l);
    used += t;
  }
  const readTo = (force ? 0 : from) + lines.length;
  const transcript = lines.join('\n');
  const prev = force ? '' : chat.summary?.text || '';
  const text = await complete(run, {
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
  chat.summary = { text: text.trim(), upto: readTo, covers: readTo, at: Date.now() };
  await saveChat(chat, false);
  return true;
}
