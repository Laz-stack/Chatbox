import { S, activeConnection, hasStarted, lastMessage, textOf } from '../store.js';
import { esc, ago, plain, inkOn, luminance } from '../util.js';
import { avatarTile } from '../avatar.js';
import { title2, bullet, avatarBullet, row, tabbar, icon, arrow } from '../ui.js';
import { importCardFiles } from './settings.js';

export function homeView() {
  const conn = activeConnection();
  const started = S.characters
    .map((c) => ({ c, chat: S.chats.get(c.id) }))
    .filter((x) => hasStarted(x.chat))
    .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt);
  const featured = started[0]?.c || S.characters[0];

  let hero;
  if (featured) {
    const chat = S.chats.get(featured.id);
    const n = chat ? chat.messages.length : 0;
    const dots = Math.max(2, Math.min(6, n));
    const preview = plain(textOf(lastMessage(chat)) || featured.tagline || 'Start the conversation');
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

  const lines =
    S.characters
      .map(
        (c, i) =>
          `<a class="line-item" href="#/chat/${c.id}" aria-label="Chat with ${esc(c.name)}">${avatarBullet(c, 52, `animation-delay:${0.25 + i * 0.06}s`, `line:${c.id}`)}<span class="nm">${esc(c.name)}</span></a>`
      )
      .join('') +
    `<a class="line-item line-new" href="#/edit/new" aria-label="New character">${bullet(icon('plus', 22), 'transparent', 'var(--cream)', 52, `animation-delay:${0.25 + S.characters.length * 0.06}s`)}<span class="nm">New</span></a>`;

  const departures = started.slice(0, 8).map(({ c, chat }, i) => {
    const last = lastMessage(chat);
    return row({
      href: `#/chat/${c.id}`,
      lead: avatarBullet(c, 38, '', `dep:${c.id}`),
      title: esc(c.name),
      sub: esc(plain(textOf(last)) || c.tagline),
      right: `<span class="row-end num">${ago(chat.updatedAt)}</span>`,
    }).replace('class="row press"', `class="row press" style="animation-delay:${0.35 + i * 0.05}s"`);
  });

  const html = `<div class="screen">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      ${title2('Chatbox', 'Your lines tonight')}
      <label class="ibtn press" title="Import a character card" style="cursor:pointer">${icon('upload')}<span class="vh">Import a character card</span><input type="file" accept=".png,.json,image/png,application/json" id="homeCardIn" class="vh" multiple></label>
    </div>
    ${hero}${banner}
    <div style="margin-top:22px"><div class="hrow"><h2 class="h">Lines</h2><span class="small">${S.characters.length} character${S.characters.length === 1 ? '' : 's'}</span></div><div class="lines">${lines}</div></div>
    ${departures.length ? `<div style="margin-top:20px"><div class="hrow"><h2 class="h">Departures</h2><span class="small">Recent chats</span></div><div class="group board">${departures.join('')}</div></div>` : ''}
  </div>${tabbar('home')}`;

  return {
    html,
    depth: 0,
    mount(root) {
      root.querySelector('#homeCardIn').addEventListener('change', (e) => importCardFiles(e.target));
    },
  };
}
