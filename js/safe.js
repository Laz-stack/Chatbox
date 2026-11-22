// Checks for data that comes from outside: character cards, backups being restored, and records
// arriving from Sync. Names and text are always escaped when shown, but some fields go straight into
// markup as colours, ids or picture links. A card made to break out of those (a "colour" that closes
// the style attribute and adds a script) is cleaned here, before it's saved or shown.

const HEX = /^#[0-9a-f]{3,8}$/i;
const ID = /^[\w~.:-]{1,120}$/;
const KEY = /^[\w-]{1,40}$/;

// A #rgb / #rrggbb / #rrggbbaa colour, or the fallback.
export const safeColor = (c, fallback = '#2EAA67') => (typeof c === 'string' && HEX.test(c.trim()) ? c.trim() : fallback);
// A colour as the app itself writes them in markup: a hex, a CSS variable, rgb()/rgba(), or a keyword.
const CSSC = /^(#[0-9a-f]{3,8}|var\(--[\w-]+\)|rgba?\([\d\s.,%]+\)|transparent|currentColor|inherit)$/i;
export const safeCss = (c, fallback = '#ECECEC') => (typeof c === 'string' && CSSC.test(c.trim()) ? c.trim() : fallback);
// Ids end up in links and attributes: letters, digits and _ ~ . : - only.
export const okId = (v) => typeof v === 'string' && ID.test(v);
const freshId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// A picture: a data: image, a blob: link, an http(s) link, or a stored-image key ("img:…"), with
// nothing in it that could end an attribute or a CSS url().
export function cleanImg(v) {
  if (typeof v !== 'string' || !v) return null;
  if (/["'<>()\\\s]/.test(v.slice(0, 2048)) && !/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
  return /^(data:image\/|blob:|https?:\/\/|img:)/i.test(v) ? v : null;
}

const str = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);

function cleanLine(line, fallback) {
  const l = line && typeof line === 'object' ? line : {};
  return { ...l, letter: str(l.letter, 3), color: safeColor(l.color, fallback) };
}

export function cleanCharacter(c, fallbackColor = '#2EAA67') {
  if (!c || typeof c !== 'object') return c;
  c.line = cleanLine(c.line, fallbackColor);
  if (c.color != null) c.color = safeColor(c.color, c.line.color);
  if (c.preset != null && !KEY.test(String(c.preset))) c.preset = 'mika';
  if (c.scene != null && !KEY.test(String(c.scene))) c.scene = 'cafe';
  if ('avatarImage' in c) c.avatarImage = cleanImg(c.avatarImage);
  if ('bgPic' in c) c.bgPic = cleanImg(c.bgPic);
  return c;
}
export function cleanPersona(p) {
  if (!p || typeof p !== 'object') return p;
  if (!okId(p.id)) p.id = 'p-' + freshId();
  p.color = safeColor(p.color, '#065BFE');
  if (p.preset != null && !KEY.test(String(p.preset))) p.preset = 'haru';
  if ('avatarImage' in p) p.avatarImage = cleanImg(p.avatarImage);
  return p;
}
export function cleanInterchange(x) {
  if (!x || typeof x !== 'object') return x;
  x.members = Array.isArray(x.members) ? x.members.filter(okId) : [];
  for (const k of ['picture', 'cover']) if (k in x) x[k] = cleanImg(x[k]);
  return x;
}
export function cleanLore(e) {
  if (!e || typeof e !== 'object') return e;
  if (!okId(e.id)) e.id = freshId();
  if (Array.isArray(e.lineIds)) e.lineIds = e.lineIds.filter(okId);
  return e;
}
export function cleanConnection(c) {
  if (c && typeof c === 'object' && !okId(c.id)) c.id = freshId();
  return c;
}
// A chat's own ids (messages, facts, notes, bookmarks) go into attributes too.
export function cleanChat(chat) {
  if (!chat || typeof chat !== 'object') return chat;
  // A chat from a backup or Drive may be missing parts; the chat screen expects these lists.
  if (!Array.isArray(chat.messages)) chat.messages = [];
  if (!Array.isArray(chat.notes)) chat.notes = [];
  for (const list of [chat.messages, chat.facts, chat.notes, chat.scenes, chat.marks])
    if (Array.isArray(list)) for (const it of list) if (it && typeof it === 'object' && 'id' in it && !okId(it.id)) it.id = freshId();
  if ('bgPic' in chat) chat.bgPic = cleanImg(chat.bgPic);
  if (chat.personaId != null && !okId(chat.personaId)) chat.personaId = null;
  return chat;
}

// Clean everything in memory. Characters, group chats and chats with an unusable id get a new one,
// and whatever pointed at the old id follows. Returns true when anything changed id.
export function cleanState(S) {
  const moved = new Map();
  const reId = (o, prefix = '') => {
    if (okId(o.id)) return;
    const n = prefix + freshId();
    moved.set(o.id, n);
    o.id = n;
  };
  for (const c of S.characters || []) reId(c), cleanCharacter(c);
  for (const x of S.interchanges || []) reId(x, 'ix-'), cleanInterchange(x);
  for (const p of S.personas || []) cleanPersona(p);
  if (S.persona) cleanPersona(S.persona);
  for (const e of S.lore || []) cleanLore(e);
  for (const c of S.connections || []) cleanConnection(c);
  for (const k of Object.keys(S.images || {})) if (!/^data:image\//.test(cleanImg(S.images[k]) || '')) delete S.images[k];
  const follow = (v) => (moved.has(v) ? moved.get(v) : v);
  for (const x of S.interchanges || []) x.members = x.members.map(follow);
  for (const e of S.lore || []) if (Array.isArray(e.lineIds)) e.lineIds = e.lineIds.map(follow);
  let chatMoved = false;
  for (const [k, chat] of [...(S.chats || new Map())]) {
    if (!chat || typeof chat !== 'object') {
      S.chats.delete(k);
      continue;
    }
    chat.characterId = follow(chat.characterId);
    cleanChat(chat);
    if (!okId(chat.id) || !okId(k)) {
      S.chats.delete(k);
      chat.id = okId(chat.characterId) ? `${chat.characterId}~${freshId()}` : freshId();
      S.chats.set(chat.id, chat);
      chatMoved = true;
    }
  }
  return moved.size > 0 || chatMoved;
}
