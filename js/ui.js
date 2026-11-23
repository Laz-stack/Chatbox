// Shared UI pieces: markup builders and overlay components (sheets, menus, toasts, dial, ruler).
import { esc, inkOn, clamp, reducedMotion, EASE_OUT } from './util.js';
import { icon, arrow } from './icons.js';
import { avatarSVG, faceSVG } from './avatar.js';
import { small } from './thumbs.js';
import { safeColor, safeCss } from './safe.js';

export { icon, arrow };

export const bullet = (t, bg, fg, s = 40, style = '') => {
  bg = safeCss(bg);
  fg = fg && safeCss(fg, null);
  return `<span class="bullet" style="width:${s}px;height:${s}px;background:${bg};color:${fg || inkOn(bg)};font-size:${Math.round(s * 0.5)}px;${style}">${t}</span>`;
};

export const lineBullet = (ch, s = 40, style = '') => bullet(esc(ch.line?.letter || ch.name?.[0] || '?'), ch.line?.color || '#ECECEC', null, s, style);

// Round badge showing the character's avatar (uploaded image, else the chibi preset) instead of a letter.
// `av` marks it as a shared-transition spot ("line:<id>", "head:<id>", …; see main.js).
export const avatarBullet = (ch, s = 40, style = '', av = '') => {
  const bg = safeColor(ch.line?.color || ch.color);
  const inner = ch.avatarImage
    ? `<img src="${esc(small(ch.avatarImage))}" data-small alt="" width="${s}" height="${s}">`
    : faceSVG(ch, s, 'happy', bg);
  return `<span class="bullet bullet-av"${av ? ` data-av="${esc(av)}"` : ''} style="width:${s}px;height:${s}px;background:${bg};${style}">${inner}</span>`;
};

// A group chat's one picture: your uploaded image, else the imported cover, else its members' faces
// side by side (two halves, or four quarters).
export const groupAvatar = (ix, s = 40) => {
  const img = ix.picture || (ix.useScene ? null : ix.cover);
  if (img) return `<span class="gav" style="width:${s}px;height:${s}px"><img src="${esc(small(img))}" data-small alt="" width="${s}" height="${s}"></span>`;
  const ppl = (ix.people || []).slice(0, 4);
  const cell = ppl.length > 2 ? Math.ceil(s / 2) : s;
  const face = (p) => {
    const bg = safeColor(p.line?.color || p.color);
    return `<span style="background:${bg}">${p.avatarImage ? `<img src="${esc(small(p.avatarImage))}" data-small alt="">` : faceSVG(p, cell, 'happy', bg).replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ')}</span>`;
  };
  return `<span class="gav mos n${Math.min(ppl.length, 4)}" style="width:${s}px;height:${s}px">${ppl.map(face).join('')}</span>`;
};

// An empty screen as a station sign: nothing departs from here yet, and what to do about it.
export const emptySign = (title, sub, action = '', where = 'This platform') =>
  `<div class="esign"><div class="sign"><span class="rnd" style="--c:#7A7A7A" aria-hidden="true">–<b>00</b></span><span class="sn"><b>${title}</b><small>${where}</small></span><i class="band" style="background:#7A7A7A"></i></div><p class="esign-p">${sub}</p>${action}</div>`;

