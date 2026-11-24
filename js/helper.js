// Helper connection: background jobs (story tracking, summaries, diaries, Enhance, the character
// builder, card import) can run on a cheaper, faster connection while chats keep their own.
// Connections › Helper. With none chosen, each job uses the connection it was given.
import { complete } from './providers.js';
import { S, connection, recordJob, meter } from './store.js';
import { estimateTokens } from './util.js';
import { extractJson } from './blueprint.js';

export const JOBS = { track: 'Story tracking', summary: 'Summaries', diary: 'Diaries', enhance: 'Lorebook Enhance', builder: 'Character builder', import: 'Card import', moves: 'Suggested moves', scene: 'Scene prompts', map: 'World map', picread: 'Character from a picture', recap: 'Recaps', next: 'Who speaks next', speakers: 'Who says each line' };
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
// opts.direct: run on `conn` itself, not on the Helper (used when the Helper declined a job).
export async function helperComplete(conn, job, { direct = false, ...opts } = {}) {
  const run = direct ? conn : helperFor(conn, job);
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
      text = await complete(run, { ...opts, maxTokens: Math.min(8000, Math.max(2500, (opts.maxTokens || 600) * 3)), onUsage: (mt2 = meter()).onUsage });
    }
  } finally {
    // A stopped job is still billed for what it generated; OpenRouter says what that was.
    const last = mt2 || mt;
    if (mt2 || text || mt.usage) last.commit(estimateTokens(sent), estimateTokens(text || ''), (i, o, c) => recordJob(run, job, i, o, c)).catch(() => {});
  }
  // A thinking model's reasoning stays out of summaries, diaries and recaps (and the prompt they feed).
  return unthink(text).trim();
}

// A background job that needs a JSON answer. Thinking models get room to think and still answer
// (at least 1500 tokens; only what's used is billed); thinking left in the text is dropped; and if
// the answer still can't be read, it asks once more for the JSON alone.
const unthink = (t) => String(t || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^[\s\S]*<\/think(?:ing)?>/i, '');
export async function helperJson(conn, job, opts) {
  const o = { ...opts, maxTokens: Math.max(1500, opts.maxTokens || 0) };
  const text = await helperComplete(conn, job, o);
  try {
    return extractJson(unthink(text));
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    const again = await helperComplete(conn, job, {
      ...o,
      maxTokens: Math.min(8000, o.maxTokens * 2),
      messages: [...(o.messages || []), ...(String(text || '').trim() ? [{ role: 'assistant', content: String(text).slice(0, 4000) }] : []), { role: 'user', content: 'Reply with only the JSON object asked for above: no reasoning, no other text before or after it.' }],
    });
    return extractJson(unthink(again));
  }
}
