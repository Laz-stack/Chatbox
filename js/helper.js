// Helper connection: background jobs (story tracking, summaries, diaries, Enhance, the character
// builder, card import) can run on a cheaper, faster connection while chats keep their own.
// Connections › Helper. With none chosen, each job uses the connection it was given.
import { complete } from './providers.js';
import { S, connection, recordJob, meter } from './store.js';
import { estimateTokens } from './util.js';

export const JOBS = { track: 'Story tracking', summary: 'Summaries', diary: 'Diaries', enhance: 'Lorebook Enhance', builder: 'Character builder', import: 'Card import', moves: 'Suggested moves', scene: 'Scene prompts', map: 'World map', picread: 'Character from a picture', recap: 'Recaps', next: 'Who speaks next' };
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
  const mt = meter();
  let mt2 = null;
  const sent = (opts.system || '') + (opts.messages || []).map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((p) => p.text || '').join(' '))).join('\n');
  let text = '';
  try {
    text = await complete(run, { ...opts, onUsage: mt.onUsage });
    // Models that think before answering can spend the whole allowance thinking and send back
    // nothing. Ask once more with twice the room (only what is used is billed).
    if (!String(text || '').trim() && !opts.signal?.aborted) {
      mt.commit(estimateTokens(sent), 0, (i, o, c) => recordJob(run, job, i, o, c)).catch(() => {});
      text = await complete(run, { ...opts, maxTokens: Math.min(8000, (opts.maxTokens || 600) * 2), onUsage: (mt2 = meter()).onUsage });
    }
  } finally {
    // A stopped job is still billed for what it generated; OpenRouter says what that was.
    const last = mt2 || mt;
    if (mt2 || text || mt.usage) last.commit(estimateTokens(sent), estimateTokens(text || ''), (i, o, c) => recordJob(run, job, i, o, c)).catch(() => {});
  }
  return text;
}
