// Lines: every character (and later every Interchange), all departures, the full Logbook,
// and a search across names, taglines and every message in every chat.
import { S, textOf, departures, logbook, character, lastMessage, interchange } from '../store.js';
import { esc, ago, agoLong, plain, inkOn, debounce, formatMessage } from '../util.js';
import { title2, avatarBullet, tabbar, icon } from '../ui.js';

const FILTERS = [
  ['all', 'All'],
  ['recent', 'Recent'],
  ['starred', 'Starred'],
  ['interchanges', 'Interchanges'],
];

const colorVars = (c) => {
  const col = c.line?.color || '#2EAA67';
  return `--c:${col};--ink:${inkOn(col)}`;
};

function lineRow(c) {
  const chat = S.chats.get(c.id);
  const when = chat && chat.messages.some((m) => m.role === 'user') ? ago(chat.updatedAt) : 'new';
  return `<a class="ix press" href="#/chat/${c.id}" style="${colorVars(c)}" aria-label="Chat with ${esc(c.name)}">${avatarBullet(c, 44, '', `line:${c.id}`)}<span class="row-tx"><span class="row-t">${esc(c.name)}</span><span class="row-s">${esc(c.tagline || 'No tagline')}</span></span><span class="ix-t num">${when}</span></a>`;
}

function ixRow(ix) {
  const chat = S.chats.get(ix.id);
  const when = chat && chat.messages.some((m) => m.role === 'user') ? ago(chat.updatedAt) : 'new';
  return `<a class="ix ixg press" href="#/chat/${ix.id}" aria-label="Open ${esc(ix.title)}"><span class="meet">${ix.people.map((p, i) => avatarBullet(p, 40, i ? 'margin-left:-14px' : '')).join('')}</span><span class="row-tx"><span class="row-t">${esc(ix.title)}</span><span class="row-s">Interchange · ${ix.people.map((p) => esc(p.name)).join(', ')}</span></span><span class="ix-t num">${when}</span></a>`;
}

function departureRow({ c, chat, ix }) {
  if (ix) return ixRow(ix);
  return `<a class="ix press" href="#/chat/${c.id}" style="${colorVars(c)}" aria-label="Chat with ${esc(c.name)}">${avatarBullet(c, 44, '', `line:${c.id}`)}<span class="row-tx"><span class="row-t">${esc(c.name)}</span><span class="row-s">${esc(plain(textOf(lastMessage(chat))))}</span></span><span class="ix-t num">${ago(chat.updatedAt)}</span></a>`;
}

function starRow({ chat, m }) {
  const c = character(m.speaker) || character(chat.characterId) || interchange(chat.characterId)?.people[0];
  if (!c) return '';
  const t = textOf(m);
  return `<a class="stub press" href="#/chat/${chat.characterId}/m/${m.id}" style="${colorVars(c)}"><span class="stub-l">${avatarBullet(c, 32)}</span><span class="stub-r"><span class="stub-m"><b>${esc(c.name)}</b><span>${agoLong(m.star)}</span></span><span class="stub-p">${formatMessage(t.length > 240 ? t.slice(0, 237) + '…' : t)}</span></span></a>`;
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
  const rooms = [...S.characters.map((c) => ({ id: c.id, c })), ...S.interchanges.map((x) => interchange(x.id)).filter(Boolean).map((ix) => ({ id: ix.id, ix }))];
  for (const r of rooms) {
    const chat = S.chats.get(r.id);
    if (!chat) continue;
    for (const m of chat.messages) {
      const t = textOf(m);
      if (!t.toLowerCase().includes(ql)) continue;
      const c = r.c || character(m.speaker) || r.ix.people[0];
      hits.push({ c, m, t, room: r.id, where: r.ix ? r.ix.title : c.name });
    }
  }
  hits.sort((a, b) => (b.m.at || 0) - (a.m.at || 0));
  const msgs = hits.slice(0, 40);
  if (!lines.length && !msgs.length) return `<p class="search-none">Nothing on the network matches “${esc(q)}”.</p>`;
  return (
    (lines.length ? `<div class="blk"><div class="hrow"><h2 class="h">Lines</h2><span class="small">${lines.length}</span></div><div class="index">${lines.map(lineRow).join('')}</div></div>` : '') +
    (msgs.length
      ? `<div class="blk"><div class="hrow"><h2 class="h">Said on the line</h2><span class="small">${hits.length > 40 ? '40 of ' + hits.length : hits.length}</span></div><div class="hits">${msgs
          .map(
            ({ c, m, t, room, where }) =>
              `<a class="hit press" href="#/chat/${room}/m/${m.id}">${avatarBullet(c, 30)}<span class="hit-tx"><b>${m.role === 'user' ? 'You to ' + esc(where) : esc(c.name) + (where !== c.name ? ' in ' + esc(where) : '')}</b><span>${snippet(t, q)}</span></span></a>`
          )
          .join('')}</div></div>`
      : '')
  );
}

export function linesView(filter = 'all') {
  if (!FILTERS.some(([k]) => k === filter)) filter = 'all';
  const sorted = S.characters.slice().sort((a, b) => a.name.localeCompare(b.name));
  const body = () => {
    if (filter === 'recent') {
      const deps = departures();
      return deps.length ? `<div class="index">${deps.map(departureRow).join('')}</div>` : `<p class="search-none">No departures yet. Pick a line under All and say hello.</p>`;
    }
    if (filter === 'interchanges') {
      const all = S.interchanges.map((x) => interchange(x.id)).filter(Boolean);
      return `<div class="index">${all.map(ixRow).join('')}<a class="ix ix-new press" href="#/interchange/new"><span class="bullet ix-new-b" style="width:44px;height:44px">${icon('track', 22)}</span><span class="row-tx"><span class="row-t">New interchange</span><span class="row-s">Let 2–3 lines meet in one chat</span></span></a></div>`;
    }
    if (filter === 'starred') {
      const log = logbook();
      return log.length ? `<div class="roll">${log.map(starRow).join('')}</div>` : `<p class="search-none">Nothing starred yet. Long-press a message in a chat and tap Star.</p>`;
    }
    const groups = S.interchanges.map((x) => interchange(x.id)).filter(Boolean);
    return `<div class="index">${sorted.map(lineRow).join('')}${groups.map(ixRow).join('')}<a class="ix ix-new press" href="#/edit/new">${`<span class="bullet ix-new-b" style="width:44px;height:44px">${icon('track', 22)}</span>`}<span class="row-tx"><span class="row-t">New line</span><span class="row-s">Create a character</span></span></a></div>`;
  };

  const html = `<div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      ${title2('Lines', 'Where to?')}
      <label class="ibtn press" title="Import a character card" style="cursor:pointer">${icon('upload')}<span class="vh">Import a character card</span><input type="file" accept=".png,.json,image/png,application/json" id="linesCardIn" class="vh" multiple></label>
    </div>
    <label class="search">${icon('search', 20)}<input id="q" type="search" placeholder="Name, line or something they said" aria-label="Search lines and messages" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips-f" role="tablist" aria-label="Show">${FILTERS.map(([k, l]) => `<a class="press${k === filter ? ' on' : ''}" role="tab" aria-selected="${k === filter}" href="#/lines${k === 'all' ? '' : '/' + k}">${l}</a>`).join('')}</div>
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
      root.querySelector('#linesCardIn').addEventListener('change', async (e) => {
        const { importCardFiles } = await import('./settings.js');
        importCardFiles(e.target);
      });
    },
  };
}
