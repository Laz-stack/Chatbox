// Helper connection: background jobs (story tracking, summaries, diaries, Enhance, the character
// builder, card import) can run on a cheaper, faster connection while chats keep their own.
// Connections › Helper. With none chosen, each job uses the connection it was given.
import { complete } from './providers.js';
import { S, connection, recordJob } from './store.js';
import { estimateTokens } from './util.js';

export const JOBS = { track: 'Story tracking', summary: 'Summaries', diary: 'Diaries', enhance: 'Lorebook Enhance', builder: 'Character builder', import: 'Card import', moves: 'Suggested moves', scene: 'Scene prompts', map: 'World map', picread: 'Character from a picture' };
// Creative writing the user reads directly; can stay on the main model (Helper › "Diaries and character builder too").
const CREATIVE = new Set(['diary', 'builder']);

export function helper() {
  const h = S.settings.helperId ? connection(S.settings.helperId) : null;
  return h && h.provider !== 'demo' ? h : null;
}
export function helperFor(conn, job) {
  const h = helper();
  if (!h || !conn || conn.provider === 'demo') return conn;
  if (CREATIVE.has(job) && S.settings.helperCreative === false) return conn;
  return h;
}
// Every background call is counted on the Helper receipt (Fares), whichever connection ran it.
export async function helperComplete(conn, job, opts) {
  const run = helperFor(conn, job);
  const text = await complete(run, opts);
  const sent = (opts.system || '') + (opts.messages || []).map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((p) => p.text || '').join(' '))).join('\n');
  recordJob(run, job, estimateTokens(sent), estimateTokens(text || '')).catch(() => {});
  return text;
}
