// Lines: every character (and later every Interchange), all departures, the full Logbook,
// and a search across names, taglines and every message in every chat.
import { S, textOf, named, hasStarted, departures, logbook, character, lastMessage, interchange, latestChat, chatsFor, hiddenChats, setHidden, deleteChat, deleteCharacter, deleteInterchange } from '../store.js';
import { esc, ago, agoLong, plain, inkOn, debounce, formatMessage, cleanTagline } from '../util.js';
import { title2, avatarBullet, tabbar, icon, groupAvatar, emptySign, toast, confirmSheet, openSheet, openMenu } from '../ui.js';
import { faceSVG } from '../avatar.js';
import { small } from '../thumbs.js';
import { startImport } from './import.js';

const FILTERS = [
  ['recent', 'Recent'],
  ['all', 'All'],
  ['starred', 'Starred'],
  ['narrators', 'Narrator'],
  ['interchanges', 'Groups'],
];

// A character imported as one narrator for a multi-character card.
export const isNarrator = (c) => !!(c.narrator || (c.source?.story && c.name === c.source.story));
// ---------- Picture cards (owner pick v47: poster grid, Last ride, tags and a tag filter) ----------
let tagPick = []; // tags picked in Filters, kept while the app is open
const tagsOf = (x) => [...new Set((Array.isArray(x?.tags) ? x.tags : []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean))];
const tagMatch = (x) => tagPick.every((t) => tagsOf(x).some((y) => y.toLowerCase() === t.toLowerCase()));
const lastAt = (id) => latestChat(id)?.updatedAt || 0;
const whenText = (id, n) => (n ? (ago(lastAt(id)) === 'now' ? 'just now' : `${ago(lastAt(id))} ago`) : 'new');
// Card pictures are made for this screen's sharpness: a card is ~200px wide (3:4), times the
// device's pixel ratio, so a 3x phone gets a copy as sharp as Datacat's.
const DPR = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
const CARD_PX = Math.min(1600, Math.ceil((200 * DPR * 4) / 3 / 100) * 100);
const RIDE_PX = Math.min(2000, Math.ceil((420 * DPR) / 100) * 100);
const artOf = (c) => (c.avatarImage ? `<img src="${esc(small(c.avatarImage, CARD_PX))}" data-small="${CARD_PX}" alt="" loading="lazy">` : faceSVG(c, 300, 'happy', c.line?.color || '#2EAA67').replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" '));
const tagPills = (x) => {
  const t = tagsOf(x).slice(0, 2);
  return t.length ? `<span class="pst-tags">${t.map((y) => `<span>${esc(y)}</span>`).join('')}</span>` : '';
};
function poster(c) {
  const n = shownChats(c.id).length;
  const col = c.line?.color || '#2EAA67';
  return `<a class="pst press" href="#/chat/${c.id}" data-card="char:${esc(c.id)}" data-name="${esc(c.name)}" style="--c:${col}" aria-label="${esc(c.name)}, ${n ? `${n} chat${n === 1 ? '' : 's'}` : 'no chats yet'}${tagsOf(c).length ? `, tags ${esc(tagsOf(c).slice(0, 2).join(', '))}` : ''}" aria-describedby="cardHint"><span class="pst-art" data-av="line:${esc(c.id)}">${artOf(c)}<span class="pst-cnt${n ? '' : ' none'}">${n ? `${n} chat${n === 1 ? '' : 's'}` : 'no chats yet'}</span></span><b>${esc(c.name)}</b><small>${esc(cleanTagline(c.tagline, c.name) || 'No tagline')}</small>${tagPills(c)}<span class="pst-meta"><i aria-hidden="true"></i>${whenText(c.id, n)}</span></a>`;
}
function groupPoster(ix) {
  const chat = latestChat(ix.id);
  const n = chat && chat.messages.some((m) => m.role === 'user') ? 1 : 0;
  const img = ix.picture || (ix.useScene ? null : ix.cover);
  return `<a class="pst press" href="#/chat/${ix.id}" data-card="ix:${esc(ix.id)}" data-name="${esc(ix.title)}" style="--c:#ECECEC" aria-label="${esc(ix.title)}, group" aria-describedby="cardHint"><span class="pst-art">${img ? `<img src="${esc(small(img, CARD_PX))}" data-small="${CARD_PX}" alt="" loading="lazy">` : `<span class="pst-mos">${groupAvatar(ix, 300)}</span>`}<span class="pst-cnt">${ix.mode === 'scene' ? 'Carriage' : 'Interchange'}</span></span><b>${esc(ix.title)}</b><small>${ix.people.map((p) => esc(p.name)).join(', ')}</small>${tagPills(ix)}<span class="pst-meta"><i aria-hidden="true"></i>${n ? whenText(ix.id, 1) : 'not started'}</span></a>`;
}
// The chat you were in last, as one big card with Continue.
function lastRide() {
  const d = departures()[0];
  if (!d) return '';
  const who = d.ix || d.c;
  const name = d.ix ? d.ix.title : d.c.name;
  const img = d.ix ? d.ix.picture || (d.ix.useScene ? null : d.ix.cover) : d.c.avatarImage;
  const col = d.ix ? '#ECECEC' : d.c.line?.color || '#2EAA67';
  const art = img ? `<img src="${esc(small(img, RIDE_PX))}" data-small="${RIDE_PX}" alt="">` : d.ix ? `<span class="pst-mos">${groupAvatar(d.ix, 400)}</span>` : faceSVG(d.c, 400, 'happy', col).replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ');
  const sub = d.ix ? d.ix.people.map((p) => p.name).join(', ') : cleanTagline(d.c.tagline, d.c.name) || '';
  return `<h2 class="ln-sec">Last ride</h2><a class="ride press" href="#/chat/${encodeURIComponent(d.chat.id)}" style="--c:${col}" aria-label="Continue with ${esc(name)}">${art}<span class="ride-fade" aria-hidden="true"></span><span class="ride-band" aria-hidden="true"></span><span class="ride-tx"><span class="ride-k">${esc(ago(d.chat.updatedAt) === 'now' ? 'just now' : agoLong(d.chat.updatedAt))}</span><b>${esc(name)}</b><small>${esc(sub)}</small></span><span class="ride-go">Continue${icon('chev', 14)}</span></a>`;
}
const posterSec = (title, n, cards, of = 0) => (n ? `<h2 class="ln-sec">${title}<span class="num">${of ? `${n} of ${of}` : n}</span></h2><div class="pst-grid">${cards}</div>` : '');
const filterRow = () =>
  `<div class="ln-frow"><button type="button" class="ln-fbtn press" id="lnFilt" aria-haspopup="dialog">Filters${tagPick.length ? `<em>${tagPick.length}</em>` : ''}</button></div>${tagPick.length ? `<div class="ln-picked">${tagPick.map((t) => `<button type="button" class="ln-pk press" data-untag="${esc(t)}" aria-label="Remove tag ${esc(t)}">${esc(t)}<i aria-hidden="true">✕</i></button>`).join('')}<button type="button" class="ln-pk reset press" data-untag="*">Reset</button></div>` : ''}`;

const section = (title, n, rows) => (n ? `<h2 class="ln-sec">${title}<span class="num">${n}</span></h2><div class="index">${rows}</div>` : '');

const colorVars = (c) => {
  const col = c.line?.color || '#2EAA67';
  return `--c:${col};--ink:${inkOn(col)}`;
};

// The avatar on a plate. A letter avatar on its own line colour would vanish into the plate,
// so it shows as a dark station badge instead.
const badge = (c) => (!c.avatarImage && (c.preset === 'initial' || !c.preset) ? avatarBullet({ ...c, line: { ...c.line, color: '#0A0A0A' } }, 44, '', `line:${c.id}`) : avatarBullet(c, 44, '', `line:${c.id}`));

// Swipe a row left to reveal Hide and Delete. kind: 'chat' (a row under Recent), 'char' or 'ix'
// (a character or group under All). The buttons can't be reached until the row is open.
// (Keyboard: the left arrow opens a row, Escape closes it.) A hidden item found by search offers Show.
const sw = (row, kind, id, name, { hidden = false, group = false } = {}) =>
  `<div class="sw" data-kind="${kind}" data-id="${esc(id)}" data-name="${esc(name)}"${group ? ' data-group="1"' : ''}><div class="sw-under"><button type="button" class="sw-h press" data-act="${hidden ? 'show' : 'hide'}" tabindex="-1">${icon(hidden ? 'eye' : 'eyeoff', 18)}${hidden ? 'Show' : 'Hide'}</button><button type="button" class="sw-d press" data-act="del" tabindex="-1">${icon('trash', 18)}Delete</button></div>${row}</div>`;
// Hidden things fold away at the bottom of the list, each with Show.
const hidRow = (kind, id, name, face, what) =>
  `<div class="hidrow">${face}<span class="hid-tx"><b>${esc(name)}</b><small>${what} · hidden</small></span><button type="button" class="hid-show press" data-show="${kind}:${esc(id)}" aria-label="Show ${esc(name)} again">Show</button></div>`;
const fold = (rows) =>
  rows.length
    ? `<div class="ln-fold"><button type="button" class="ln-fold-b press" aria-expanded="false">${icon('eyeoff', 18)}<span>Hidden · ${rows.length}</span><span class="ln-fold-c">${icon('chev', 16)}</span></button><div class="ln-fold-in"><div>${rows.join('')}</div></div></div>`
    : '';
const grey = (html) => html.replace('class="bullet', 'class="bullet hid-av');

// A character is a solid plate; how many chats they have sits in a pill on the right.
const countPill = (n, c) => `<span class="ln-count${inkOn(c.line?.color || '#2EAA67') === '#FFFFFF' ? ' light' : ''}">${n ? `${n} chat${n === 1 ? '' : 's'}` : 'no chats yet'}</span>`;
function lineRow(c) {
  const n = shownChats(c.id).length;
  return sw(`<a class="ix press" href="#/chat/${c.id}" style="${colorVars(c)}" aria-label="${esc(c.name)}, character, ${n} chat${n === 1 ? '' : 's'}" aria-describedby="swHint">${badge(c)}<span class="row-tx"><span class="row-t">${esc(c.name)}</span><span class="row-s">${esc(cleanTagline(c.tagline, c.name) || 'No tagline')}</span></span>${countPill(n, c)}</a>`, 'char', c.id, c.name, { hidden: !!c.hidden });
}

function ixRow(ix, kind = 'ix', chat = latestChat(ix.id)) {
  const when = chat && chat.messages.some((m) => m.role === 'user') ? (ago(chat.updatedAt) === 'now' ? 'just now' : ago(chat.updatedAt)) : 'not started';
  return sw(`<a class="ix ixg press" href="#/chat/${ix.id}" aria-label="Open ${esc(ix.title)}" aria-describedby="swHint">${groupAvatar(ix, 44)}<span class="row-tx"><span class="row-t">${esc(ix.title)}</span><span class="row-s">${ix.mode === 'scene' ? 'Carriage' : 'Interchange'} · ${ix.people.map((p) => esc(p.name)).join(', ')}</span></span><span class="ix-t num">${when}</span></a>`, kind, kind === 'chat' ? chat?.id : ix.id, ix.title, { hidden: kind === 'ix' && !!ix.hidden, group: true });
}

// Recent: each character's chats hang under their plate like stations on a line. The character
// with the newest chat comes first; their chats run newest first. A chat is named by your first line.
const chatTitle = (chat) => {
  const first = chat.messages.find((m) => m.role === 'user');
  return first ? plain(textOf(first)).slice(0, 80) || 'Untitled chat' : 'Not started yet';
};
// The station's second line: the latest message, unless it's your first line (already the title).
const lastLine = (chat, who, name) => {
  const last = lastMessage(chat);
  return last?.role === 'user' && last === chat.messages.find((m) => m.role === 'user') ? `Waiting for ${name}` : plain(named(textOf(last), who));
};
// The chats a character or group shows: started and not hidden, newest first. One source for the
// station list, the count badge and the All pill.
const shownChats = (id) => chatsFor(id).filter((c) => hasStarted(c) && !c.hidden);
function recentGroups() {
  const groups = new Map();
  for (const d of departures()) {
    if (d.ix) continue;
    if (!groups.has(d.c.id)) groups.set(d.c.id, { c: d.c, chats: [] });
    groups.get(d.c.id).chats.push(d.chat);
  }
  // Groups (Interchanges) can have several chats too; departures() lists only the newest one.
  for (const x of S.interchanges) {
    if (x.hidden) continue;
    const ix = interchange(x.id);
    const chats = ix && shownChats(ix.id);
    if (chats?.length) groups.set(ix.id, { ix, c: ix.people[0], chats });
  }
  return [...groups.values()].sort((a, b) => b.chats[0].updatedAt - a.chats[0].updatedAt);
}
function lineGroup({ c, ix, chats }) {
  const id = ix ? ix.id : c.id;
  const name = ix ? ix.title : c.name;
  const vars = ix ? '--c:#ECECEC;--ink:#0A0A0A' : colorVars(c);
  const n = chats.length;
  const head = sw(
    `<a class="ix press ln-head" href="#/chat/${chats[0].id}" style="${vars}" aria-label="${esc(name)}, ${ix ? 'group' : 'character'}, ${n} chat${n === 1 ? '' : 's'}" aria-describedby="swHint">${ix ? groupAvatar(ix, 44) : badge(c)}<span class="row-tx"><span class="row-t">${esc(name)}</span><span class="row-s">${ix ? `${ix.mode === 'scene' ? 'Carriage' : 'Interchange'} · ${ix.people.map((p) => esc(p.name)).join(', ')}` : esc(cleanTagline(c.tagline, c.name) || 'No tagline')}</span></span><span class="ln-n${!ix && /^#fff/i.test(inkOn(c.line?.color || '#2EAA67')) ? ' light' : ''}" aria-hidden="true">${n}</span></a>`,
    ix ? 'ix' : 'char', id, name, { group: !!ix }
  );
  const who = ix ? ix.people[0] : c;
  const stations = chats
    .map((chat) =>
      sw(`<a class="ln-stn press" href="#/chat/${chat.id}" aria-label="Chat with ${esc(name)}: ${esc(chatTitle(chat))}, ${esc(agoLong(chat.updatedAt))}" aria-describedby="swHint"><span class="ln-dot" aria-hidden="true"></span><span class="row-tx"><span class="ln-st">${esc(chatTitle(chat))}</span><span class="ln-ss">${esc(lastLine(chat, who, name))}</span></span><span class="ln-w num">${ago(chat.updatedAt)}</span></a>`, 'chat', chat.id, name, { group: !!ix })
    )
    .join('');
  return `<div class="ln-grp" role="group" aria-label="${esc(name)}" style="${vars}">${head}${stations}</div>`;
}

function departureRow({ c, chat, ix }) {
  if (ix) return ixRow(ix, 'chat', chat);
  return sw(`<a class="ix press" href="#/chat/${chat.id}" style="${colorVars(c)}" aria-label="Chat with ${esc(c.name)}" aria-describedby="swHint">${badge(c)}<span class="row-tx"><span class="row-t">${esc(c.name)}</span><span class="row-s">${esc(plain(named(textOf(lastMessage(chat)), c)))}</span></span><span class="ix-t num">${ago(chat.updatedAt)}</span></a>`, 'chat', chat.id, c.name);
}

function starRow({ chat, m, q, at }) {
  const c = (q && character(q.who)) || character(m.speaker) || character(chat.characterId) || interchange(chat.characterId)?.people[0];
  if (!c) return '';
  const t = q ? `“${q.text}”` : named(textOf(m), c);
  return `<a class="stub press" href="#/chat/${chat.id}/m/${m.id}" style="${colorVars(c)}"><span class="stub-l">${avatarBullet(c, 32)}</span><span class="stub-r"><span class="stub-m"><b>${esc(q?.name || c.name)}</b><span>${agoLong(at)}</span></span><span class="stub-p">${formatMessage(t.length > 240 ? t.slice(0, 237) + '…' : t)}</span></span></a>`;
}

// Highlight the query inside an escaped snippet around the first match.
function snippet(text, q) {
  const flat = plain(text);
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(flat.slice(0, 120));
  const a = Math.max(0, i - 40);
  const part = flat.slice(a, i + q.length + 80);
  const j = i - a;
  return (a ? '…' : '') + esc(part.slice(0, j)) + '<mark>' + esc(part.slice(j, j + q.length)) + '</mark>' + esc(part.slice(j + q.length)) + (i + q.length + 80 < flat.length ? '…' : '');
}

function searchResults(q) {
  const ql = q.toLowerCase();
  const lines = S.characters.filter((c) => (c.name + ' ' + (c.tagline || '')).toLowerCase().includes(ql));
  const hits = [];
  for (const chat of S.chats.values()) {
    const ixr = interchange(chat.characterId);
    const r = { id: chat.id, c: character(chat.characterId), ix: ixr };
    if (!r.c && !r.ix) continue;
    for (const m of chat.messages) {
      const t = named(textOf(m), r.c || character(m.speaker) || r.ix?.people[0]);
      if (!t.toLowerCase().includes(ql)) continue;
      const c = r.c || character(m.speaker) || r.ix.people[0];
      hits.push({ c, m, t, room: r.id, where: r.ix ? r.ix.title : c.name });
    }
  }
  hits.sort((a, b) => (b.m.at || 0) - (a.m.at || 0));
  const msgs = hits.slice(0, 60);
  // Also what the story keeps: bookmarks, chapters, the Memory book, pinned notes and summaries.
  const kept = [];
  for (const chat of S.chats.values()) {
    const ixr = interchange(chat.characterId);
    const c = character(chat.characterId) || ixr?.people[0];
    if (!c) continue;
    const where = ixr ? ixr.title : c.name;
    const go = (msgId) => `#/chat/${encodeURIComponent(chat.id)}/m/${encodeURIComponent(msgId)}`;
    const mem = `#/memory/${encodeURIComponent(chat.id)}`;
    const add = (kind, text, href) => text && text.toLowerCase().includes(ql) && kept.push({ c, kind, text, href, where });
    for (const b of chat.marks || []) add('Bookmark', b.title, go(b.msgId));
    for (const x of chat.chapters || []) add('Chapter', x.title, go(x.msgId));
    for (const f of chat.facts || []) add('Memory book', f.text, mem);
    for (const n of chat.notes || []) add('Pinned note', n.text, mem);
    add('Summary', chat.summary?.text, mem);
  }
  if (!lines.length && !msgs.length && !kept.length) return `<p class="search-none">Nothing on the network matches “${esc(q)}”.</p>`;
  return (
    (lines.length ? `<div class="blk"><div class="hrow"><h2 class="h">Lines</h2><span class="small">${lines.length}</span></div><div class="index">${lines.map(lineRow).join('')}</div></div>` : '') +
    (msgs.length
      ? `<div class="blk"><div class="hrow"><h2 class="h">Said on the line</h2><span class="small">${hits.length > 60 ? '60 of ' + hits.length : hits.length}</span></div><div class="hits">${msgs
          .map(
            ({ c, m, t, room, where }) =>
              `<a class="hit press" href="#/chat/${room}/m/${m.id}">${avatarBullet(c, 30)}<span class="hit-tx"><b>${m.role === 'user' ? 'You to ' + esc(where) : esc(c.name) + (where !== c.name ? ' in ' + esc(where) : '')}</b><span>${snippet(t, q)}</span></span></a>`
          )
          .join('')}</div></div>`
      : '') +
    (kept.length
      ? `<div class="blk"><div class="hrow"><h2 class="h">Kept by the story</h2><span class="small">${kept.length > 30 ? '30 of ' + kept.length : kept.length}</span></div><div class="hits">${kept
          .slice(0, 30)
          .map(({ c, kind, text, href, where }) => `<a class="hit press" href="${href}">${avatarBullet(c, 30)}<span class="hit-tx"><b>${kind} · ${esc(where)}</b><span>${snippet(text, q)}</span></span></a>`)
          .join('')}</div></div>`
      : '')
  );
}

export function linesView(filter) {
  // Lines opens on All: the picture cards, with Last ride on top (owner's choice).
  if (!FILTERS.some(([k]) => k === filter)) filter = 'all';
  const sorted = S.characters.filter((c) => !c.hidden).sort((a, b) => a.name.localeCompare(b.name));
  const groupsShown = () => S.interchanges.filter((x) => !x.hidden).map((x) => interchange(x.id)).filter(Boolean);
  const hiddenLines = () => [
    ...S.characters.filter((c) => c.hidden).map((c) => hidRow('char', c.id, c.name, grey(avatarBullet(c, 40)), 'Character')),
    ...S.interchanges.filter((x) => x.hidden).map((x) => interchange(x.id)).filter(Boolean).map((ix) => hidRow('ix', ix.id, ix.title, `<span class="hid-av">${groupAvatar(ix, 40)}</span>`, 'Group')),
  ];
  const body = () => {
    if (filter === 'recent') {
      const groups = recentGroups();
      const deps = groups.flatMap((g) => g.chats);
      const hid = hiddenChats().map(({ c, chat, ix }) => hidRow('chat', chat.id, ix ? ix.title : c.name, ix ? `<span class="hid-av">${groupAvatar(ix, 40)}</span>` : grey(avatarBullet(c, 40)), 'Chat'));
      return (deps.length
        ? section('Recent chats', deps.length, groups.map(lineGroup).join('')) + (deps.length < 4 ? `<a class="ln-all press" href="#/lines/all">All lines${icon('chev', 16)}</a>` : '')
        : emptySign('No departures yet', 'Pick a line under All and say hello.', `<a class="pill press" href="#/lines/all">All lines${icon('chev', 15)}</a>`, 'Lines · Recent')) + fold(hid);
    }
    if (filter === 'interchanges') {
      const all = groupsShown();
      return `<div class="index">${all.map((ix) => ixRow(ix)).join('')}<a class="ix ix-new press" href="#/interchange/new"><span class="bullet ix-new-b" style="width:44px;height:44px">${icon('track', 22)}</span><span class="row-tx"><span class="row-t">New interchange</span><span class="row-s">Let 2–5 lines meet in one chat</span></span></a></div>`;
    }
    if (filter === 'narrators') {
      const list = sorted.filter(isNarrator);
      return list.length ? `<div class="index">${list.map(lineRow).join('')}</div>` : emptySign('No narrators yet', 'Import a card with several characters and choose One narrator.', '', 'Lines · One narrator');
    }
    if (filter === 'starred') {
      const log = logbook();
      return log.length ? `<div class="roll">${log.map(starRow).join('')}</div>` : emptySign('Nothing starred yet', 'Long-press a message in a chat and tap Star. It lands here.', '', 'Lines · Starred');
    }
    // All: picture cards. Picked tags narrow everything; Last ride steps aside while filtering.
    const groups = groupsShown().filter(tagMatch);
    const chars = sorted.filter((c) => !isNarrator(c) && tagMatch(c));
    const narr = sorted.filter((c) => isNarrator(c) && tagMatch(c));
    const total = chars.length + narr.length + groups.length;
    const newCard = `<a class="pst-new press" href="#/edit/new"><span><i aria-hidden="true">${icon('plus', 22)}</i><b>New line</b><small>Create a character</small></span></a>`;
    return (
      filterRow() +
      (tagPick.length ? '' : lastRide()) +
      (tagPick.length
        ? (total ? '' : `<p class="search-none">No character has all of these tags. Tap Reset to see everyone.</p>`) +
          posterSec('Characters', chars.length, chars.map(poster).join(''), S.characters.filter((c) => !c.hidden && !isNarrator(c)).length) +
          posterSec('One narrator', narr.length, narr.map(poster).join(''), S.characters.filter((c) => !c.hidden && isNarrator(c)).length) +
          posterSec('Groups', groups.length, groups.map(groupPoster).join(''), groupsShown().length)
        : (chars.length ? posterSec('Characters', chars.length, chars.map(poster).join('') + newCard) : `<h2 class="ln-sec">Characters</h2><div class="pst-grid">${newCard}</div>`) +
          posterSec('One narrator', narr.length, narr.map(poster).join('')) +
          posterSec('Groups', groups.length, groups.map(groupPoster).join(''))) +
      fold(hiddenLines())
    );
  };

  const html = `<div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      ${title2('Lines', 'Where to?')}
      <label class="ibtn press" title="Import a character card" style="cursor:pointer">${icon('upload')}<span class="vh">Import a character card</span><input type="file" accept=".zip,.png,.json,application/zip,image/png,application/json" id="linesCardIn" class="vh" multiple></label>
    </div>
    <label class="search">${icon('search', 20)}<input id="q" type="search" placeholder="Name, line or something they said" aria-label="Search lines and messages" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips-f" role="tablist" aria-label="Show">${FILTERS.map(([k, l]) => `<a class="press${k === filter ? ' on' : ''}" role="tab" aria-selected="${k === filter}" href="#/lines/${k}">${l}</a>`).join('')}</div>
    <p class="vh" id="swHint">Left arrow: Hide and Delete for this row.</p>
    <p class="vh" id="cardHint">Long-press, or the left arrow: Hide and Delete.</p>
    <div id="results"><div class="blk-tight">${body()}</div></div>
  </div>${tabbar('lines')}`;

  return {
    html,
    depth: 0,
    mount(root) {
      const input = root.querySelector('#q');
      const results = root.querySelector('#results');
      const chips = root.querySelector('.chips-f');
      let base = results.innerHTML;
      // After a hide, delete or show: redraw the list, or the search results if a search is showing.
      const redraw = () => {
        base = `<div class="blk-tight">${body()}</div>`;
        const q = input.value.trim();
        results.innerHTML = q ? searchResults(q) : base;
      };
      bindSwipes(results, redraw);
      bindCards(root, results, redraw);
      const run = debounce(() => {
        const q = input.value.trim();
        chips.hidden = q.length > 0;
        results.innerHTML = q.length ? searchResults(q) : base;
      }, 120);
      input.addEventListener('input', run);
      // Fade the chip row's right edge while there are more chips to scroll to.
      const edge = () => chips.classList.toggle('more', chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 4);
      chips.addEventListener('scroll', edge, { passive: true });
      edge();
      chips.querySelector('.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      root.querySelector('#linesCardIn').addEventListener('change', async (e) => {
        startImport([...e.target.files]);
        e.target.value = '';
      });
    },
  };
}

