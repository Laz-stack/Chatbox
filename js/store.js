// App state, persisted to the browser. Everything lives on this device.
import * as db from './db.js';
import { uid, setImageResolver } from './util.js';
import { bondsAt } from './chronicle.js';
import { tiesAt } from './ties.js';
import { cleanState, cleanCharacter, cleanInterchange, cleanPersona } from './safe.js';

// A character's line colour. Never red (action) or yellow (selected): those mean something else in the app.
export const LINE_COLORS = ['#2EAA67', '#FB4DAA', '#FE6500', '#B8ACFE', '#065BFE', '#12A5A5', '#5BC2F2', '#8A5530', '#ECECEC'];
const RESERVED = ['#E70404', '#FDCD15'];

export const DEFAULT_GLOBAL =
  'Write actions in *asterisks* and dialogue in quotes. Keep replies under 120 words unless asked for more. Never speak or act for {{user}}. Stay in character.';

const DEFAULT_SETTINGS = {
  globalPrompt: DEFAULT_GLOBAL,
  globalOn: true,
  activeConnectionId: null,
  autoSummary: true,
  showCounter: true,
  readAloud: false,
  awayNotes: true,
  voiceURI: '',
  remindBackup: true,
  lastBackup: null,
  includeKeysInBackup: false,
  budget: null,
  seenChatTips: false,
  // 18+ content: off until the user confirms they are an adult (Depot › Content).
  mature: false,
  ageConfirmedAt: null,
  migrated: 0,
};

export const S = {
  settings: { ...DEFAULT_SETTINGS },
  // The default persona (who you are unless a chat picks someone else); all personas live in `personas`.
  persona: { id: 'me', name: '', about: '', avatarImage: null, preset: 'kai', color: '#065BFE', useEverywhere: true },
  personas: [],
  connections: [],
  characters: [],
  chats: new Map(),
  fares: { months: {} },
  interchanges: [],
  lore: [],
  // Pictures inside messages (from imported openings), saved so they show offline: { url: dataURL }.
  images: {},
};

export function newConnection(provider = 'anthropic') {
  return {
    id: uid(),
    name: '',
    provider,
    baseUrl: '',
    model: provider === 'anthropic' ? 'claude-sonnet-5-5' : '',
    apiKey: '',
    temperature: 0.9,
    maxTokens: 600,
    context: 16000,
    prompt: '',
    replaceGlobal: false,
    useProxy: false,
  };
}

// A filled-in character handed to the editor once (Build › From a picture).
let draft = null;
export const setDraft = (d) => (draft = d);
export const takeDraft = () => {
  const d = draft;
  draft = null;
  return d;
};
export function blankCharacter() {
  const used = new Set(S.characters.map((c) => c.line?.color));
  const color = LINE_COLORS.find((c) => !used.has(c)) || LINE_COLORS[S.characters.length % LINE_COLORS.length];
  const presets = ['mika', 'ren', 'sora', 'haru', 'yui'];
  return {
    id: uid(),
    name: '',
    tagline: '',
    persona: '',
    sheet: {},
    locks: [],
    mature: false,
    firstMessage: '',
    line: { letter: '', color },
    preset: presets[S.characters.length % presets.length],
    avatarImage: null,
    scene: 'cafe',
    sceneBlur: 4,
    sceneDim: 60,
    connectionId: null,
    useGlobal: true,
    stream: true,
    createdAt: Date.now(),
  };
}

function seedCharacter() {
  return {
    ...blankCharacter(),
    id: 'mika',
    name: 'Mika',
    tagline: 'Cafe by the station',
    persona:
      "You are {{char}}, a cheerful barista who runs a tiny cafe by the train station. You remember every regular's order, hum while you work, and get flustered by compliments. Speak warmly in short lines.",
    firstMessage: '*looks up from the counter* "Oh! You came back. Same window seat?"',
    line: { letter: 'M', color: '#2EAA67' },
    preset: 'mika',
    scene: 'cafe',
  };
}

function demoConnection() {
  return { ...newConnection('demo'), id: 'demo', name: 'Demo', model: 'canned replies' };
}

