// Adventure mode (per chat): suggested moves after each reply, d20 checks on risky actions,
// and quests and items that the story keeps track of.
import { PROVIDERS } from './providers.js';
import { extractJson } from './blueprint.js';
import { helperComplete } from './helper.js';
import { textOf, named } from './store.js';
import { uid } from './util.js';

export const advOn = (chat) => !!chat?.adv?.on;
const str = (v) => (v == null ? '' : String(v).trim());
const norm = (s) => str(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ');

// ---------- dice ----------
export function roll() {
  const n = 1 + Math.floor(Math.random() * 20);
  const result = n === 20 ? 'crit' : n === 1 ? 'fumble' : n >= 15 ? 'success' : n >= 8 ? 'partial' : 'fail';
  return { n, result };
}
export const RESULT = { crit: 'Critical success', success: 'Success', partial: 'Partial success', fail: 'Failure', fumble: 'Critical failure' };
const HOW = {
  crit: 'it works better than hoped, with a bonus',
  success: 'it works',
  partial: 'it works, but at a cost or with a complication',
  fail: 'it doesn’t work, and the situation gets harder',
  fumble: 'it goes badly wrong in a memorable way',
};
// What the AI is told along with your line.
export const rollNote = (r) => (r ? `[Dice check: d20 = ${r.n}, ${RESULT[r.result].toLowerCase()}. Narrate the outcome of the attempt: ${HOW[r.result]}.]` : '');
// Older rolls, already narrated: just the fact.
export const rollShort = (r) => (r ? `(d20 ${r.n}, ${RESULT[r.result].toLowerCase()})` : '');

// ---------- suggested moves ----------
const isDemo = (conn) => !conn || PROVIDERS[conn.provider]?.format === 'demo';
function recent(chat, cast, persona, n = 8) {
  const you = persona?.name?.trim() || 'User';
  return chat.messages
    .slice(-n)
    .filter((m) => !m.dir && !m.error)
    .map((m) => `${m.role === 'user' ? you : cast.find((p) => p.id === m.speaker)?.name || cast[0]?.name || 'Narrator'}: ${named(textOf(m), cast[0], you, persona).slice(0, 1200)}`)
    .join('\n\n');
}
export async function suggestMoves({ chat, cast, persona, conn, signal }) {
  if (isDemo(conn)) return [{ text: 'Look around the room', risky: false }, { text: 'Ask what’s really going on', risky: false }, { text: 'Try the locked door', risky: true }];
  const you = persona?.name?.trim() || 'the user';
  const brief = {
    you,
    open_quests: (chat.quests || []).filter((q) => q.state === 'open').map((q) => q.title),
    carrying: (chat.items || []).map((i) => i.name),
    recent_story: recent(chat, cast, persona),
  };
  const ask =
    `Suggest three different things ${you} could do next. Return {"moves":[{"text":"...","risky":false}]}. ` +
    `Each text is 2 to 8 words, an action in plain words without a name in front (for example "Force the lock", "Ask Mirelle to stall them"). ` +
    `Make them meaningfully different: one cautious, one bold, one about the people. Mark risky true for at most one move whose outcome is uncertain.`;
  const text = await helperComplete(conn, 'moves', { system: 'You suggest moves for the player of an interactive story. Reply with ONE JSON object and nothing else.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 700, temperature: 0.8, signal });
  const out = extractJson(text);
  return (Array.isArray(out.moves) ? out.moves : [])
    .map((m) => ({ text: str(m.text).replace(/^["“*]+|["”*.]+$/g, '').slice(0, 70), risky: !!m.risky }))
    .filter((m) => m.text)
    .slice(0, 3);
}

// ---------- quests and items (from the background read) ----------
export function advBrief(chat) {
  return {
    quests_now: (chat.quests || []).map((q) => `${q.title} (${q.state})`),
    carrying_now: (chat.items || []).map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`),
  };
}
export const advAsk = (you) =>
  `\nAdventure: also return "quests":[{"title":"...","state":"open","note":"..."}] and "items":[{"name":"...","change":1,"note":"..."}]. ` +
  `quests: goals ${you} has taken on or that the story clearly set for them, new ones (state open) or ones that were completed (done) or failed in this part; title 3 to 7 words; note one short line on where it stands. Only real goals, not every errand. ` +
  `items: things ${you} gained (change 1 or more) or lost or used up (negative) in this part; name 1 to 3 words. Leave both empty when nothing changed.`;

// Apply; returns a list of changes (for the log row and for undo).
export function applyAdv(chat, res, msgId) {
  const changes = [];
  chat.quests ||= [];
  chat.items ||= [];
  for (const q of Array.isArray(res?.quests) ? res.quests.slice(0, 4) : []) {
    const title = str(q.title).slice(0, 70);
    if (!title) continue;
    const state = ['open', 'done', 'failed'].includes(q.state) ? q.state : 'open';
    const cur = chat.quests.find((x) => norm(x.title) === norm(title));
    if (cur?.set) continue; // you edited it: the story doesn't overwrite it
    if (!cur) {
      if (state !== 'open' && !q.note) continue;
      const n = { id: uid(), title, state, note: str(q.note).slice(0, 140), at: Date.now(), msgId };
      chat.quests.push(n);
      changes.push({ kind: 'quest', id: n.id, title, state, created: true });
    } else if (cur.state !== state || (q.note && str(q.note) !== cur.note)) {
      changes.push({ kind: 'quest', id: cur.id, title: cur.title, state, prev: { state: cur.state, note: cur.note } });
      cur.state = state;
      if (q.note) cur.note = str(q.note).slice(0, 140);
      cur.at = Date.now();
    }
  }
  for (const it of Array.isArray(res?.items) ? res.items.slice(0, 6) : []) {
    const name = str(it.name).slice(0, 40);
    const change = Math.round(Number(it.change) || 0);
    if (!name || !change) continue;
    const cur = chat.items.find((x) => norm(x.name) === norm(name));
    if (cur?.set) continue;
    if (!cur) {
      if (change < 0) continue;
      const n = { id: uid(), name, qty: change, note: str(it.note).slice(0, 80), at: Date.now() };
      chat.items.push(n);
      changes.push({ kind: 'item', id: n.id, name, change, created: true });
    } else {
      const was = cur.qty;
      cur.qty = Math.max(0, cur.qty + change);
      if (it.note) cur.note = str(it.note).slice(0, 80);
      changes.push({ kind: 'item', id: cur.id, name: cur.name, change: cur.qty - was, prevQty: was });
      if (!cur.qty) chat.items = chat.items.filter((x) => x !== cur);
    }
  }
  return changes;
}
// Take back one reply's changes (regenerate / delete).
export function undoAdv(chat, changes) {
  for (const c of [...(changes || [])].reverse()) {
    if (c.kind === 'quest') {
      const q = (chat.quests || []).find((x) => x.id === c.id);
      if (!q || q.set) continue;
      if (c.created) chat.quests = chat.quests.filter((x) => x !== q);
      else Object.assign(q, c.prev);
    } else {
      const it = (chat.items || []).find((x) => x.id === c.id);
      if (it?.set) continue;
      if (c.created) chat.items = (chat.items || []).filter((x) => x.id !== c.id);
      else if (it) it.qty = c.prevQty;
      else chat.items.push({ id: c.id, name: c.name, qty: c.prevQty, note: '' });
    }
  }
}
// One slim log row for a reply's changes.
export function advRowText(changes) {
  if (!changes?.length) return '';
  if (changes.length > 1) return `${changes.length} changes · Quests and items`;
  const c = changes[0];
  if (c.kind === 'quest') return `${c.created ? 'Quest added' : c.state === 'done' ? 'Quest done' : c.state === 'failed' ? 'Quest failed' : 'Quest updated'} · ${c.title}`;
  return `Item · ${c.name} ${c.change > 0 ? '+' : '−'}${Math.abs(c.change)}`;
}

// The prompt layer.
export function advLayer(chat, youName) {
  if (!advOn(chat)) return '';
  const open = (chat.quests || []).filter((q) => q.state === 'open').slice(-8);
  const items = (chat.items || []).slice(-8);
  return (
    `Adventure mode: treat this as an interactive story with real stakes. When a line from ${youName} comes with a dice check in [brackets], narrate the outcome it gives; never ignore it.` +
    (open.length ? `\nOpen quests: ${open.map((q) => q.title + (q.note ? ` (${q.note})` : '')).join('; ')}.` : '') +
    (items.length ? `\n${youName} carries: ${items.map((i) => i.name + (i.qty > 1 ? ` ×${i.qty}` : '') + (i.note ? ` (${i.note})` : '')).join(', ')}. Only these; ${youName} can't use things they don't have.` : '')
  );
}
