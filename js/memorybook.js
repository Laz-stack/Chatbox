// Memory book: lasting facts from the story ("Laz is left-handed", "Sona owes the guild 40 gold"),
// written down by the background read (chronicle.js) and kept per chat, each tied to the message it
// came from. Before every reply the facts that matter right now are recalled into the prompt, so a
// character remembers things from hundreds of messages ago without the whole history being sent.
// You can add, edit, pin (always recalled) and delete facts in Memory.
import { textOf } from './store.js';
import { uid, estimateTokens } from './util.js';

const str = (v) => (v == null ? '' : String(v).trim());
export const RECALL_MAX = 8; // facts per reply
const RECALL_TOKENS = 700;

// Words that say nothing about what a fact is about.
const STOP = new Set(
  'the a an and or but if of to in on at by for with from as is are was were be been being it its this that these those he she they them his her their him you your yours i me my we us our not no yes do does did done have has had can could will would should may might just very really so then than there here what when where who why how all any each some more most much many one two also into onto over under about after before again still even only own same too out up down off now ever never always said says say like get got make made know knew think thought want wanted look looked back away come came go went take took give gave tell told ask asked'.split(' ')
);
const words = (t) =>
  str(t)
    .toLowerCase()
    .replace(/[*_"“”'’`]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/u, '') : w));
const norm = (t) => words(t).join(' ');
function similar(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

// ---------- the background read ----------
export const factsBrief = (chat) => ({ facts_known: (chat.facts || []).slice(-40).map((f) => f.text) });
export const factsAsk = (you) =>
  `\nMemory: also return "facts":[{"text":"...","about":"..."}]: lasting facts from this part worth remembering for the rest of the story: what was learned about people (names, history, likes, fears, promises, debts, secrets, injuries, belongings, relationships), decisions made, and world details that were established. Not passing actions or moods. 0 to 4 items, each one plain sentence under 20 words, using names (the user is ${you}). about: the person it is about, or "" for the world. Skip anything already in facts_known.`;

// Add what a read found; returns the new facts (for the row under the reply and for undo).
export function applyFacts(chat, res, a, b) {
  chat.facts ||= [];
  const out = [];
  for (const f of Array.isArray(res?.facts) ? res.facts.slice(0, 4) : []) {
    const text = str(f?.text || f).replace(/\s+/g, ' ').slice(0, 220);
    if (words(text).length < 2) continue;
    if (chat.facts.some((x) => norm(x.text) === norm(text) || similar(x.text, text) > 0.8)) continue;
    const at = chat.messages[Math.min(b, chat.messages.length) - 1];
    const fact = { id: uid(), text, about: str(f?.about).slice(0, 40), msgId: at?.id || null, at: Date.now(), auto: true };
    chat.facts.push(fact);
    out.push(fact);
  }
  return out;
}
// Taken back with the reply whose read wrote them (unless you edited or pinned them since).
export function undoFacts(chat, ids) {
  if (!ids?.length) return;
  chat.facts = (chat.facts || []).filter((f) => !(ids.includes(f.id) && f.auto && !f.pinned && !f.edited));
}

// ---------- recall ----------
// The facts that matter for the last few messages: pinned ones always, then the ones sharing the most
// words (names count double), newest first on a tie; a few recent ones when nothing matches.
export function recall(chat, { max = RECALL_MAX, tokens = RECALL_TOKENS } = {}) {
  const facts = chat.facts || [];
  if (!facts.length) return [];
  const recent = chat.messages
    .filter((m) => !m.error)
    .slice(-4)
    .map((m) => textOf(m))
    .join(' ');
  const q = new Set(words(recent));
  const names = new Set((recent.match(/\b\p{Lu}\p{Ll}{2,}/gu) || []).map((w) => w.toLowerCase()));
  const scored = facts.map((f, i) => {
    let s = 0;
    for (const w of new Set(words(f.text))) if (q.has(w)) s += names.has(w) ? 2 : 1;
    if (f.about && names.has(f.about.toLowerCase().split(/\s+/)[0])) s += 1;
    return { f, s, i };
  });
  const pinned = scored.filter((x) => x.f.pinned);
  const hits = scored.filter((x) => !x.f.pinned && x.s > 0).sort((a, b) => b.s - a.s || b.i - a.i);
  let pick = [...pinned, ...hits];
  if (pick.length < 3) pick.push(...scored.filter((x) => !pick.includes(x)).sort((a, b) => b.i - a.i).slice(0, 3 - pick.length));
  const out = [];
  let used = 0;
  for (const { f } of pick) {
    const t = estimateTokens(f.text) + 2;
    if (out.length >= max || (out.length && used + t > tokens)) break;
    out.push(f);
    used += t;
  }
  return out;
}

// The prompt layer.
export function recallLayer(chat, youName) {
  const got = recall(chat);
  if (!got.length) return '';
  return `What you remember from earlier in this story (true; bring it up naturally when it matters, never list it):\n${got.map((f) => '- ' + f.text).join('\n')}`;
}

// ---------- by hand (Memory) ----------
export function addFact(chat, text, about = '') {
  chat.facts ||= [];
  const f = { id: uid(), text: str(text).slice(0, 400), about: str(about).slice(0, 40), msgId: null, at: Date.now(), auto: false };
  chat.facts.push(f);
  return f;
}
export function editFact(chat, id, text) {
  const f = (chat.facts || []).find((x) => x.id === id);
  if (f && str(text)) (f.text = str(text).slice(0, 400)), (f.edited = true);
  return f;
}
export const removeFact = (chat, id) => (chat.facts = (chat.facts || []).filter((f) => f.id !== id));
export function togglePin(chat, id) {
  const f = (chat.facts || []).find((x) => x.id === id);
  if (f) f.pinned = !f.pinned;
  return f;
}
// Grouped for the Memory screen: one group per person, then the world.
export function factGroups(chat) {
  const g = new Map();
  for (const f of chat.facts || []) {
    const k = f.about || '';
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(f);
  }
  return [...g.entries()].sort((a, b) => (a[0] === '') - (b[0] === '') || b[1].length - a[1].length);
}