// A card picture in a window (chat, Platform hero): fill the window only when that neither crops away
// much of the picture nor blows a small one up; otherwise show the whole picture in a frame
// (".contain"). Card pictures are mostly square or portrait, and saved at 512-1024px.
export function fitPics(root) {
  root.querySelectorAll('img[data-fit]').forEach((img) => {
    const go = () => {
      const box = img.parentElement;
      const w = box.clientWidth;
      const h = box.clientHeight || parseFloat(getComputedStyle(box).getPropertyValue('--wh')) || 200;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!w || !nw) return;
      const dpr = devicePixelRatio || 1;
      const a = nw / nh;
      const boxA = w / h;
      const shown = a > boxA ? boxA / a : a / boxA; // the share of the picture a fill would keep
      const blowUp = Math.max((w * dpr) / nw, (h * dpr) / nh);
      const contain = shown < 0.78 || blowUp > 1.7;
      box.classList.toggle('contain', contain);
      box.classList.toggle('tall', contain && a < 0.75);
      let dh = h;
      if (contain) {
        // The whole picture, framed; a very tall one (a long card with a cover on top) shows its top
        // as a 3:4 portrait instead of a sliver. Never more than about 1.4x its saved size.
        const t = Math.max(a, 0.75);
        dh = Math.min(h, w / t);
        let dw = dh * t;
        const maxW = (nw * 1.4) / dpr;
        if (dw > maxW) (dw = maxW), (dh = dw / t);
        if (a >= 0.75 && dh > (nh * 1.4) / dpr) (dh = (nh * 1.4) / dpr), (dw = dh * t);
        img.style.width = `${Math.round(dw)}px`;
        img.style.height = `${Math.round(dh)}px`;
      } else img.style.width = img.style.height = '';
      // Too small to show well in a window: the hero goes back to its usual layout, the chat to the sign.
      const tiny = contain && dh < 110;
      const hero = box.closest('.hero');
      if (hero) hero.classList.toggle('has-win', !tiny);
      const win = box.closest('.win');
      if (win) win.classList.toggle('framed', contain && !tiny), win.classList.toggle('has-pic', !tiny);
    };
    if (img.complete && img.naturalWidth) go();
    else img.addEventListener('load', go, { once: true });
  });
}

export const title2 = (a, b, { tag = 'h1', size = 30 } = {}) =>
  `<${tag} class="t2" style="font-size:${size}px"><span>${a}</span><span class="sub">${b}</span></${tag}>`;

export const ibtn = (ic, label, { href, id, cls = '', attrs = '' } = {}) =>
  href
    ? `<a class="ibtn press ${cls}" href="${href}" aria-label="${esc(label)}" ${attrs}>${icon(ic)}</a>`
    : `<button type="button" class="ibtn press ${cls}" ${id ? `id="${id}"` : ''} aria-label="${esc(label)}" ${attrs}>${icon(ic)}</button>`;

export const topbar = ({ back = '#/', title = '', right = '', backIcon = 'back', backLabel = 'Back' } = {}) =>
  `<div class="topbar">${ibtn(backIcon, backLabel, { href: back })}${title ? `<h1 class="tb-title">${title}</h1>` : '<span class="tb-title"></span>'}${right || '<span class="ibtn-spacer"></span>'}</div>`;

export const sw = (id, on, label) =>
  `<button type="button" class="switch" role="switch" id="${id}" aria-checked="${on ? 'true' : 'false'}" aria-label="${esc(label)}"><span class="knob"></span></button>`;

export const toggleRow = (id, label, sub, on) =>
  `<div class="trow"><div><div class="trow-t">${label}</div>${sub ? `<div class="trow-s">${sub}</div>` : ''}</div>${sw(id, on, label)}</div>`;

export function bindSwitch(el, onChange) {
  if (!el) return;
  el.addEventListener('click', () => {
    const v = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(v));
    onChange(v);
  });
}

export const field = (id, label, value, { type = 'text', right = '', after = '', ph = '', attrs = '' } = {}) =>
  `<div class="field"><div class="flabel"><label for="${id}">${label}</label>${right}</div><div class="fwrap"><input class="input${after ? ' has-after' : ''}" id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${attrs}>${after ? `<span class="fafter">${after}</span>` : ''}</div></div>`;

export const area = (id, label, value, { right = '', ph = '', rows = 5, attrs = '' } = {}) =>
  `<div class="field"><div class="flabel"><label for="${id}">${label}</label>${right}</div><textarea class="input area" id="${id}" rows="${rows}" placeholder="${esc(ph)}" ${attrs}>${esc(value)}</textarea></div>`;

export const group = (...rows) => `<div class="group">${rows.join('')}</div>`;