// ---------- Picture cards: Filters sheet, picked-tag chips, and Hide / Delete on a long-press ----------
function bindCards(root, results, redraw) {
  results.addEventListener('click', (e) => {
    const un = e.target.closest('[data-untag]');
    if (un) {
      tagPick = un.dataset.untag === '*' ? [] : tagPick.filter((t) => t !== un.dataset.untag);
      redraw();
      results.querySelector('#lnFilt')?.focus();
      return;
    }
    if (e.target.closest('#lnFilt')) filterSheet(redraw);
  });
  // Long-press (or right-click / the menu key) on a card: Hide or Delete, as a swipe does on a row.
  let t = null;
  let held = false;
  // After a card goes: redraw, then focus the card that took its place (or Filters).
  const after = (card) => {
    const cards = [...results.querySelectorAll('.pst[data-card]')];
    const i = cards.indexOf(card);
    const next = cards[i + 1] || cards[i - 1];
    const sel = next ? `.pst[data-card="${CSS.escape(next.dataset.card)}"]` : '#lnFilt';
    return () => {
      redraw();
      setTimeout(() => (results.querySelector(sel) || results.querySelector('#lnFilt'))?.focus(), 320);
    };
  };
  const menu = (card) => {
    const [kind, id] = card.dataset.card.split(':');
    const name = card.dataset.name;
    openMenu(card, [
      { icon: 'eyeoff', label: 'Hide', on: () => act(kind === 'ix' ? 'ix' : 'char', id, name, 'hide', after(card)) },
      '-',
      { icon: 'trash', label: 'Delete', danger: true, on: () => act(kind === 'ix' ? 'ix' : 'char', id, name, 'delete', after(card)) },
    ]);
  };
  results.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.pst[data-card]');
    if (!card || e.button > 0) return;
    held = false;
    t = setTimeout(() => ((held = true), menu(card)), 520);
  });
  const stop = () => clearTimeout(t);
  results.addEventListener('pointerup', stop);
  results.addEventListener('pointercancel', stop);
  results.addEventListener('pointermove', (e) => e.movementX ** 2 + e.movementY ** 2 > 16 && stop());
  results.addEventListener('click', (e) => held && e.target.closest('.pst') && (e.preventDefault(), (held = false)), true);
  results.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.pst[data-card]');
    if (!card) return;
    e.preventDefault();
    clearTimeout(t);
    if (held) return; // the long-press already opened it (Android fires both)
    menu(card);
  });
  // Keyboard: the left arrow, Delete or the menu key on a card opens Hide / Delete (as on rows).
  results.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.pst[data-card]');
    if (!card || !['ArrowLeft', 'Delete', 'ContextMenu'].includes(e.key)) return;
    e.preventDefault();
    menu(card);
  });
}
// Hide or Delete from a card's menu (the same words as the row swipe).
async function act(kind, id, name, what, redraw) {
  if (what === 'hide') {
    await setHidden(kind, id, true);
    redraw();
    return toast(`${name} hidden · find it under Hidden`, { ms: 6500, action: 'Undo', onAction: async () => (await setHidden(kind, id, false), redraw()) });
  }
  const started = kind === 'char' ? chatsFor(id).filter(hasStarted) : [];
  const n = started.length;
  const nHidden = started.filter((c) => c.hidden).length;
  const copy =
    kind === 'char'
      ? { title: `Delete ${esc(name)}${n ? ` and ${n === 1 ? 'their chat' : `${n} chats`}${nHidden ? ` (${nHidden} hidden)` : ''}` : ''}?`, body: `The character${n ? ' and every chat with them' : ''} go for good. To keep them but tidy Lines, use Hide instead.`, ok: 'Delete' }
      : { title: `Delete ${esc(name)}?`, body: 'The group chat goes for good. Its characters stay. This can’t be undone.', ok: 'Delete' };
  if (!(await confirmSheet({ ...copy, danger: true }))) return;
  if (kind === 'char') await deleteCharacter(id);
  else await deleteInterchange(id);
  redraw();
  toast(`${name} deleted`);
}
function filterSheet(redraw) {
  const pool = [...S.characters.filter((c) => !c.hidden), ...S.interchanges.filter((x) => !x.hidden).map((x) => interchange(x.id)).filter(Boolean)];
  const counts = new Map();
  // Tags that differ only in case count as one.
  const named = new Map();
  for (const x of pool) for (const t of new Set(tagsOf(x).map((y) => y.toLowerCase()))) named.has(t) || named.set(t, tagsOf(x).find((y) => y.toLowerCase() === t)), counts.set(named.get(t), (counts.get(named.get(t)) || 0) + 1);
  const all = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let pick = [...tagPick];
  const matches = () => pool.filter((x) => pick.every((t) => tagsOf(x).some((y) => y.toLowerCase() === t.toLowerCase()))).length;
  const btn = () => (pick.length ? `Show ${matches()}` : 'Show everyone');
  openSheet({
    label: 'Filters',
    html: `<h2 class="sheet-title">Filters</h2><p class="sheet-p">Show characters with every tag you pick. Tags come from imported cards, and you can add your own in a character’s editor.</p>${
      all.length ? `<div class="ln-cloud" role="group" aria-label="Tags">${all.map(([t, n]) => `<button type="button" class="ln-cl press" aria-pressed="${pick.includes(t)}" data-t="${esc(t)}">${esc(t)} <small>${n}</small></button>`).join('')}</div>` : `<p class="sheet-p">No tags yet. Add some in a character’s editor, or import cards that have them.</p>`
    }<div style="height:14px"></div><button type="button" class="btn-primary press" id="lnShow"><span>${btn()}</span></button>`,
    onMount(s, close) {
      s.querySelector('.ln-cloud')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        const t = b.dataset.t;
        pick = pick.includes(t) ? pick.filter((x) => x !== t) : [...pick, t];
        b.setAttribute('aria-pressed', String(pick.includes(t)));
        s.querySelector('#lnShow span').textContent = btn();
      });
      s.querySelector('#lnShow').addEventListener('click', () => {
        tagPick = pick;
        close();
        redraw();
        setTimeout(() => document.querySelector('#lnFilt')?.focus(), 340); // after the sheet hands focus back
      });
    },
  });
}