// True once saved data was read in full. Until then nothing may treat "not here" as "deleted"
// (Sync, tidying unused pictures).
export let loadedOk = false;
export async function load() {
  const loaded = await loadAll();
  loadedOk = true;
  // Anything that came in from outside (an old card import, a restore, Sync) is checked once more.
  if (cleanState(S)) await saveEverything();
  return loaded;
}
async function loadAll() {
  const all = new Map(await db.entries());
  if (all.has('settings')) S.settings = { ...DEFAULT_SETTINGS, ...all.get('settings') };
  if (all.has('persona')) S.persona = { ...S.persona, ...all.get('persona') };
  setupPersonas(all.get('personas'));
  if (all.has('fares')) S.fares = { months: {}, ...all.get('fares') };
  S.interchanges = all.get('interchanges') || [];
  S.lore = all.get('lore') || [];
  // Pictures: one entry each ('img:<key>'). Older data kept them all in one 'images' entry.
  const oldImages = all.get('images');
  S.images = { ...(oldImages || {}) };
  for (const [k, v] of all) if (typeof k === 'string' && k.startsWith(IMG)) S.images[k.slice(IMG.length)] = v;
  setImageResolver((url) => S.images[url] || url);
  S.connections = all.get('connections') || [];
  // Characters: one entry each ('char:<id>') plus their order. Older data kept them in one 'characters' entry.
  const oldChars = !all.has('charOrder') ? all.get('characters') : null;
  if (oldChars) S.characters = oldChars;
  else {
    const order = all.get('charOrder') || [];
    const byId = new Map();
    for (const [k, v] of all) if (typeof k === 'string' && k.startsWith(CHAR)) byId.set(k.slice(CHAR.length), v);
    S.characters = [...order.map((id) => byId.get(id)), ...[...byId].filter(([id]) => !order.includes(id)).map(([, v]) => v)].filter(Boolean);
  }
  S.chats = new Map();
  // Every chat has its own id. Older data keyed one chat per character; that chat keeps the character's id.
  for (const [k, v] of all) if (typeof k === 'string' && k.startsWith('chat:')) S.chats.set((v.id ||= k.slice(5)), v);
  // Move older single entries over only after everything is read. If the phone is too full to
  // write the new ones, the old entry stays as it is and the move is tried again next time.
  savedImg.clear();
  savedChar.clear();
  if (oldImages) {
    try {
      await saveImages();
      await db.del('images');
    } catch (e) {
      console.warn('Pictures stay in the older single entry for now', e);
    }
  } else for (const [k, v] of Object.entries(S.images)) savedImg.set(k, v);
  if (oldChars) {
    try {
      await saveCharacters();
      await db.del('characters');
    } catch (e) {
      console.warn('Characters stay in the older single entry for now', e);
    }
  } else for (const c of S.characters) savedChar.set(c.id, JSON.stringify(c));
  await giveChatsOwnIds();

  if (!all.has('seeded')) {
    if (!S.connections.length) S.connections = [demoConnection()];
    if (!S.characters.length) S.characters = [seedCharacter()];
    S.settings.activeConnectionId = S.connections[0].id;
    await Promise.all([saveConnections(), saveCharacters(), saveSettings(), db.set('seeded', true)]);
  }
  // One-time: API keys used to go into backups by default. Turn that off for existing data too
  // (it can be switched back on in Backup); people share backup files more often than they think.
  if ((S.settings.migrated || 0) < 1) {
    S.settings.includeKeysInBackup = false;
    S.settings.migrated = 1;
    await saveSettings();
  }
  // One-time: characters on red or yellow lines move to a free line colour.
  if ((S.settings.migrated || 0) < 2) {
    const used = new Set(S.characters.map((c) => c.line?.color));
    for (const c of S.characters) {
      if (!RESERVED.includes((c.line?.color || '').toUpperCase())) continue;
      const free = LINE_COLORS.find((x) => !used.has(x)) || LINE_COLORS[S.characters.indexOf(c) % LINE_COLORS.length];
      used.add(free);
      c.line = { ...c.line, color: free };
    }
    S.settings.migrated = 2;
    await Promise.all([saveCharacters(), saveSettings()]);
  }
  if (!S.connections.find((c) => c.id === S.settings.activeConnectionId)) {
    S.settings.activeConnectionId = S.connections[0]?.id || null;
  }
}

// Older data stored one chat per character under the character's own id. Give each its own chat id
// ("<characterId>~1"), keeping every message, note and star.
async function giveChatsOwnIds() {
  for (const c of [...S.chats.values()]) {
    if (c.id !== c.characterId || c.id.startsWith('ix-')) continue;
    const old = c.id;
    c.id = `${old}~1`;
    S.chats.delete(old);
    S.chats.set(c.id, c);
    await db.set('chat:' + c.id, c);
    await db.del('chat:' + old);
  }
}