export function row({ ic, title, sub = '', href, id, right, bc = 'var(--plate2)', fc = 'var(--cream)', lead }) {
  const L = lead || `<span class="row-ic" style="background:${bc};color:${fc}">${icon(ic, 19)}</span>`;
  const T = `<span class="row-tx"><span class="row-t">${title}</span>${sub ? `<span class="row-s">${sub}</span>` : ''}</span>`;
  const R = right ?? `<span class="row-chev">${icon('chev', 18)}</span>`;
  if (href) return `<a class="row press" href="${href}">${L}${T}${R}</a>`;
  if (id) return `<button type="button" class="row press" id="${id}">${L}${T}${R}</button>`;
  return `<div class="row">${L}${T}${R}</div>`;
}

export const primary = (text, { id = '', href = '', cls = '', rot = 0, attrs = '' } = {}) =>
  href
    ? `<a class="btn-primary press ${cls}" href="${href}" ${attrs}><span>${text}</span>${arrow(30, 'currentColor', rot)}</a>`
    : `<button type="button" class="btn-primary press ${cls}" ${id ? `id="${id}"` : ''} ${attrs}><span>${text}</span>${arrow(30, 'currentColor', rot)}</button>`;

// Bottom navigation as a route line: five stops on one line. The active stop wears the
// yellow "you are here" ring, which travels along the line between tab screens (see main.js / app.css).
// Build is not a screen: its red stop opens the Build sheet (js/build.js).
export function tabbar(active) {
  const stop = (label, href, key) =>
    `<a class="stop-link press" href="${href}" ${key === active ? 'aria-current="page"' : ''}><span class="stop" aria-hidden="true">${key === active ? '<span class="here"></span>' : ''}</span><span class="stop-name">${label}</span></a>`;
  return (
    '<div class="tabfade" aria-hidden="true"></div>' +
    `<nav class="tabbar" aria-label="Main">${stop('Platform', '#/', 'home')}${stop('Lines', '#/lines', 'lines')}` +
    `<button type="button" class="stop-link stop-new press" data-build aria-haspopup="dialog"><span class="stop" aria-hidden="true">${icon('track', 26)}</span><span class="stop-name">Build</span></button>` +
    `${stop('Fares', '#/fares', 'fares')}${stop('Depot', '#/settings', 'settings')}</nav>`
  );
}

// Tape reel (used on the memory screen and while summarizing).
export function reel(size, { spd = 6, pack = 34, cls = '' } = {}) {
  let holes = '';
  for (const a of [0, 120, 240]) {
    const t = ((a - 90) * Math.PI) / 180;
    holes += `<circle cx="${(50 + 11.5 * Math.cos(t)).toFixed(1)}" cy="${(50 + 11.5 * Math.sin(t)).toFixed(1)}" r="5.2" fill="#ECECEC"/>`;
  }
  return (
    `<svg class="reel ${cls}" style="--spd:${spd}s" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">` +
    `<circle cx="50" cy="50" r="49" fill="#ECECEC" stroke="#0A0A0A" stroke-width="2"/>` +
    `<circle cx="50" cy="50" r="${pack}" fill="#333"/>` +
    `<circle cx="50" cy="50" r="${pack - 6}" fill="none" stroke="#B8ACFE" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 5"/>` +
    `<circle cx="50" cy="50" r="20" fill="#FDCD15"/>${holes}` +
    `<circle cx="50" cy="50" r="3.5" fill="#0A0A0A"/><path d="M50 30 V36" stroke="#0A0A0A" stroke-width="3"/></svg>`
  );
}

// ---------- overlays ----------
const ovRoot = () => document.getElementById('overlay-root');
let openCount = 0;
const openClosers = new Set();
// Close every open sheet and menu (called when the screen changes underneath them).
export const closeOverlays = () => [...openClosers].forEach((c) => c());

