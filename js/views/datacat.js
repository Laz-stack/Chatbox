// Browse Datacat: datacat.run inside Chatbox, through Datacat's own embed bridge (the one its
// SillyTavern extension uses). Datacat adds an import button to each character; tapping it sends
// the character card (a PNG) here. Cards wait in the tray under the page and go through the usual
// import review together, so nothing is saved without you seeing it first.
//
// Safety: the page is Datacat's, running from its own address, so it can't read anything Chatbox
// keeps. Only messages from that frame, from exactly https://datacat.run, carrying this visit's
// random code are accepted, and a card has to be a real PNG under 32 MB. The frame can't steer
// Chatbox away (no top navigation). Chatbox never asks for anything inside it.
import { ibtn, icon, openSheet, toast } from '../ui.js';
import { esc } from '../util.js';
import { startImport } from './import.js';

const ORIGIN = 'https://datacat.run';
const START = ORIGIN + '/characters/recent';
const MSG = {
  init: 'datacat:st-bridge:init',
  ready: 'datacat:st-bridge:ready',
  prepare: 'datacat:st-character-card:prepare',
  card: 'datacat:st-character-card',
  ack: 'datacat:st-character-card:ack',
};
// Datacat's page only connects to a parent that introduces itself this way.
const PARENT = 'sillytavern-datacat-browser';
const MAX = 32 * 1024 * 1024;
const REQ = /^[\w.:-]{1,128}$/;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Cards waiting for review. Kept while Chatbox is open, so you can leave this screen and come back.
const tray = [];
// Saved by the import review: those cards leave the tray.
addEventListener('chatbox:imported', (e) => {
  const done = new Set(e.detail?.files || []);
  for (let i = tray.length - 1; i >= 0; i--) if (done.has(tray[i].file)) URL.revokeObjectURL(tray.splice(i, 1)[0].url);
});
const nameOf = (m) => String(m?.characterName || m?.name || 'Character').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Character';
const idOf = (m) => String(m?.datacatCharacterId || m?.characterId || '').trim().toLowerCase().slice(0, 64);

function isPng(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength < 64 || buf.byteLength > MAX) return false;
  const b = new Uint8Array(buf, 0, 8);
  return PNG.every((x, i) => b[i] === x);
}