export const saveSettings = () => db.set('settings', S.settings);
export const savePersona = () => Promise.all([db.set('persona', S.persona), db.set('personas', S.personas)]);

// ---------- Personas: who you play. One is the default; a chat can pick another. ----------
function setupPersonas(list) {
  S.persona.id ||= 'me';
  S.personas = list?.length ? list : [S.persona];
  S.persona = S.personas.find((p) => p.id === (S.settings.personaId || S.persona.id)) || S.personas[0];
}
export const personaById = (id) => S.personas.find((p) => p.id === id) || null;
// Who you are in this chat.
export const personaFor = (chat) => (chat?.personaId && personaById(chat.personaId)) || S.persona;
export function newPersona() {
  const n = S.personas.length;
  return { id: 'p-' + uid(), name: '', about: '', avatarImage: null, preset: ['haru', 'sora', 'yui', 'ren', 'mika', 'kai'][n % 6], color: ['#065BFE', '#FB4DAA', '#2EAA67', '#B8ACFE', '#FE6500', '#E70404'][n % 6], useEverywhere: true };
}
export async function savePersonaEntry(p) {
  cleanPersona(p);
  p.updatedAt = Date.now(); // lets Sync tell which edit is newer
  const i = S.personas.findIndex((x) => x.id === p.id);
  if (i >= 0) Object.assign(S.personas[i], p);
  else S.personas.push(p);
  await savePersona();
}
export async function setDefaultPersona(id) {
  const p = personaById(id);
  if (!p) return;
  S.persona = p;
  S.settings.personaId = id;
  await Promise.all([saveSettings(), savePersona()]);
}
export async function deletePersona(id) {
  if (S.personas.length < 2) return;
  S.personas = S.personas.filter((p) => p.id !== id);
  if (S.persona.id === id) (S.persona = S.personas[0]), (S.settings.personaId = S.persona.id);
  const touched = [...S.chats.values()].filter((c) => c.personaId === id);
  touched.forEach((c) => delete c.personaId);
  await Promise.all([saveSettings(), savePersona(), ...touched.map((c) => saveChat(c, false))]);
}
export const saveConnections = () => db.set('connections', S.connections);
// Characters are written one entry each, and only the ones that changed (an avatar picture
// isn't rewritten every time any character is saved).
const CHAR = 'char:';
const savedChar = new Map(); // id -> the JSON last written
export async function saveCharacters() {
  const ids = S.characters.map((c) => c.id);
  const jobs = [];
  for (const c of S.characters) {
    const j = JSON.stringify(c);
    if (savedChar.get(c.id) === j) continue;
    savedChar.set(c.id, j);
    jobs.push(db.set(CHAR + c.id, c).catch((e) => (savedChar.delete(c.id), Promise.reject(e))));
  }
  for (const id of [...savedChar.keys()]) if (!ids.includes(id)) savedChar.delete(id), jobs.push(db.del(CHAR + id));
  jobs.push(db.set('charOrder', ids));
  await Promise.all(jobs);
}
export const saveFares = () => db.set('fares', S.fares);
export const saveInterchanges = () => db.set('interchanges', S.interchanges);
export const saveLore = () => db.set('lore', S.lore);
// Pictures are written one entry each, and only new or changed ones; removed ones are deleted.
const IMG = 'img:';
const savedImg = new Map(); // key -> the picture last written
export async function saveImages() {
  const jobs = [];
  for (const [k, v] of Object.entries(S.images)) {
    if (savedImg.get(k) === v) continue;
    savedImg.set(k, v);
    jobs.push(db.set(IMG + k, v).catch((e) => (savedImg.delete(k), Promise.reject(e))));
  }
  for (const k of [...savedImg.keys()]) if (!(k in S.images)) savedImg.delete(k), jobs.push(db.del(IMG + k));
  await Promise.all(jobs);
}

