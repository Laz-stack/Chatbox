// Route map, Bonds and Diary.
// - Route map: the story's key moments ("stations"), each tied to a message.
// - Bonds: how each character feels about you (trust, affection, tension, 0–100), with why it changed.
// - Diary: a character's private entry about recent events, in their own voice.
// Stations and bonds come from one short background AI call after every couple of replies
// (or "Update the map"); the diary is written on request.
import { complete, PROVIDERS } from './providers.js';
import { extractJson, compileSheet } from './blueprint.js';
import { textOf, named } from './store.js';
import { uid } from './util.js';

export const KINDS = { meet: 'First meeting', secret: 'Secret', fight: 'Fight', place: 'New place', turn: 'Turning point', closer: 'Closer', loss: 'Loss', mark: 'Marked by you' };
export const BOND_KEYS = [['trust', 'Trust'], ['affection', 'Affection'], ['tension', 'Tension']];
const MAX_STEP = 20; // a single read never moves a value further than this
const CHUNK = 24; // messages per AI call

const str = (v) => (v == null ? '' : String(v).trim());
const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const firstName = (n) => str(n).split(/\s+/)[0].toLowerCase();
export const isDemo = (conn) => !conn || PROVIDERS[conn.provider]?.format === 'demo';
export const trackingOn = (settings) => settings.chronicle !== false;

// Who a name from the AI refers to, among the cast.
const castByName = (cast, name) => {
  const n = str(name).toLowerCase();
  return n ? cast.find((p) => p.name.trim().toLowerCase() === n) || cast.find((p) => firstName(p.name) === firstName(n)) || null : null;
};
const speakerName = (m, cast, you) => (m.role === 'user' ? (m.as ? cast.find((p) => p.id === m.as)?.name : you) || you : cast.find((p) => p.id === m.speaker)?.name || (cast.length === 1 ? cast[0].name : 'Scene'));