export function openSheet({ html, label = '', onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'ov';
  wrap.innerHTML = `<div class="scrim"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="grab" aria-hidden="true"></div>${html}</section>`;
  ovRoot().appendChild(wrap);
  openCount++;
  const sheet = wrap.querySelector('.sheet');
  const prevFocus = document.activeElement;
  let closed = false;
  const onKey = (e) => {
    if (e.key === 'Escape') return close();
    // Tab stays inside the sheet.
    if (e.key === 'Tab' && openCount === myLevel) {
      const f = [...sheet.querySelectorAll('button:not([disabled]), a[href], input:not([type=hidden]):not(.vh), select, textarea, summary, [tabindex]:not([tabindex="-1"]), label:has(input.vh)')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) e.preventDefault(), f.at(-1).focus();
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) e.preventDefault(), f[0].focus();
    }
  };
  // While a sheet is open the screen behind it can't be reached by keyboard or screen reader.
  const behind = [document.getElementById('app'), ...document.querySelectorAll('.tabbar')].filter(Boolean);
  behind.forEach((el) => (el.inert = true));
  const myLevel = openCount;
  function close(v) {
    if (closed) return;
    closed = true;
    openClosers.delete(close);
    openCount--;
    if (!openCount) behind.forEach((el) => (el.inert = false));
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('closing');
    setTimeout(() => {
      wrap.remove();
      prevFocus?.focus?.({ preventScroll: true });
    }, 300);
    onClose?.(v);
  }
  openClosers.add(close);
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.scrim').addEventListener('click', () => close());
  dragToDismiss(sheet, wrap.querySelector('.grab'), close);
  onMount?.(sheet, close);
  // Focus moves into the sheet: a marked field, else its title (made focusable), else its first control.
  requestAnimationFrame(() => {
    if (closed || sheet.contains(document.activeElement)) return;
    const t = sheet.querySelector('[data-autofocus]') || sheet.querySelector('.sheet-title, h2, h3');
    if (t && !t.matches('[data-autofocus], button, a, input, textarea, select')) t.tabIndex = -1;
    (t || sheet.querySelector('button, a[href], input, textarea'))?.focus({ preventScroll: true });
  });
  return close;
}