// ---------- Lorebook: world info that joins the prompt when its keywords come up ----------
export const newLore = () => ({ id: 'lore-' + uid(), title: '', keys: [], text: '', scope: 'all', lines: [], always: false, on: true, createdAt: Date.now() });
export const loreEntry = (id) => S.lore.find((e) => e.id === id) || null;
export async function saveLoreEntry(e) {
  e.updatedAt = Date.now(); // lets Sync tell which edit is newer
  const i = S.lore.findIndex((x) => x.id === e.id);
  if (i >= 0) S.lore[i] = e;
  else S.lore.unshift(e);
  await saveLore();
}
export async function deleteLoreEntry(id) {
  S.lore = S.lore.filter((e) => e.id !== id);
  await saveLore();
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Entries for these characters whose keywords appear in `text` (whole words, any case), plus always-on ones.
export function matchLore(text, lineIds) {
  const t = (text || '').toLowerCase();
  return S.lore.filter((e) => {
    if (!e.on || !e.text?.trim()) return false;
    if ((S.settings.booksOff || []).includes(e.book || '')) return false;
    if (e.scope === 'lines' && !e.lines.some((id) => lineIds.includes(id))) return false;
    if (e.always) return true;
    return e.keys.some((k) => k.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(k.trim().toLowerCase())}($|[^\\p{L}\\p{N}])`, 'u').test(t));
  });
}

// ---------- Interchanges: group chats where 2–3 lines meet ----------
export const isInterchangeId = (id) => typeof id === 'string' && id.startsWith('ix-');
// The interchange with its member characters resolved (members that were deleted drop out).
export function interchange(id) {
  const ix = S.interchanges.find((x) => x.id === id);
  if (!ix) return null;
  const members = ix.members.map((m) => S.characters.find((c) => c.id === m)).filter(Boolean);
  return members.length ? { ...ix, people: members, title: ix.name?.trim() || members.map((c) => c.name).join(' × ') } : null;
}
export async function saveInterchange(ix) {
  cleanInterchange(ix);
  ix.updatedAt = Date.now(); // lets Sync tell which edit is newer
  const i = S.interchanges.findIndex((x) => x.id === ix.id);
  if (i >= 0) S.interchanges[i] = ix;
  else S.interchanges.push(ix);
  await saveInterchanges();
}
export async function deleteInterchange(id) {
  S.interchanges = S.interchanges.filter((x) => x.id !== id);
  S.chats.delete(id);
  await Promise.all([saveInterchanges(), db.del('chat:' + id)]);
}

// ---------- Fares: tokens per connection and per line, by calendar month ----------
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Cost bookkeeping on one record. `cost`/`costN`: dollars the provider reported (OpenRouter
// reports what it bills for each request); `uin`/`uout`: tokens with no reported cost, priced
// with the connection's typed prices. Records from before this kept only tokens: those become
// unreported tokens the first time they are touched.
export function costShape(o) {
  if (o.costN == null) (o.costN = 0), (o.cost = 0), (o.uin = o.in || 0), (o.uout = o.out || 0);
  return o;
}
function addCost(o, inTok, outTok, cost) {
  costShape(o);
  o.in = (o.in || 0) + inTok;
  o.out = (o.out || 0) + outTok;
  if (cost != null && Number.isFinite(+cost)) (o.cost += +cost), o.costN++;
  else (o.uin += inTok), (o.uout += outTok);
}
// A cost that came in late (a stopped reply, looked up afterwards): those tokens are no longer unpriced.
function settleCost(o, inTok, outTok, u) {
  if (!o) return;
  costShape(o);
  o.uin = Math.max(0, o.uin - inTok);
  o.uout = Math.max(0, o.uout - outTok);
  o.in = Math.max(0, o.in + (u.inTok ?? inTok) - inTok);
  o.out = Math.max(0, o.out + (u.outTok ?? outTok) - outTok);
  o.cost += +u.cost;
  o.costN++;
}

// One request's meter: pass `onUsage` to complete(), then `commit` with what to record.
// `commit(write)` calls write(inTok, outTok, cost) with the provider's numbers when it sent them,
// and a cost that arrives later (a stopped OpenRouter reply) settles the same record.
export function meter() {
  let use = null;
  let settle = null;
  return {
    onUsage(u) {
      if (u.late && settle) settle(u);
      else use = u;
    },
    get usage() {
      return use;
    },
    async commit(inTok, outTok, write) {
      const i = use?.inTok ?? inTok;
      const o = use?.outTok ?? outTok;
      const fn = await write(i, o, use?.cost ?? null);
      if (use?.cost == null && typeof fn === 'function') settle = (u) => u.cost != null && fn(i, o, u);
    },
  };
}

// Record one journey (a reply): input and output tokens (the provider's count when it sent one,
// else estimated) and its cost when reported, against its connection and line.
export async function recordFare(conn, lineId, inTok, outTok, cost = null) {
  if (!conn) return;
  const k = monthKey();
  const mo = (S.fares.months[k] ||= { conns: {}, lines: {} });
  const c = (mo.conns[conn.id] ||= { name: '', model: '', in: 0, out: 0, rides: 0 });
  c.name = conn.name || conn.provider;
  c.model = conn.provider === 'demo' ? 'Demo replies' : conn.model;
  c.rides++;
  const l = (mo.lines[lineId] ||= { in: 0, out: 0, byConn: {} });
  const lc = (l.byConn[conn.id] ||= { in: 0, out: 0 });
  for (const o of [c, l, lc]) addCost(o, inTok, outTok, cost);
  await saveFares();
  return async (i, o, u) => {
    const m = S.fares.months[k];
    const ln = m?.lines[lineId];
    for (const x of [m?.conns[conn.id], ln, ln?.byConn[conn.id]]) settleCost(x, i, o, u);
    await saveFares();
  };
}

// Background jobs (the Helper receipt): tokens per connection and how many of each job.
export async function recordJob(conn, job, inTok, outTok, cost = null) {
  if (!conn) return;
  const k = monthKey();
  const mo = (S.fares.months[k] ||= { conns: {}, lines: {} });
  const h = (mo.helper ||= { conns: {} });
  const c = (h.conns[conn.id] ||= { name: '', model: '', in: 0, out: 0, calls: 0, jobs: {} });
  c.name = conn.name || conn.provider;
  c.model = conn.provider === 'demo' ? 'Demo' : conn.model;
  addCost(c, inTok, outTok, cost);
  c.calls++;
  c.jobs[job] = (c.jobs[job] || 0) + 1;
  await saveFares();
  return async (i, o, u) => {
    settleCost(S.fares.months[k]?.helper?.conns[conn.id], i, o, u);
    await saveFares();
  };
}
// Pictures (the Scenes receipt): count per connection and model; `cost` is what the provider
// reported (OpenRouter), else null and Pictures › price per picture is used.
export async function recordPicture(conn, model, cost, lineId, price = null) {
  if (!conn) return;
  const mo = (S.fares.months[monthKey()] ||= { conns: {}, lines: {} });
  const p = (mo.pics ||= { conns: {}, lines: {} });
  const key = conn.id + '|' + model;
  // `known`: pictures whose cost the provider reported; `est`/`estN`: priced with your price per picture at the time.
  const add = (o) => {
    o.n++;
    if (cost != null) (o.cost += cost), o.known++;
    else if (price != null) (o.est = (o.est || 0) + price), (o.estN = (o.estN || 0) + 1);
  };
  const c = (p.conns[key] ||= { name: '', model, n: 0, cost: 0, known: 0 });
  c.name = conn.name || conn.provider;
  add(c);
  if (lineId) add((p.lines[lineId] ||= { n: 0, cost: 0, known: 0 }));
  await saveFares();
}

// Dollars for a token count on a connection, or null when that connection has no prices set.
export function fareCost(connId, inTok, outTok) {
  if (!inTok && !outTok) return 0;
  const c = connection(connId);
  if (c?.provider === 'demo') return 0;
  if (!c || c.priceIn == null || c.priceOut == null || c.priceIn === '' || c.priceOut === '') return null;
  return (inTok * +c.priceIn + outTok * +c.priceOut) / 1e6;
}
// What a record cost: reported dollars plus unreported tokens at typed prices.
// { cost, est } where est is true when part of it is priced from typed prices; cost null when
// some tokens have no price at all.
export function costOf(o, connId) {
  if (!o) return { cost: 0, est: false, unpriced: false };
  const r = costShape({ ...o });
  const rest = fareCost(connId, r.uin, r.uout);
  const unpriced = rest == null;
  return { cost: unpriced ? (r.costN ? r.cost : null) : r.cost + rest, est: !!(r.uin || r.uout) && !unpriced && connection(connId)?.provider !== 'demo', unpriced: unpriced && !!(r.uin || r.uout), reported: r.costN };
}

export const character = (id) => S.characters.find((c) => c.id === id);
export const connection = (id) => S.connections.find((c) => c.id === id);
export const activeConnection = () => connection(S.settings.activeConnectionId) || S.connections[0] || null;
export const connectionFor = (ch) => (ch?.connectionId && connection(ch.connectionId)) || activeConnection();

export async function saveCharacter(ch) {
  cleanCharacter(ch);
  ch.updatedAt = Date.now(); // lets Sync tell which edit is newer
  const i = S.characters.findIndex((c) => c.id === ch.id);
  if (i >= 0) S.characters[i] = ch;
  else S.characters.push(ch);
  await saveCharacters();
}

export async function deleteCharacter(id) {
  S.characters = S.characters.filter((c) => c.id !== id);
  const gone = chatsFor(id).map((c) => c.id);
  gone.forEach((cid) => S.chats.delete(cid));
  await Promise.all(gone.map((cid) => db.del('chat:' + cid)));
  S.interchanges.forEach((x) => (x.members = x.members.filter((m) => m !== id)));
  await Promise.all([saveCharacters(), saveInterchanges(), db.del('chat:' + id)]);
}

export async function saveConnection(c) {
  c.updatedAt = Date.now(); // lets Sync tell which edit is newer
  const i = S.connections.findIndex((x) => x.id === c.id);
  if (i >= 0) S.connections[i] = c;
  else S.connections.push(c);
  await saveConnections();
}

export async function deleteConnection(id) {
  S.connections = S.connections.filter((c) => c.id !== id);
  if (S.settings.activeConnectionId === id) S.settings.activeConnectionId = S.connections[0]?.id || null;
  if (S.settings.helperId === id) S.settings.helperId = null;
  S.characters.forEach((c) => {
    if (c.connectionId === id) c.connectionId = null;
  });
  await Promise.all([saveConnections(), saveSettings(), saveCharacters()]);
}

// Messages keep every alternate reply in `alts`; `alt` is the one shown.
export const textOf = (m) => (m ? m.alts[m.alt] ?? '' : '');

// Fill {{char}} and {{user}} (any case, spaces allowed) with real names, for showing a message.
// Messages keep the placeholders, so renaming yourself later still shows the new name.
// {{char}} and {{user}}, and the spellings older cards use: {char}, {user}, <BOT>, <USER>.
export const named = (text, ch, userFallback = 'you', persona = S.persona) => {
  const c = ch?.name || 'Character';
  const u = persona?.name?.trim() || userFallback;
  return (text || '').replace(/\{\{?\s*char\s*\}?\}|<\s*bot\s*>/gi, c).replace(/\{\{?\s*user\s*\}?\}|<\s*user\s*>/gi, u);
};
// The shown text of a message.
export const shownText = (m, ch) => named(textOf(m), ch);

// A character can have many chats, each "<characterId>~<random>", so a character id always means
// "their most recent chat" and a chat id always means that exact chat. An interchange's chat keeps its id.
export function newChat(charId, id = charId.startsWith('ix-') ? charId : `${charId}~${uid()}`) {
  const ch = character(charId);
  const ix = !ch && S.interchanges.find((x) => x.id === charId);
  const messages = [];
  // Every opening is a swipe on the first message (like SillyTavern): pick where the story starts.
  if (ch?.firstMessage?.trim()) {
    messages.push({ id: uid(), role: 'assistant', alts: [ch.firstMessage, ...(ch.greetings || []).filter((g) => g?.trim())], alt: 0, mood: 'happy', at: Date.now(), first: true });
  } else if (ix?.openings?.length) {
    messages.push({ id: uid(), role: 'assistant', alts: [...ix.openings], alt: 0, at: Date.now(), first: true });
  }
  return { id, characterId: charId, messages, summary: null, notes: [], updatedAt: Date.now(), startedAt: Date.now() };
}

// All chats with one character (or interchange), most recent first.
// A new chat that starts as a copy of this one up to message i (Branch from here).
export async function branchChat(chat, i) {
  const c = newChat(chat.characterId, `${chat.characterId}~${uid()}`);
  c.messages = structuredClone(chat.messages.slice(0, i + 1));
  c.notes = structuredClone(chat.notes || []);
  if (chat.personaId) c.personaId = chat.personaId;
  if (chat.summary && chat.summary.upto <= i + 1) c.summary = structuredClone(chat.summary);
  const ids = new Set(c.messages.map((m) => m.id));
  if (chat.route) c.route = structuredClone(chat.route.filter((s) => ids.has(s.msgId)));
  if (chat.chapters) c.chapters = structuredClone(chat.chapters.filter((x) => ids.has(x.msgId)));
  if (chat.marks) c.marks = structuredClone(chat.marks.filter((x) => ids.has(x.msgId)));
  if (chat.facts) c.facts = structuredClone(chat.facts.filter((x) => !x.msgId || ids.has(x.msgId)));
  if (chat.bonds) c.bonds = bondsAt(chat.bonds, ids);
  if (chat.ties) c.ties = tiesAt(chat.ties, ids);
  if (chat.diary) c.diary = structuredClone(chat.diary.filter((e) => ids.has(e.msgId)));
  if (chat.chron) c.chron = { ...chat.chron, upto: Math.min(chat.chron.upto || 0, i + 1) };
  c.branchOf = { chat: chat.id, at: chat.messages[i].id };
  await saveChat(c);
  return c;
}
export const chatsFor = (ownerId) => [...S.chats.values()].filter((c) => c.characterId === ownerId).sort((a, b) => b.updatedAt - a.updatedAt);
export const latestChat = (ownerId) => chatsFor(ownerId)[0] || null;

// A chat id opens that chat; a character or interchange id opens its most recent chat (creating one if none).
export async function getChat(id) {
  const isOwner = !!character(id) || S.interchanges.some((x) => x.id === id);
  if (isOwner) {
    const latest = latestChat(id);
    if (latest) return latest;
  } else if (S.chats.has(id)) return S.chats.get(id);
  if (!character(id) && !S.interchanges.some((x) => x.id === id)) return null;
  const c = newChat(id);
  S.chats.set(c.id, c);
  await db.set('chat:' + c.id, c);
  return c;
}

export async function saveChat(chat, touch = true) {
  if (touch) chat.updatedAt = Date.now();
  chat.id ||= chat.characterId;
  S.chats.set(chat.id, chat);
  await db.set('chat:' + chat.id, chat);
}

// A fresh chat with the same character; the old ones stay.
export async function startNewChat(charId) {
  const c = newChat(charId, `${charId}~${uid()}`);
  await saveChat(c);
  return c;
}

export async function deleteChat(chatId) {
  S.chats.delete(chatId);
  await db.del('chat:' + chatId);
}

export async function resetChat(charId) {
  const c = newChat(charId);
  const old = S.chats.get(charId);
  if (old) c.notes = old.notes; // pinned notes survive a fresh start
  await saveChat(c);
  return c;
}

// A chat has "started" once the user has said something.
export const hasStarted = (chat) => !!chat && chat.messages.some((m) => m.role === 'user');

// Chats that have started, newest first: [{ c, chat }] for characters.
// Interchange items carry `ix` (with .people and .title) and `c` = their first member.
export function departures() {
  const lines = S.characters.flatMap((c) => chatsFor(c.id).map((chat) => ({ c, chat })));
  const groups = S.interchanges
    .map((x) => interchange(x.id))
    .filter(Boolean)
    .map((ix) => ({ ix, c: ix.people[0], chat: latestChat(ix.id) }));
  return [...lines, ...groups].filter((x) => hasStarted(x.chat) && !isHidden(x)).sort((a, b) => b.chat.updatedAt - a.chat.updatedAt);
}

// Hidden: off Platform and Lines (nothing is deleted); Lines lists them in a fold to bring back.
// A chat can be hidden on its own; hiding a character or group hides all its chats with it.
const isHidden = (x) => !!(x.chat?.hidden || (x.ix ? x.ix.hidden : x.c?.hidden));
// Started chats hidden on their own (their character or group still showing), newest first.
export function hiddenChats() {
  const lines = S.characters.filter((c) => !c.hidden).flatMap((c) => chatsFor(c.id).map((chat) => ({ c, chat })));
  const groups = S.interchanges
    .filter((x) => !x.hidden)
    .map((x) => interchange(x.id))
    .filter(Boolean)
    .flatMap((ix) => chatsFor(ix.id).map((chat) => ({ ix, c: ix.people[0], chat })));
  return [...lines, ...groups].filter((x) => x.chat.hidden && hasStarted(x.chat)).sort((a, b) => b.chat.updatedAt - a.chat.updatedAt);
}
export async function setHidden(kind, id, on) {
  if (kind === 'chat') {
    const chat = S.chats.get(id);
    if (!chat) return;
    chat.hidden = on || undefined;
    chat.hiddenAt = Date.now(); // so Sync knows this change is newer
    return saveChat(chat, false);
  }
  const list = kind === 'ix' ? S.interchanges : S.characters;
  const o = list.find((x) => x.id === id);
  if (!o) return;
  o.hidden = on || undefined;
  o.hiddenAt = Date.now();
  return kind === 'ix' ? saveInterchange(o) : saveCharacter(o);
}

// The Logbook: every starred message across all chats, newest star first: [{ chat, m }].
// Starred replies and starred lines (m.quotes), newest first. A line entry carries `q`.
export function logbook() {
  const out = [];
  for (const chat of S.chats.values())
    for (const m of chat.messages) {
      if (m.star) out.push({ chat, m, at: m.star });
      for (const q of m.quotes || []) out.push({ chat, m, q, at: q.at });
    }
  return out.sort((a, b) => b.at - a.at);
}

export function lastMessage(chat) {
  return chat?.messages[chat.messages.length - 1] || null;
}

// --- backup ---
export function snapshot({ includeKeys = true } = {}) {
  return {
    app: 'chatbox',
    version: 1,
    exportedAt: new Date().toISOString(),
    // Nightmare's token unlocks the app on this phone: left out like API keys.
    settings: includeKeys || !S.settings.nightmare ? S.settings : { ...S.settings, nightmare: { ...S.settings.nightmare, token: '' } },
    persona: S.persona,
    personas: S.personas,
    connections: S.connections.map((c) => (includeKeys ? c : { ...c, apiKey: '' })),
    characters: S.characters,
    chats: [...S.chats.values()],
    fares: S.fares,
    interchanges: S.interchanges,
    lore: S.lore,
    images: S.images,
  };
}

async function saveEverything() {
  await Promise.all([saveSettings(), savePersona(), saveConnections(), saveCharacters(), saveInterchanges(), saveLore(), saveImages()]);
  const keep = new Set([...S.chats.keys()].map((k) => 'chat:' + k));
  await Promise.all([...S.chats.values()].map((c) => db.set('chat:' + c.id, c)));
  for (const k of await db.keys()) if (typeof k === 'string' && k.startsWith('chat:') && !keep.has(k)) await db.del(k);
}

export async function restore(data) {
  if (!data || data.app !== 'chatbox') throw new Error('This file is not a Chatbox backup.');
  // Write the backup first and only then remove what it replaces: if the phone runs out of space
  // half-way, the old data is still there. Your own music files stay.
  const before = await db.keys();
  const nmLocal = S.settings.nightmare; // Nightmare's address and token belong to this phone
  S.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  if (nmLocal) S.settings.nightmare = nmLocal;
  S.persona = { ...S.persona, ...(data.persona || {}) };
  setupPersonas(data.personas);
  S.connections = data.connections || [];
  S.characters = data.characters || [];
  S.fares = { months: {}, ...(data.fares || {}) };
  S.interchanges = data.interchanges || [];
  S.lore = data.lore || [];
  S.images = data.images || {};
  S.chats = new Map();
  for (const c of data.chats || []) S.chats.set((c.id ||= c.characterId), c);
  for (const c of [...S.chats.values()])
    if (c.id === c.characterId && !String(c.id).startsWith('ix-')) S.chats.delete(c.id), S.chats.set((c.id = `${c.id}~1`), c);
  cleanState(S);
  savedImg.clear();
  savedChar.clear();
  await Promise.all([
    db.set('seeded', true),
    saveSettings(),
    savePersona(),
    saveConnections(),
    saveCharacters(),
    saveFares(),
    saveInterchanges(),
    saveLore(),
    saveImages(),
    ...[...S.chats.values()].map((c) => db.set('chat:' + c.id, c)),
  ]);
  const now = new Set([...[...S.chats.keys()].map((k) => 'chat:' + k), ...Object.keys(S.images).map((k) => IMG + k), ...S.characters.map((c) => CHAR + c.id)]);
  const stale = (k) => typeof k === 'string' && (['images', 'characters', 'syncmeta'].includes(k) || (/^(chat|img|char):/.test(k) && !now.has(k)));
  for (const k of before) if (stale(k)) await db.del(k);
}

export const isPersistent = db.persistent;