export function datacatView() {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
  const src = new URL(START);
  src.searchParams.set('dc_embed', 'st');
  src.searchParams.set('dc_bridge_nonce', nonce);
  const html = `<div class="screen no-tab dc-screen">
    <div class="topbar">${ibtn('back', 'Back', { href: '#/' })}<h1 class="tb-title dc-tt">Datacat’s page<small>datacat.run</small></h1><a class="ibtn ghost press" href="${START}" target="_blank" rel="noopener noreferrer" aria-label="Open Datacat in your browser">${icon('link', 18)}</a></div>
    <div class="dc-frame" id="dcBox"><p class="dc-wait" id="dcWait">Opening Datacat…</p>
      <iframe id="dcFrame" title="Datacat’s page (datacat.run)" src="${esc(src.href)}" referrerpolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"></iframe>
      <div class="dc-tray" id="dcTray">
        <button type="button" class="dc-list press" id="dcList"><span class="dc-stack" id="dcStack" aria-hidden="true"></span><span class="dc-tx"><b id="dcT"></b><small id="dcS"></small></span></button>
        <button type="button" class="dc-go press" id="dcGo">Review</button>
        <a class="dc-go dc-open press" id="dcOpen" href="${START}" target="_blank" rel="noopener noreferrer" hidden>Open</a>
      </div>
    </div>
    <p class="vh" id="dcSt" role="status" aria-live="polite"></p>
  </div>`;

  let root = null;
  let frame, trayEl, connected = false, quiet = false, quietTimer = 0;
  const post = (data) => frame?.contentWindow?.postMessage({ ...data, nonce }, ORIGIN);
  const ack = (requestId, status, message) => post({ type: MSG.ack, requestId, status, message });

  // The tray is updated in place: the status line stays one element (so it's announced), focus
  // stays where it was, and only a newly arrived picture animates in.
  // The tray slides up only when there's something in it (or Datacat isn't answering), floating
  // at the foot of the page; the page shortens under it so Datacat's own buttons stay reachable.
  // It's updated in place, so focus stays put, and only a newly arrived card pops in.
  const paint = (added = false) => {
    if (!root) return;
    const $ = (x) => root.querySelector(x);
    const n = tray.length;
    const on = n > 0 || quiet;
    $('#dcTray').classList.toggle('on', on);
    $('#dcBox').classList.toggle('tray-on', on);
    $('#dcT').textContent = n ? `${n} card${n === 1 ? '' : 's'} waiting` : 'Datacat isn’t answering';
    $('#dcS').textContent = n ? tray.map((c) => c.name).join(', ') : 'Open it in your browser instead';
    const st = n ? `${n} card${n === 1 ? '' : 's'} waiting: ${tray.at(-1).name} arrived.` : quiet ? 'Datacat isn’t answering. Open it in your browser instead.' : '';
    if ($('#dcSt').textContent !== st) $('#dcSt').textContent = st;
    const stack = $('#dcStack');
    const shown = tray.slice(-3);
    stack.replaceChildren(...shown.map((c, i) => Object.assign(document.createElement('img'), { src: c.url, alt: '', className: added && i === shown.length - 1 ? 'pop' : '' })));
    stack.querySelectorAll('img').forEach((im, i) => im.style.setProperty('--r', [-6, 4, -2][i] + 'deg'));
    stack.hidden = !n;
    $('#dcList').disabled = !n;
    $('#dcList').setAttribute('aria-label', n ? `See the ${n} waiting card${n === 1 ? '' : 's'}` : 'Datacat isn’t answering');
    $('#dcGo').hidden = !n;
    $('#dcOpen').hidden = !!n || !quiet;
  };
  const LIMIT = 20;
  const LIMIT_BYTES = 120 * 1024 * 1024;

  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === MSG.ready) {
      // Introduce ourselves when Datacat asks (first load, or after it reloads inside the frame).
      if (d.needsInit || d.nonce !== nonce) return post({ type: MSG.init, source: PARENT });
      if (!connected) (connected = true), (quiet = false), clearTimeout(quietTimer), root?.querySelector('#dcWait')?.remove(), paint();
      return;
    }
    if (d.nonce !== nonce || !REQ.test(String(d.requestId || ''))) return;
    const m = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
    if (d.type === MSG.prepare) {
      const id = idOf(m);
      if (id && tray.some((c) => c.id === id)) return ack(d.requestId, 'existing', 'Already waiting in Chatbox. Review it there.');
      if (tray.length >= LIMIT) return ack(d.requestId, 'error', `Chatbox holds ${LIMIT} cards at a time. Review those first.`);
      return ack(d.requestId, 'need-card', 'Ready for the card.');
    }
    if (d.type === MSG.card) {
      if (!isPng(d.png)) return ack(d.requestId, 'error', 'Chatbox couldn’t read that card.');
      const id = idOf(m);
      if (id && tray.some((c) => c.id === id)) return ack(d.requestId, 'existing', 'Already waiting in Chatbox. Review it there.');
      if (tray.length >= LIMIT || tray.reduce((a, c) => a + c.file.size, 0) + d.png.byteLength > LIMIT_BYTES) return ack(d.requestId, 'error', 'Chatbox’s tray is full. Review those cards first.');
      const name = nameOf(m);
      const blob = new Blob([d.png], { type: 'image/png' });
      const file = new File([blob], `${name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'character'}.png`, { type: 'image/png' });
      tray.push({ id, name, file, url: URL.createObjectURL(blob) });
      paint(true);
      ack(d.requestId, 'ok', `Added to Chatbox. ${tray.length} waiting for review.`);
    }
  }

  function manage() {
    openSheet({
      label: 'Waiting cards',
      // Back on the tray, focus lands on something that's still there.
      onClose: refocus,
      html: `<h2 class="sheet-title">Waiting to review</h2><div class="group dc-wl" id="dcWl"></div>
        <div class="sheet-actions"><button type="button" class="btn-primary plate press" data-x><span>Keep browsing</span></button><button type="button" class="btn-primary press" data-go><span>Review</span></button></div>`,
      onMount(s, close) {
        const list = s.querySelector('#dcWl');
        const draw = () =>
          (list.innerHTML = tray.length
            ? tray.map((c, i) => `<div class="dc-wr"><img src="${c.url}" alt=""><b>${esc(c.name)}</b><button type="button" class="ibtn ghost press" data-rm="${i}" aria-label="Remove ${esc(c.name)}">${icon('x', 16)}</button></div>`).join('')
            : `<p class="dc-none">Nothing waiting.</p>`);
        draw();
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-rm]');
          if (!b) return;
          const [gone] = tray.splice(+b.dataset.rm, 1);
          if (gone) URL.revokeObjectURL(gone.url);
          draw();
          paint();
          (list.querySelector('[data-rm]') || s.querySelector('[data-x]')).focus();
        });
        s.querySelector('[data-x]').addEventListener('click', () => close());
        s.querySelector('[data-go]').addEventListener('click', () => (close(), review()));
      },
    });
  }
  function refocus() {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && !a.closest('[hidden]')) return;
      (root?.querySelector('.dc-tray.on #dcList:not(:disabled)') || root?.querySelector('.topbar .ibtn'))?.focus();
    }, 360);
  }
  // Cards stay in the tray until the import review saves them; backing out keeps them.
  function review() {
    if (!tray.length) return toast('Nothing waiting yet.');
    startImport(tray.map((c) => c.file));
  }

  return {
    html,
    depth: 2,
    mount(r) {
      root = r;
      frame = r.querySelector('#dcFrame');
      trayEl = r.querySelector('#dcTray');
      addEventListener('message', onMessage);
      // If Datacat never says hello (changed bridge, blocked page), say so instead of waiting forever.
      quietTimer = setTimeout(() => !connected && ((quiet = true), paint()), 15000);
      paint();
      trayEl.addEventListener('click', (e) => {
        if (e.target.closest('#dcGo')) review();
        else if (e.target.closest('#dcList')) manage();
      });
    },
    unmount() {
      removeEventListener('message', onMessage);
      clearTimeout(quietTimer);
      frame = null;
    },
  };
}