// "[#12] Mirelle: …" lines, numbered by position in the chat (1-based).
function transcript(chat, from, to, cast, persona) {
  const you = persona?.name?.trim() || 'User';
  return chat.messages
    .slice(from, to)
    .map((m, k) => {
      if (m.dir) return '';
      const t = named(textOf(m), cast.find((p) => p.id === m.speaker) || cast[0], you, persona).replace(/\s+\n/g, '\n').trim();
      return t ? `[#${from + k + 1}] ${speakerName(m, cast, you)}: ${t.slice(0, 1400)}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// True when enough has happened since the last read for an automatic one.
// After a failed read, wait a few more messages before trying again.
export const chronicleDue = (chat) =>
  chat.messages.slice(chat.chron?.upto || 0).filter((m) => m.role === 'assistant').length >= 2 && chat.messages.length - (chat.chron?.failAt || 0) >= 4;
export const unread = (chat) => chat.messages.length - (chat.chron?.upto || 0);

// Read new messages and update stations and bonds. whole: start from the beginning (in chunks).
// Returns { stations: [...new], changes: [{ who, d: {trust: 8}, why }] }.
// One read at a time per chat: a second call while one runs gets the same result.
const running = new Map();
export function chronicle(opts) {
  const id = opts.chat.id;
  if (running.has(id)) return running.get(id);
  const p = read(opts).finally(() => running.delete(id));
  running.set(id, p);
  return p;
}
async function read({ chat, cast, persona, conn, settings, whole = false, signal, onStep }) {
  chat.route ||= [];
  chat.bonds ||= {};
  const len = chat.messages.length;
  let from = whole ? 0 : chat.chron?.upto || 0;
  // An automatic read of a long unread stretch only looks at the latest part.
  if (!whole) from = Math.max(from, len - CHUNK);
  const out = { stations: [], changes: [] };
  // If any part fails, put everything back as it was.
  const before = structuredClone({ route: chat.route, bonds: chat.bonds });
  try {
    if (whole) chat.route = chat.route.filter((s) => !s.auto);
    for (let a = from; a < len; a += CHUNK) {
      const b = Math.min(len, a + CHUNK);
      onStep?.(a, len);
      const res = isDemo(conn) ? demoRead(chat, a, b, cast) : await readPart({ chat, cast, persona, conn, settings, a, b, signal });
      apply(chat, res, cast, a, b, out);
    }
  } catch (e) {
    chat.route = before.route;
    chat.bonds = before.bonds;
    chat.chron = { ...(chat.chron || {}), failAt: chat.messages.length };
    throw e;
  }
  chat.chron = { upto: len, at: Date.now(), whole: whole || chat.chron?.whole || from === 0 };
  return out;
}

async function readPart({ chat, cast, persona, conn, signal, a, b }) {
  const you = persona?.name?.trim() || 'the user';
  const bonds = Object.fromEntries(cast.map((p) => [p.name, chat.bonds[p.id] ? pick(chat.bonds[p.id]) : 'not set yet']));
  const brief = {
    cast: cast.map((p) => ({ name: p.name, about: str(p.tagline).slice(0, 160) })),
    user: you,
    bonds_now: bonds,
    stations_so_far: chat.route.slice(-8).map((s) => s.title),
    story_part: transcript(chat, a, b, cast, persona),
  };
  const system = 'You keep continuity notes for an ongoing roleplay story. Reply with ONE JSON object and nothing else. Every character is an adult.';
  const ask =
    `Return {"stations":[{"msg":12,"title":"...","kind":"...","line":"...","who":"..."}],"bonds":[{"who":"...","trust":0,"affection":0,"tension":0,"view":"...","why":"..."}]}.\n` +
    `stations: only real turning points in this part of the story, usually 0 or 1, at most 2. Count a first meeting, a secret revealed, a fight, an important new place, a decision that changes things, two people getting closer, or a loss. Skip small talk and anything already in stations_so_far. ` +
    `msg is the [#n] number where it happens. title: 3 to 6 words, no quotes. kind: one of meet, secret, fight, place, turn, closer, loss. line: one sentence under 16 words saying what happened. who: the cast member it centres on, or "".\n` +
    `bonds: for each cast member who dealt with ${you} in this part, how they feel about ${you} now, 0 to 100 each (trust, affection, tension). Values change gradually: usually a few points, at most 15, unless something major happened. If a bond is "not set yet", judge starting values from who they are and the story so far. ` +
    `view: one sentence, third person, how they see ${you} now. why: under 10 words, what caused the change, speaking to the user as "you" (for example "you told her the truth"). Leave bonds empty if nothing changed.`;
  const text = await complete(conn, { system, messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 600, temperature: 0.4, signal });
  return extractJson(text);
}

const pick = (b) => ({ trust: b.trust, affection: b.affection, tension: b.tension, view: b.view || '' });

function apply(chat, res, cast, a, b, out) {
  for (const s of Array.isArray(res?.stations) ? res.stations.slice(0, 2) : []) {
    const n = Math.round(Number(s.msg)) - 1;
    if (!(n >= a && n < b)) continue;
    const m = chat.messages[n];
    const title = str(s.title).replace(/^["“]|["”]$/g, '').slice(0, 60);
    if (!m || !title || chat.route.some((x) => x.msgId === m.id || x.title.toLowerCase() === title.toLowerCase())) continue;
    const st = { id: uid(), msgId: m.id, title, kind: KINDS[s.kind] ? s.kind : 'turn', line: str(s.line).slice(0, 160), who: castByName(cast, s.who)?.id || null, auto: true, at: Date.now() };
    chat.route.push(st);
    out.stations.push(st);
  }
  sortRoute(chat);
  const lastId = chat.messages[b - 1]?.id;
  for (const r of Array.isArray(res?.bonds) ? res.bonds : []) {
    const p = castByName(cast, r.who);
    if (!p) continue;
    const prev = chat.bonds[p.id];
    if (prev?.locked) continue;
    const next = {};
    const d = {};
    for (const [k] of BOND_KEYS) {
      const v = clamp(r[k] ?? prev?.[k] ?? 0);
      next[k] = prev ? Math.max(prev[k] - MAX_STEP, Math.min(prev[k] + MAX_STEP, v)) : v;
      if (prev && next[k] !== prev[k]) d[k] = next[k] - prev[k];
    }
    const why = str(r.why).slice(0, 80);
    const bond = { ...(prev || {}), ...next, view: str(r.view).slice(0, 200) || prev?.view || '', log: prev?.log || [] };
    if (!prev) bond.log.unshift({ msgId: lastId, at: Date.now(), first: true, why: 'First read' });
    else if (Object.keys(d).length) {
      bond.log.unshift({ msgId: lastId, at: Date.now(), d, why });
      out.changes.push({ who: p.id, d, why });
    }
    bond.log = bond.log.slice(0, 30);
    chat.bonds[p.id] = bond;
  }
}

export function sortRoute(chat) {
  const pos = new Map(chat.messages.map((m, i) => [m.id, i]));
  chat.route = (chat.route || []).filter((s) => pos.has(s.msgId)).sort((x, y) => pos.get(x.msgId) - pos.get(y.msgId));
}

// "Trust ↑8, Tension ↓5"
export const changeText = (d) =>
  BOND_KEYS.filter(([k]) => d?.[k])
    .map(([k, label]) => `${label} ${d[k] > 0 ? '↑' : '↓'}${Math.abs(d[k])}`)
    .join(', ');

// The prompt layer: how the cast feels about you right now.
export function bondsLayer(chat, people, youName) {
  const rows = people
    .filter((p) => chat.bonds?.[p.id])
    .map((p) => {
      const b = chat.bonds[p.id];
      return `- ${p.name}: trust ${b.trust}, affection ${b.affection}, tension ${b.tension}.${b.view ? ` ${b.view}` : ''}`;
    });
  return rows.length ? `How the characters feel about ${youName} right now (0 to 100). Let this shape how they act toward ${youName}; it changes only gradually:\n${rows.join('\n')}` : '';
}

// Undo what a read attached to one reply (when that reply is regenerated or deleted).
export function undoReply(chat, m) {
  for (const x of m.chron?.bonds || []) {
    const b = chat.bonds?.[x.who];
    if (!b || b.locked) continue;
    for (const [k] of BOND_KEYS) if (x.d?.[k]) b[k] = clamp(b[k] - x.d[k]);
    const at = b.log.findIndex((l) => l.d && l.msgId === m.id);
    if (at >= 0) b.log.splice(at, 1);
  }
  delete m.chron;
}
// Bonds as they stood at a point in the chat: changes logged after it are taken back.
export function bondsAt(bonds, ids) {
  const out = {};
  for (const [id, b0] of Object.entries(bonds || {})) {
    const b = structuredClone(b0);
    b.log = b.log.filter((l) => {
      if (ids.has(l.msgId)) return true;
      for (const [k] of BOND_KEYS) if (l.d?.[k]) b[k] = clamp(b[k] - l.d[k]);
      return false;
    });
    if (b.log.some((l) => l.first)) out[id] = b;
  }
  return out;
}

// Mark a message as a station by hand.
export function markStation(chat, m, title) {
  chat.route ||= [];
  if (chat.route.some((s) => s.msgId === m.id)) return null;
  const st = { id: uid(), msgId: m.id, title: str(title).slice(0, 60) || 'A moment', kind: 'mark', line: '', who: m.speaker || null, auto: false, at: Date.now() };
  chat.route.push(st);
  sortRoute(chat);
  return st;
}

// ---------- Diary ----------
export async function writeDiary({ chat, who, cast, persona, conn, settings, signal }) {
  const named_ = persona?.name?.trim();
  const you = named_ || 'you';
  const last = (chat.diary || []).filter((e) => e.who === who.id).pop();
  const lastIdx = last ? chat.messages.findIndex((m) => m.id === last.msgId) + 1 : 0;
  const from = Math.max(lastIdx, chat.messages.length - 30);
  const end = chat.messages.length;
  let entry;
  if (isDemo(conn)) entry = demoDiary(who, you);
  else {
    const b = chat.bonds?.[who.id];
    const brief = {
      you_are: who.name,
      who_you_are: named(compileSheet(who), who, you, persona).slice(0, 2500),
      story_so_far: chat.summary?.text || '',
      how_you_feel_about: b ? { [you]: pick(b) } : {},
      your_last_entry: last ? last.text.slice(0, 900) : '',
      recent_events: transcript(chat, from, end, cast, persona),
    };
    const system =
      `You write a private diary entry in the voice of ${who.name}, a character in an ongoing roleplay story. Reply with ONE JSON object and nothing else. Every character is an adult.` +
      (settings?.mature ? '' : ' Keep it free of explicit sexual content.');
    const ask =
      `Return {"title":"...","text":"..."}. text: first person, as ${who.name}, 90 to 180 words about the recent events from their point of view: what they noticed, what they felt, what they did not say out loud, and what they hope or fear next. ` +
      `Use their own voice and vocabulary. ${named_ ? `Call the user ${you}.` : 'Refer to the user as "you", as if writing to them.'} Plain paragraphs separated by a blank line: no asterisks, no quotation-style dialogue, no date line. Do not repeat the last entry. title: 2 to 4 words naming the moment, for example "The rain".`;
    const text = await complete(conn, { system, messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 700, temperature: 0.9, signal });
    const j = extractJson(text);
    entry = { title: str(j.title).replace(/^["“]|["”]$/g, '').slice(0, 50), text: str(j.text).replace(/\*/g, '').slice(0, 2400) };
    if (!entry.text) throw new Error('The diary came back empty. Try again.');
  }
  const e = { id: uid(), who: who.id, title: entry.title || 'Untitled', text: entry.text, msgId: chat.messages[end - 1]?.id || null, at: Date.now(), demo: !!entry.demo };
  (chat.diary ||= []).push(e);
  return e;
}

// ---------- Demo mode (no API key) ----------
function demoRead(chat, a, b, cast) {
  const lastAi = [...chat.messages.slice(a, b).entries()].reverse().find(([, m]) => m.role === 'assistant');
  const p = cast[0];
  const prev = chat.bonds[p.id];
  const words = (lastAi ? textOf(lastAi[1]) : '').replace(/^[^:\n]{1,30}:\s*/gm, '').replace(/[*"“”`_]/g, '').split(/[.!?]/)[0].split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  return {
    stations: lastAi && words && (!chat.route.length || b - a >= 6) ? [{ msg: a + lastAi[0] + 1, title: words, kind: chat.route.length ? 'turn' : 'meet', line: 'A moment from the demo story.', who: p.name }] : [],
    bonds: [{ who: p.name, trust: (prev?.trust ?? 30) + 4, affection: (prev?.affection ?? 20) + 2, tension: Math.max(0, (prev?.tension ?? 15) - 1), view: `${p.name} is getting used to having you around.`, why: 'you kept the conversation going' }],
  };
}
function demoDiary(who, you) {
  return {
    title: 'A quiet day',
    text: `Nothing dramatic happened today, and somehow that is what I keep thinking about. ${you[0].toUpperCase() + you.slice(1)} stayed longer than I expected. I talked more than I meant to.\n\nI am not sure what this is yet. I would like to find out.\n\n(Demo entry. Add your API key in Settings for real ones.)`,
    demo: true,
  };
}