// ---------- Swipe to hide or delete ----------
// A row moves only once the finger clearly goes sideways (vertical scrolling stays the browser's),
// one row is open at a time, and a drag never opens the chat underneath.
const OPEN = -168;
function bindSwipes(box, redraw) {
  let drag = null;
  let swallow = false;
  const setOpen = (w, on) => {
    w.classList.toggle('open', on);
    const row = w.querySelector('.ix, .ln-stn');
    row.style.transform = on ? `translateX(${OPEN}px)` : '';
    w.querySelectorAll('.sw-under button').forEach((b) => (b.tabIndex = on ? 0 : -1));
  };
  const closeAll = (except) => box.querySelectorAll('.sw.open').forEach((w) => w !== except && setOpen(w, false));
  // A link would start the browser's own drag and cancel the swipe.
  box.addEventListener('dragstart', (e) => e.target.closest?.('.sw') && e.preventDefault());
  box.addEventListener('keydown', (e) => {
    const row = e.target.closest('.sw > .ix, .sw > .ln-stn');
    const w = e.target.closest('.sw');
    if (row && (e.key === 'ArrowLeft' || e.key === 'Delete')) {
      e.preventDefault();
      closeAll(w);
      setOpen(w, true);
      w.querySelector('.sw-under button').focus();
    } else if (w && w.classList.contains('open') && (e.key === 'Escape' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setOpen(w, false);
      w.querySelector('.ix, .ln-stn').focus();
    }
  });
  box.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.sw > .ix, .sw > .ln-stn');
    if (!row || e.button > 0) return;
    const w = row.parentElement;
    drag = { w, row, x0: e.clientX, y0: e.clientY, base: w.classList.contains('open') ? OPEN : 0, dx: 0, live: false, id: e.pointerId };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType === 'mouse' && !e.buttons) return end();
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.live) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return (drag = null);
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      drag.live = true;
      closeAll(drag.w);
      drag.w.classList.add('dragging');
      drag.row.setPointerCapture?.(e.pointerId);
    }
    drag.dx = Math.min(0, Math.max(OPEN - 24, drag.base + dx));
    drag.row.style.transform = `translateX(${drag.dx}px)`;
  });
  const end = () => {
    if (!drag) return;
    if (drag.live) {
      swallow = true;
      setTimeout(() => (swallow = false), 400); // touch often sends no click after a drag
      drag.w.classList.remove('dragging');
      setOpen(drag.w, drag.dx < OPEN / 2.4);
    }
    drag = null;
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  // Only our own capture ending counts (touch moves an automatic capture over to the row first).
  box.addEventListener('lostpointercapture', (e) => drag?.live && e.target === drag.row && end());
  // A drag, or a tap on an open row, never follows the row's link.
  box.addEventListener(
    'click',
    (e) => {
      const row = e.target.closest('.sw > .ix, .sw > .ln-stn');
      if (!row) return;
      if (swallow || row.parentElement.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        if (!swallow) setOpen(row.parentElement, false);
      }
      swallow = false;
    },
    true
  );
  const outside = (e) => {
    if (!box.isConnected) return document.removeEventListener('pointerdown', outside);
    if (!box.contains(e.target)) closeAll();
  };
  document.addEventListener('pointerdown', outside, { passive: true });

  box.addEventListener('click', async (e) => {
    const fb = e.target.closest('.ln-fold-b');
    if (fb) {
      const on = fb.parentElement.classList.toggle('open');
      return fb.setAttribute('aria-expanded', on);
    }
    const show = e.target.closest('[data-show]');
    if (show) {
      const [kind, id] = show.dataset.show.split(/:(.*)/);
      await setHidden(kind, id, false);
      redraw();
      const f = box.querySelector('.ln-fold');
      if (f) f.classList.add('open'), f.querySelector('.ln-fold-b').setAttribute('aria-expanded', 'true');
      (f?.querySelector('[data-show]') || f?.querySelector('.ln-fold-b') || box.querySelector('.sw > .ix, .sw > .ln-stn'))?.focus();
      return toast('Back on Lines');
    }
    const b = e.target.closest('.sw-under [data-act]');
    if (!b) return;
    const w = b.closest('.sw');
    const { kind, id, name } = w.dataset;
    // A plate takes its whole group with it, and so does a group's last station.
    const grp = w.closest('.ln-grp');
    const whole = grp && (grp.firstElementChild === w || grp.querySelectorAll(':scope > .sw').length <= 2);
    const gone = whole ? [...grp.querySelectorAll(':scope > .sw')] : [w];
    const goneBox = whole ? grp : w;
    // After the list redraws, focus goes to the row that took this one's place.
    const all = [...box.querySelectorAll('.sw')];
    const next = all.slice(all.indexOf(gone.at(-1)) + 1).find((x) => !gone.includes(x)) || all.slice(0, all.indexOf(gone[0])).reverse()[0];
    const nextSel = next && `.sw[data-kind="${next.dataset.kind}"][data-id="${CSS.escape(next.dataset.id)}"] > a`;
    const refocus = () => (box.querySelector(nextSel || '#none') || box.querySelector('.ln-fold-b') || box.querySelector('a, button'))?.focus();
    if (b.dataset.act === 'show') {
      await setHidden(kind, id, false);
      redraw();
      refocus();
      return toast(`${name} is back on Lines`);
    }
    if (b.dataset.act === 'hide') {
      await setHidden(kind, id, true);
      await collapse(goneBox);
      redraw();
      refocus();
      return toast(`${name} hidden · find it under Hidden`, {
        ms: 6500,
        action: 'Undo',
        onAction: async () => (await setHidden(kind, id, false), redraw()),
      });
    }
    // Delete takes every chat, hidden ones too, so the count says so.
    const started = kind === 'char' ? chatsFor(id).filter(hasStarted) : [];
    const n = started.length;
    const nHidden = started.filter((c) => c.hidden).length;
    const first = esc(name.split(' ')[0]);
    const copy =
      kind === 'chat'
        ? { title: `Delete this chat with ${esc(name)}?`, body: `Messages, notes and memory go too. ${w.dataset.group ? 'The group and its characters stay.' : `Other chats with ${first} stay.`} This can’t be undone.`, ok: 'Delete chat' }
        : kind === 'char'
          ? { title: `Delete ${esc(name)}${n ? ` and ${n === 1 ? 'their chat' : `${n} chats`}${nHidden ? ` (${nHidden} hidden)` : ''}` : ''}?`, body: `The character${n ? ' and every chat with them' : ''} go for good. To keep them but tidy Lines, use Hide instead.`, ok: 'Delete' }
          : { title: `Delete ${esc(name)}?`, body: 'The group chat goes for good. Its characters stay. This can’t be undone.', ok: 'Delete' };
    if (!(await confirmSheet({ ...copy, danger: true }))) return setOpen(w, false), setTimeout(() => w.querySelector('.ix, .ln-stn').focus(), 320);
    if (kind === 'chat') await deleteChat(id);
    else if (kind === 'char') await deleteCharacter(id);
    else await deleteInterchange(id);
    await collapse(goneBox);
    redraw();
    refocus();
    toast(kind === 'chat' ? 'Chat deleted' : `${name} deleted`);
  });
}
// The row folds its height away before the list redraws.
function collapse(w) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  w.style.height = w.offsetHeight + 'px';
  w.getBoundingClientRect();
  w.classList.add('gone');
  return new Promise((r) => setTimeout(r, 300));
}
