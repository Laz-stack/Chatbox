// Scenes: every painted scene is kept, per chat (⋯ › Scenes) and across all chats (Depot › Scenes).
// A scene stays here even after the reply it was painted for is regenerated or deleted. Open one to
// see what was painted, show it in the chat's window, save it to the phone, or remove it.
import { S, saveChat, character, interchange } from '../store.js';
import { scenesOf, removeScene, picSrc, altOf, gcPictures, STYLES } from '../pictures.js';
import { esc, slug, download } from '../util.js';
import { openSheet, topbar, icon, toast, emptySign } from '../ui.js';

const ownerName = (chat) => (chat.id.startsWith('ix-') ? interchange(chat.id)?.title : character(chat.characterId)?.name) || 'Chat';
const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const label = (x) => x.caption || STYLES[x.style]?.label || 'Scene';

const thumbs = (chat, list) =>
  `<div class="scn-grid">${list
    .slice()
    .reverse()
    .map((x) => `<button type="button" class="scn-th press" data-chat="${esc(chat.id)}" data-key="${esc(x.key)}" aria-label="${esc(label(x))}"><img src="${esc(picSrc(x))}" alt="" loading="lazy"><span>${esc(label(x))}</span></button>`)
    .join('')}</div>`;

// One scene, full size, with its actions.
export function openScene(chat, x, { inChat = false, onChange } = {}) {
  const lb = document.createElement('div');
  lb.className = 'lightbox pic-lb scn-lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Scene');
  const isWin = chat.bgPic === x.key;
  const acts = [
    ['window', 'image', isWin ? 'Shown in the window' : 'Show in the window'],
    ['save', 'download', 'Save to phone'],
    ...(inChat ? [] : [['open', 'chev', `Open ${ownerName(chat)}`]]),
    ['remove', 'trash', 'Remove from Scenes'],
  ];
  lb.innerHTML = `<img src="${esc(picSrc(x))}" alt="${esc(altOf(x))}"><div class="pic-lb-bar"><p class="scn-cap">${esc(label(x))}${x.at ? ` · ${esc(when(x.at))}` : ''}</p><details><summary>${icon('chev', 16)}What was painted</summary><p>${esc(x.prompt || '')}</p></details><div class="pic-lb-acts">${acts.map(([k, ic, l]) => `<button type="button" class="press" data-act="${k}"${k === 'window' && isWin ? ' aria-pressed="true"' : ''}>${icon(ic, 16)}${esc(l)}</button>`).join('')}<button type="button" class="press" data-close>${icon('x', 16)}Close</button></div></div>`;
  const back = document.activeElement;
  const shut = () => (lb.remove(), document.removeEventListener('keydown', key, true), back?.isConnected && back.focus());
  // Escape closes only this view; Tab stays inside it.
  const key = (k) => {
    if (k.key === 'Escape') return k.stopPropagation(), k.preventDefault(), shut();
    if (k.key !== 'Tab') return;
    const f = [...lb.querySelectorAll('button, summary')];
    const i = f.indexOf(document.activeElement);
    if (k.shiftKey && i <= 0) k.preventDefault(), f.at(-1).focus();
    else if (!k.shiftKey && i === f.length - 1) k.preventDefault(), f[0].focus();
  };
  lb.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return (e.target.closest('[data-close]') || e.target === lb) && shut();
    const a = b.dataset.act;
    if (a === 'window') {
      chat.bgPic = chat.bgPic === x.key ? null : x.key;
      await saveChat(chat);
      toast(chat.bgPic ? 'Shown in the window' : 'Window back to the card picture');
      shut();
      onChange?.('window');
    } else if (a === 'save') {
      const blob = await (await fetch(picSrc(x))).blob();
      const ext = /png/.test(blob.type) ? 'png' : /webp/.test(blob.type) ? 'webp' : /svg/.test(blob.type) ? 'svg' : 'jpg';
      download(blob, `${slug(ownerName(chat))}-scene-${new Date(x.at || Date.now()).toISOString().slice(0, 10)}.${ext}`);
      toast('Saved to your downloads');
    } else if (a === 'open') {
      shut();
      location.hash = `#/chat/${encodeURIComponent(chat.id)}`;
    } else if (a === 'remove') {
      removeScene(chat, x.key);
      if (chat.bgPic === x.key && !(chat.messages || []).some((m) => (m.pics || []).some((p) => p.key === x.key))) chat.bgPic = null;
      await saveChat(chat);
      await gcPictures();
      shut();
      toast('Removed from Scenes');
      onChange?.('remove');
    }
  });
  document.addEventListener('keydown', key, true);
  document.body.appendChild(lb);
  lb.querySelector('[data-act]')?.focus({ preventScroll: true });
}

