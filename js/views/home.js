import { S, activeConnection, lastMessage, textOf, named, departures, logbook, character, interchange, latestChat, personaFor } from '../store.js';
import { esc, ago, agoLong, plain, inkOn, luminance, boardTime, formatMessage } from '../util.js';
import { avatarTile } from '../avatar.js';
import { title2, bullet, avatarBullet, tabbar, icon, arrow } from '../ui.js';
import { importCardFiles } from './settings.js';

export function homeView() {
  const conn = activeConnection();
  const started = departures();
  const featured = started.find((x) => !x.ix)?.c || S.characters[0];

  let hero;
  if (featured) {
    const chat = latestChat(featured.id);
    const n = chat ? chat.messages.length : 0;
    const dots = Math.max(2, Math.min(6, n));
    const preview = plain(named(textOf(lastMessage(chat)), featured, 'you', personaFor(chat)) || featured.tagline || 'Start the conversation');
    // The hero is painted in the character's own line colour, with ink that reads on it.
    const lc = featured.line?.color || '#2EAA67';
    hero = `<a class="hero press" href="#/chat/${featured.id}" style="--line:${lc};--on:${inkOn(lc)};--ring:${luminance(lc) > 0.55 ? '#0A0A0A' : '#FFFFFF'}" aria-label="${started[0] ? 'Continue chatting with' : 'Start chatting with'} ${esc(featured.name)}">
      <span class="hero-arrow">${arrow(128, 'currentColor')}</span>
      <span class="hero-av" data-av="hero:${esc(featured.id)}">${avatarTile(featured, 92, { radius: 26, rot: -4 })}</span>
      <span class="hero-foot">
        <span class="hero-kicker">${avatarBullet(featured, 34)}${started[0] ? 'Continue the chat' : 'Start a chat'}</span>
        <span class="hero-name">${esc(featured.name)}<span class="hero-sub">${esc(featured.tagline || preview)}</span></span>
        <span class="hero-line" aria-hidden="true">${Array.from({ length: dots }, (_, i) => `<i${i === dots - 1 ? ' class="now"' : ''} style="animation-delay:${0.4 + i * 0.06}s"></i>`).join('')}</span>
      </span></a>`;
  } else {
    hero = `<a class="hero empty press" href="#/edit/new">
      <span class="hero-arrow">${arrow(128, '#0A0A0A')}</span>
      <span class="hero-foot"><span class="hero-name">New line<span class="hero-sub">Create your first character</span></span></span></a>`;
  }

  let banner = '';
  if (!conn || conn.provider === 'demo') {
    banner = `<a class="banner press" href="${conn ? '#/connection/new' : '#/connection/new'}">${bullet(icon('link', 18), '#FDCD15', '#0A0A0A', 40)}<span class="bt"><b>Connect your AI</b><span>You're on demo replies. Add your own API key to chat for real.</span></span>${icon('chev', 18)}</a>`;
  } else if (S.settings.remindBackup && started.length && Date.now() - (S.settings.lastBackup || Math.min(...started.map((x) => x.chat.startedAt || x.chat.updatedAt))) > 7 * 864e5) {
    // Due a week after the last backup, or a week after the first chat began (not right after the first message).
    banner = `<a class="banner press" href="#/backup">${bullet(icon('download', 18), '#FE6500', '#0A0A0A', 40)}<span class="bt"><b>Back up your chats</b><span>${S.settings.lastBackup ? 'Last backup ' + ago(S.settings.lastBackup) + ' ago' : 'Everything lives only in this browser'}.</span></span>${icon('chev', 18)}</a>`;
  }

  // Departures board: the three most recent chats, on a cream signboard with a yellow header.
  const now = new Date();
  const board = started.length
    ? `<div class="board"><div class="bd-head"><span>Departures</span><span class="num">${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div>${started
        .slice(0, 3)
        .map(
          ({ c, chat, ix }) =>
            ix
              ? `<a class="bd-row press" href="#/chat/${ix.id}" aria-label="Open ${esc(ix.title)}"><span class="num t">${boardTime(chat.updatedAt)}</span><span class="meet sm">${ix.people.map((p, i) => avatarBullet(p, 30, i ? 'margin-left:-14px' : '')).join('')}</span><span class="bd-tx"><b>${esc(ix.title)}</b><span>${esc(plain(named(textOf(lastMessage(chat)), character(lastMessage(chat)?.speaker) || ix.people[0])))}</span></span></a>`
              : `<a class="bd-row press" href="#/chat/${chat.id}" aria-label="Chat with ${esc(c.name)}"><span class="num t">${boardTime(chat.updatedAt)}</span>${avatarBullet(c, 30, '', `dep:${c.id}`)}<span class="bd-tx"><b>${esc(c.name)}</b><span>${esc(plain(named(textOf(lastMessage(chat)), c)) || c.tagline)}</span></span></a>`
        )
        .join('')}<a class="bd-foot press" href="#/lines/recent">All departures ${icon('chev', 14)}</a></div>`
    : `<div class="board"><div class="bd-head"><span>Departures</span></div><a class="bd-empty press" href="#/lines">No departures yet. Pick a line and say hello. ${icon('chev', 14)}</a></div>`;

  // Logbook: starred moments from every chat, each ticket in its character's own colour.
  const log = logbook();
  const stub = ({ chat, m, q, at }) => {
    // In an interchange the ticket belongs to whoever said it (you: the first member's colour).
    const ixr = interchange(chat.characterId);
    const c = (q && character(q.who)) || character(m.speaker) || character(chat.characterId) || ixr?.people[0];
    if (!c) return '';
    const col = c.line?.color || '#2EAA67';
    const t = q ? `“${q.text}”` : named(textOf(m), c);
    return `<a class="stub press" href="#/chat/${chat.id}/m/${m.id}" style="--c:${col};--ink:${inkOn(col)}"><span class="stub-l">${avatarBullet(c, 32)}</span><span class="stub-r"><span class="stub-m"><b>${esc(q?.name || c.name)}</b><span>${agoLong(at)}</span></span><span class="stub-p">${formatMessage(t.length > 200 ? t.slice(0, 197) + '…' : t)}</span></span></a>`;
  };
  const logbookHTML = `<div class="blk logbook"><div class="hrow"><h2 class="h">Logbook</h2>${log.length > 3 ? `<a class="small press" href="#/lines/starred">See all ${log.length}</a>` : `<span class="small">${log.length ? log.length + ' starred' : 'Starred moments'}</span>`}</div>
    ${log.length ? `<div class="roll">${log.slice(0, 3).map(stub).join('')}</div>` : `<div class="log-empty">${icon('star', 20)}<span>Long-press any message in a chat and tap <b>Star</b>. Your favourite moments land here.</span></div>`}</div>`;

  const html = `<div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      ${title2('Chatbox', 'Your lines tonight')}
      <label class="ibtn press" title="Import a character card" style="cursor:pointer">${icon('upload')}<span class="vh">Import a character card</span><input type="file" accept=".png,.json,image/png,application/json" id="homeCardIn" class="vh" multiple></label>
    </div>
    ${hero}${banner}
    <div class="blk">${board}</div>
    ${logbookHTML}
  </div>${tabbar('home')}`;

  return {
    html,
    depth: 0,
    mount(root) {
      root.querySelector('#homeCardIn').addEventListener('change', (e) => importCardFiles(e.target));
    },
  };
}
