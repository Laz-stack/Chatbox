// Lines: every character (and later every Interchange), all departures, the full Logbook,
// and a search across names, taglines and every message in every chat.
import { S, textOf, named, departures, logbook, character, lastMessage, interchange, latestChat, chatsFor } from '../store.js';
import { esc, ago, agoLong, plain, inkOn, debounce, formatMessage, cleanTagline } from '../util.js';
import { title2, avatarBullet, tabbar, icon, groupAvatar, emptySign } from '../ui.js';
import { startImport } from './import.js';

const FILTERS = [
  ['recent', 'Recent'],
  ['all', 'All'],
  ['starred', 'Starred'],
  ['narrators', 'One narrator'],
  ['interchanges', 'Interchanges'],
];

// A character imported as one narrator for a multi-character card.
export const isNarrator = (c) => !!(c.narrator || (c.source?.story && c.name === c.source.story));
const section = (title, n, rows) => (n ? `<h2 class="ln-sec">${title}<span class="num">${n}</span></h2><div class="index">${rows}</div>` : '');

const colorVars = (c) => {
  const col = c.line?.color || '#2EAA67';
  return `--c:${col};--ink:${inkOn(col)}`;
};

// The avatar on a plate. A letter avatar on its own line colour would vanish into the plate,
// so it shows as a dark station badge instead.
const badge = (c) => (!c.avatarImage && (c.preset === 'initial' || !c.preset) ? avatarBullet({ ...c, line: { ...c.line, color: '#0A0A0A' } }, 44, '', `line:${c.id}`) : avatarBullet(c, 44, '', `line:${c.id}`));

function lineRow(c) {
  const chat = latestChat(c.id);
  const n = chatsFor(c.id).filter((x) => x.messages.some((m) => m.role === 'user')).length;
  const when = chat && chat.messages.some((m) => m.role === 'user') ? (ago(chat.updatedAt) === 'now' ? 'just now' : ago(chat.updatedAt)) : 'not started';
  return `<a class="ix press" href="#/chat/${c.id}" style="${colorVars(c)}" aria-label="Chat with ${esc(c.name)}">${badge(c)}<span class="row-tx"><span class="row-t">${esc(c.name)}</span><span class="row-s">${esc(cleanTagline(c.tagline, c.name) || 'No tagline')}${n > 1 ? ` · ${n} chats` : ''}</span></span><span class="ix-t num">${when}</span></a>`;
}

function ixRow(ix) {
  const chat = latestChat(ix.id);
  const when = chat && chat.messages.some((m) => m.role === 'user') ? (ago(chat.updatedAt) === 'now' ? 'just now' : ago(chat.updatedAt)) : 'not started';
  return `<a class="ix ixg press" href="#/chat/${ix.id}" aria-label="Open ${esc(ix.title)}">${groupAvatar(ix, 44)}<span class="row-tx"><span class="row-t">${esc(ix.title)}</span><span class="row-s">${ix.mode === 'scene' ? 'Carriage' : 'Interchange'} · ${ix.people.map((p) => esc(p.name)).join(', ')}</span></span><span class="ix-t num">${when}</span></a>`;
}

function departureRow({ c, chat, ix }) {
  if (ix) return ixRow(ix);
  return `<a class="ix press" href="#/chat/${chat.id}" style="${colorVars(c)}" aria-label="Chat with ${esc(c.name)}">${badge(c)}<span class="row-tx"><span class="row-t">${esc(c.name)}</span><span class="row-s">${esc(plain(named(textOf(lastMessage(chat)), c)))}</span></span><span class="ix-t num">${ago(chat.updatedAt)}</span></a>`;
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
  // Lines opens on Recent; with nothing started yet, on All.
  if (!FILTERS.some(([k]) => k === filter)) filter = departures().length ? 'recent' : 'all';
  const sorted = S.characters.slice().sort((a, b) => a.name.localeCompare(b.name));
  const body = () => {
    if (filter === 'recent') {
      const deps = departures();
      return deps.length
        ? section('Recent', deps.length, deps.map(departureRow).join('')) + (deps.length < 4 ? `<a class="ln-all press" href="#/lines/all">All lines${icon('chev', 16)}</a>` : '')
        : emptySign('No departures yet', 'Pick a line under All and say hello.', `<a class="pill press" href="#/lines/all">All lines${icon('chev', 15)}</a>`, 'Lines · Recent');
    }
    if (filter === 'interchanges') {
      const all = S.interchanges.map((x) => interchange(x.id)).filter(Boolean);
      return `<div class="index">${all.map(ixRow).join('')}<a class="ix ix-new press" href="#/interchange/new"><span class="bullet ix-new-b" style="width:44px;height:44px">${icon('track', 22)}</span><span class="row-tx"><span class="row-t">New interchange</span><span class="row-s">Let 2–5 lines meet in one chat</span></span></a></div>`;
    }
    if (filter === 'narrators') {
      const list = sorted.filter(isNarrator);
      return list.length ? `<div class="index">${list.map(lineRow).join('')}</div>` : emptySign('No narrators yet', 'Import a card with several characters and choose One narrator.', '', 'Lines · One narrator');
    }
    if (filter === 'starred') {
      const log = logbook();
      return log.length ? `<div class="roll">${log.map(starRow).join('')}</div>` : emptySign('Nothing starred yet', 'Long-press a message in a chat and tap Star. It lands here.', '', 'Lines · Starred');
    }
    const groups = S.interchanges.map((x) => interchange(x.id)).filter(Boolean);
    const chars = sorted.filter((c) => !isNarrator(c));
    const narr = sorted.filter(isNarrator);
    return section('Characters', chars.length, chars.map(lineRow).join('')) + section('One narrator', narr.length, `<p class="ln-note">Cards with several characters, played by one narrator who voices them all.</p>` + narr.map(lineRow).join('')) + section('Interchanges', groups.length, groups.map(ixRow).join('')) + `<div class="index" style="margin-top:12px"><a class="ix ix-new press" href="#/edit/new">${`<span class="bullet ix-new-b" style="width:44px;height:44px">${icon('track', 22)}</span>`}<span class="row-tx"><span class="row-t">New line</span><span class="row-s">Create a character</span></span></a></div>`;
  };

  const html = `<div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      ${title2('Lines', 'Where to?')}
      <label class="ibtn press" title="Import a character card" style="cursor:pointer">${icon('upload')}<span class="vh">Import a character card</span><input type="file" accept=".zip,.png,.json,application/zip,image/png,application/json" id="linesCardIn" class="vh" multiple></label>
    </div>
    <label class="search">${icon('search', 20)}<input id="q" type="search" placeholder="Name, line or something they said" aria-label="Search lines and messages" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips-f" role="tablist" aria-label="Show">${FILTERS.map(([k, l]) => `<a class="press${k === filter ? ' on' : ''}" role="tab" aria-selected="${k === filter}" href="#/lines/${k}">${l}</a>`).join('')}</div>
    <div id="results"><div class="blk-tight">${body()}</div></div>
  </div>${tabbar('lines')}`;

  return {
    html,
    depth: 0,
    mount(root) {
      const input = root.querySelector('#q');
      const results = root.querySelector('#results');
      const chips = root.querySelector('.chips-f');
      const base = results.innerHTML;
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