// ⋯ › Scenes in a chat.
export function scenesSheet(chat, { title = '', onWindow } = {}) {
  const body = () => {
    const list = scenesOf(chat);
    return list.length
      ? `<p class="sheet-p">${list.length === 1 ? 'One scene' : `${list.length} scenes`} painted in this chat, newest first. They stay here even if the reply they were painted for is changed.</p>${thumbs(chat, list)}`
      : emptySign('No scenes yet', 'Hold a reply › Picture this to paint one, or turn on Paint each new station there. Every scene is kept here.', '', title || 'This chat');
  };
  openSheet({
    label: 'Scenes',
    html: `<h2 class="sheet-title" tabindex="-1">Scenes</h2><div id="scnBody">${body()}</div>`,
    onMount(s) {
      s.addEventListener('click', (e) => {
        const t = e.target.closest('.scn-th');
        if (!t) return;
        const x = scenesOf(chat).find((y) => y.key === t.dataset.key);
        if (x)
          openScene(chat, x, {
            inChat: true,
            onChange: (what) => {
              if (what === 'window') return onWindow?.();
              s.querySelector('#scnBody').innerHTML = body();
              (s.querySelector('.scn-th') || s.querySelector('.sheet-title'))?.focus?.();
              onWindow?.();
            },
          });
      });
    },
  });
}

// Depot › Scenes: every chat's scenes, the most recently painted chat first.
export function scenesView() {
  const groups = () =>
    [...S.chats.values()]
      .map((c) => ({ c, list: scenesOf(c) }))
      .filter((g) => g.list.length)
      .sort((a, b) => (b.list.at(-1).at || 0) - (a.list.at(-1).at || 0));
  const body = () => {
    const gs = groups();
    if (!gs.length) return emptySign('No scenes yet', 'Scenes you paint in any chat are kept here. Set up Pictures, then hold a reply › Picture this.', `<a class="pill press" href="#/connections/pictures">Pictures${icon('chev', 15)}</a>`, 'Depot · Scenes');
    const total = gs.reduce((n, g) => n + g.list.length, 0);
    // Roughly how much room they take on this device (pictures are stored as text, about 4/3 of their size).
    const bytes = gs.reduce((n, g) => n + g.list.reduce((m, x) => m + (S.images?.[x.key]?.length || 0) * 0.75, 0), 0);
    const size = bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
    return `<p class="scn-sum">${total} ${total === 1 ? 'scene' : 'scenes'} across ${gs.length} ${gs.length === 1 ? 'chat' : 'chats'} · ${size} on this phone${bytes > 50e6 ? '. Removing ones you don’t need frees space.' : ''}</p>${gs
      .map(({ c, list }) => `<section class="scn-sec"><a class="scn-h press" href="#/chat/${encodeURIComponent(c.id)}"><b>${esc(ownerName(c))}</b><span>${list.length}</span>${icon('chev', 16)}</a>${thumbs(c, list)}</section>`)
      .join('')}`;
  };
  const html = `<div class="screen no-tab scn-screen">${topbar({ back: '#/settings', title: 'Scenes' })}<div id="scnAll">${body()}</div></div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      root.querySelector('#scnAll').addEventListener('click', (e) => {
        const t = e.target.closest('.scn-th');
        if (!t) return;
        const c = S.chats.get(t.dataset.chat);
        const x = c && scenesOf(c).find((y) => y.key === t.dataset.key);
        if (x) openScene(c, x, { onChange: () => ((root.querySelector('#scnAll').innerHTML = body()), (root.querySelector('.scn-th') || root.querySelector('.tb-title'))?.focus?.()) });
      });
    },
  };
}
export const sceneCount = () => [...S.chats.values()].reduce((n, c) => n + scenesOf(c).length, 0);
