// Helper connection: background jobs (story tracking, summaries, diaries, Enhance, the character
// builder, card import) can run on a cheaper, faster connection while chats keep their own.
// Connections › Helper. With none chosen, each job uses the connection it was given.
import { complete } from './providers.js';
import { S, connection } from './store.js';

export const JOBS = { track: 'Route map and Bonds', summary: 'Summaries', diary: 'Diaries', enhance: 'Lorebook Enhance', builder: 'Character builder', import: 'Card import' };
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
export const helperComplete = (conn, job, opts) => complete(helperFor(conn, job), opts);