function dragToDismiss(sheet, handle, close) {
  let y0 = null;
  let dy = 0;
  handle.addEventListener('pointerdown', (e) => {
    y0 = e.clientY;
    dy = 0;
    handle.setPointerCapture(e.pointerId);
    sheet.style.transition = 'none';
  });
  handle.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    if (dy > 110) return close();
    sheet.style.transition = reducedMotion() ? '' : `transform .35s ${EASE_OUT}`;
    sheet.style.transform = '';
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

// spotlight: an element to keep bright (cut out of the scrim), e.g. the message being acted on.
export function openMenu(anchor, items, { onClose, spotlight } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'menu-ov';
  // A {group} item opens a labelled group that runs to the next rule or the end of the menu.
  let inGroup = false;
  const endGroup = () => (inGroup ? ((inGroup = false), '</div>') : '');
  const gid = 'mg' + Math.random().toString(36).slice(2, 8);
  const html = items
    .map((it, i) =>
      it === '-'
        ? endGroup() + '<hr role="separator">'
        : it.group
        ? endGroup() + ((inGroup = true), `<div role="group" aria-labelledby="${gid}-${i}"><div class="grp" id="${gid}-${i}">${esc(it.group)}</div>`)
        : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" style="animation-delay:${0.03 * i}s"><span class="mi">${icon(it.icon, 16)}</span>${esc(it.label)}</button>`
    )
    .join('') + endGroup();
  // The catcher takes taps everywhere, including inside the spotlight cut-out, so the menu always closes.
  wrap.innerHTML = `<div class="menu-catch"></div><div class="menu-scrim"></div><div class="menu" role="menu">${html}</div>`;
  ovRoot().appendChild(wrap);
  const menu = wrap.querySelector('.menu');
  const r = anchor.getBoundingClientRect();
  const mw = Math.min(268, innerWidth - 24);
  const mh = menu.offsetHeight;
  const x = clamp(r.right - mw, 12, innerWidth - mw - 12);
  let y = r.bottom + 8;
  let origin = 'top right';
  if (y + mh > innerHeight - 12) {
    y = Math.max(12, r.top - mh - 8);
    origin = 'bottom right';
  }
  // A long menu never runs off the screen: it fits what's left and scrolls.
  const room = innerHeight - 12 - y;
  if (mh > room) {
    if (room < 320) y = Math.max(12, innerHeight - 12 - Math.min(mh, innerHeight - 24));
    menu.style.maxHeight = innerHeight - 12 - y + 'px';
  }
  Object.assign(menu.style, { left: x + 'px', top: y + 'px', width: mw + 'px', transformOrigin: origin });
  if (spotlight) {
    // Rounded cut-out in the scrim around the element, slightly larger than it (it lifts a little).
    const b = spotlight.getBoundingClientRect();
    const pad = 6;
    const [l, t, w, h] = [b.left - pad, b.top - pad, b.width + pad * 2, b.height + pad * 2];
    const rr = Math.min(26, h / 2);
    const hole = `M${l + rr} ${t}H${l + w - rr}A${rr} ${rr} 0 0 1 ${l + w} ${t + rr}V${t + h - rr}A${rr} ${rr} 0 0 1 ${l + w - rr} ${t + h}H${l + rr}A${rr} ${rr} 0 0 1 ${l} ${t + h - rr}V${t + rr}A${rr} ${rr} 0 0 1 ${l + rr} ${t}Z`;
    wrap.querySelector('.menu-scrim').style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z ${hole}")`;
  }
  let closed = false;
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const bs = [...menu.querySelectorAll('button')];
      const i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
      e.preventDefault();
    }
  };
  function close() {
    if (closed) return;
    closed = true;
    openClosers.delete(close);
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 200);
    // Focus goes back to what opened the menu (unless the chosen action moved it somewhere).
    setTimeout(() => (!document.activeElement || document.activeElement === document.body) && anchor?.isConnected && anchor.focus?.({ preventScroll: true }), 120);
    onClose?.();
  }
  openClosers.add(close);
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.menu-scrim').addEventListener('click', close);
  wrap.querySelector('.menu-catch').addEventListener('click', close);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    close();
    setTimeout(() => it.on?.(), 60);
  });
  menu.querySelector('button')?.focus({ preventScroll: true });
  return close;
}

export function confirmSheet({ title, body = '', ok = 'Confirm', danger = false }) {
  return new Promise((res) => {
    let done = false;
    openSheet({
      // The title is markup (names in it are escaped); the label is read out as plain words.
      label: title.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&'),
            // A destructive confirm starts on Cancel, so Enter never destroys by accident.
      html: `<h2 class="sheet-title">${title}</h2>${body ? `<p class="sheet-p">${body}</p>` : ''}<div class="sheet-actions"><button type="button" class="btn-primary plate press" data-v="0" ${danger ? 'data-autofocus' : ''}><span>Cancel</span></button><button type="button" class="btn-primary press ${danger ? 'danger' : ''}" data-v="1" ${danger ? '' : 'data-autofocus'}><span>${ok}</span></button></div>`,
      onMount(s, close) {
        s.querySelectorAll('[data-v]').forEach((b) =>
          b.addEventListener('click', () => {
            done = true;
            res(b.dataset.v === '1');
            close();
          })
        );
      },
      onClose() {
        if (!done) res(false);
      },
    });
  });
}

// Clear toasts that would sit over a sheet the user just opened (their action is done or moot).
export function clearToasts() {
  document.querySelectorAll('#toast-root .toast:not(.err)').forEach((t) => (t.classList.add('out'), setTimeout(() => t.remove(), 260)));
}
export function toast(msg, { kind = '', action = '', onAction, ms = 3600 } = {}) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.dataset.t = Date.now();
  t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  root.appendChild(t);
  const kill = () => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  };
  const timer = setTimeout(kill, ms);
  t.querySelector('button')?.addEventListener('click', () => {
    clearTimeout(timer);
    kill();
    onAction?.();
  });
  while (root.children.length > 3) root.firstElementChild.remove();
  return { remove: () => (clearTimeout(timer), kill()) };
}

// ---------- ruler (tick slider) ----------
export const ruler = (id, label, value, max = 100, fmt = (v) => v) =>
  `<div class="ruler-wrap"><div class="rhead"><label for="${id}">${label}</label><output for="${id}" class="num">${fmt(value)}</output></div><div class="ruler" style="--p:${value / max}"><span class="ticks"></span><span class="fill"></span><span class="head"></span><input id="${id}" type="range" min="0" max="${max}" step="1" value="${value}"></div></div>`;

export function bindRuler(wrap, onInput, fmt = (v) => v) {
  const input = wrap.querySelector('input');
  const r = wrap.querySelector('.ruler');
  const out = wrap.querySelector('output');
  input.addEventListener('input', () => {
    const v = +input.value;
    r.style.setProperty('--p', v / +input.max);
    out.textContent = fmt(v);
    onInput(v);
  });
}

// ---------- dial (semicircle, drag along the arc) ----------
export function dial(id, value, { min = 0, max = 2, step = 0.05, label = 'Temperature', hint = '', ends = ['Focused', 'Creative'] } = {}) {
  const f = (value - min) / (max - min);
  return `<div class="dialbox"><div class="dhead"><label for="${id}">${label}</label><span class="small">${hint}</span></div>
  <div class="dial" data-min="${min}" data-max="${max}" data-step="${step}">
    <svg viewBox="0 0 300 160" aria-hidden="true">
      <path d="M22 150 A128 128 0 0 1 278 150" fill="none" stroke="#333" stroke-width="20"/>
      <path class="prog" d="M22 150 A128 128 0 0 1 278 150" fill="none" stroke="#FDCD15" stroke-width="20" pathLength="100" stroke-dasharray="${(f * 100).toFixed(2)} 100"/>
      <g class="knobs"><circle class="k1" r="7" fill="#0A0A0A"/></g>
    </svg>
    <div class="val num">${value.toFixed(1)}</div>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)}">
  </div><div class="dends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
}

export function bindDial(box, onChange) {
  const d = box.querySelector('.dial');
  const input = d.querySelector('input');
  const min = +d.dataset.min;
  const max = +d.dataset.max;
  const step = +d.dataset.step;
  const prog = d.querySelector('.prog');
  const k1 = d.querySelector('.k1');
  const val = d.querySelector('.val');
  const svg = d.querySelector('svg');
  function paint(v) {
    const f = (v - min) / (max - min);
    const a = Math.PI - f * Math.PI;
    prog.setAttribute('stroke-dasharray', `${(f * 100).toFixed(2)} 100`);
    k1.setAttribute('cx', 150 + 128 * Math.cos(a));
    k1.setAttribute('cy', 150 - 128 * Math.sin(a));
    val.textContent = v.toFixed(step < 0.1 ? 2 : 1).replace(/0$/, '').replace(/\.$/, '.0');
  }
  function set(v) {
    v = clamp(Math.round(v / step) * step, min, max);
    v = +v.toFixed(2);
    input.value = v;
    paint(v);
    onChange(v);
  }
  function fromPointer(e) {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 300 - 150;
    const y = 150 - ((e.clientY - r.top) / r.height) * 160;
    let a = Math.atan2(Math.max(y, 0), x);
    set(min + (1 - a / Math.PI) * (max - min));
  }
  let dragging = false;
  d.addEventListener('pointerdown', (e) => {
    dragging = true;
    d.setPointerCapture(e.pointerId);
    input.focus({ preventScroll: true });
    fromPointer(e);
  });
  d.addEventListener('pointermove', (e) => dragging && fromPointer(e));
  d.addEventListener('pointerup', () => (dragging = false));
  d.addEventListener('pointercancel', () => (dragging = false));
  input.addEventListener('input', () => set(+input.value));
  paint(+input.value);
}

// Auto-growing textarea.
export function autosize(ta, max = 140) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(max, ta.scrollHeight) + 'px';
  };
  ta.addEventListener('input', fit);
  fit();
  return fit;
}

export const overlayOpen = () => openCount > 0;
