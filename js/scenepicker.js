// The Window sheet (chat ⋯ › Window, and the character editor): what the window at the top of the chat
// shows, the character's card picture or just the station sign, and what the place sounds like
// (the ambience when Sound is on Auto). No drawn scenery: the picture is always one you gave.
import { esc } from './util.js';
import { openSheet, icon } from './ui.js';

export const SOUNDS_LIKE = [
  ['cafe', 'Café'],
  ['rain', 'Rain'],
  ['night', 'Night'],
  ['sakura', 'Garden'],
  ['room', 'Room'],
  ['none', 'Quiet'],
];
// A line colour too pale to show on the white sign (Silver) gets an ink outline.
export const pale = (c) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c || '');
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.7;
};
export const soundsLikeName = (k) => SOUNDS_LIKE.find((x) => x[0] === k)?.[1] || 'Quiet';

// value: { win: 'card' | 'sign', scene }. pic: the card picture (or empty). onSave(d) on the button.
// color/num: the character's line colour and station number, so the previews look like the real sign.
export function windowSheet({ value, pic = '', name = 'this character', letter = '', color = '#0A0A0A', num = '01', cta = 'Save', onSave }) {
  const d = { win: value.win === 'sign' ? 'sign' : 'card', scene: SOUNDS_LIKE.some((x) => x[0] === value.scene) ? value.scene : 'none' };
  const opt = (k, title, sub, art) =>
    `<button type="button" class="wopt press" role="radio" aria-checked="${d.win === k}" tabindex="${d.win === k ? 0 : -1}" data-w="${k}"><span class="wopt-art">${art}</span><span class="wopt-t"><b>${title}</b><small>${sub}</small></span></button>`;
  const sign = `<span class="sign wsign${pale(color) ? ' pale' : ''}" style="--lc:${color}"><span class="rnd" aria-hidden="true" style="--c:${color}">${esc((letter || name || '?').trim()[0]?.toUpperCase() || '?')}<b>${esc(num)}</b></span><span class="ln"></span><i class="band" style="background:${color}"></i></span>`;
  openSheet({
    label: 'Window',
    html: `<h2 class="sheet-title">Window</h2><p class="sheet-p">The picture at the top of the chat, with a sign that names where the story is.</p>
      <div class="wopts" role="radiogroup" aria-label="Window">
        ${opt('card', 'Card picture', pic ? `${esc(name)}’s own picture` : `${esc(name)} has no picture yet. Add one in Edit`, pic ? `<img src="${esc(pic)}" alt="">${sign}` : `${icon('image', 26)}${sign}`)}
        ${opt('sign', 'Sign only', 'Just the station sign, more room for the chat', sign)}
      </div>
      <h3 class="snd-hd">Sounds like</h3><p class="sheet-p" style="margin-top:-4px">The ambience when Sound is on Auto.</p>
      <div class="ad-states" role="radiogroup" aria-label="Sounds like" style="flex-wrap:wrap">${SOUNDS_LIKE.map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${d.scene === k}" tabindex="${d.scene === k ? 0 : -1}" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="sheet-actions" style="margin-top:22px"><button type="button" class="btn-primary press" id="wSave"><span>${esc(cta)}</span></button></div>`,
    onMount(s, close) {
      const pick = (el) => {
        const attr = el.dataset.w ? 'w' : 'k';
        if (attr === 'w') d.win = el.dataset.w;
        else d.scene = el.dataset.k;
        s.querySelectorAll(`[data-${attr}]`).forEach((x) => (x.setAttribute('aria-checked', x === el), (x.tabIndex = x === el ? 0 : -1)));
      };
      // Arrow keys move between options in each group, like a native radio group.
      s.addEventListener('keydown', (e) => {
        const cur = e.target.closest('[data-w], [data-k]');
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!cur || !step) return;
        e.preventDefault();
        const all = [...s.querySelectorAll(cur.dataset.w ? '[data-w]' : '[data-k]')];
        const next = all[(all.indexOf(cur) + step + all.length) % all.length];
        next.focus();
        pick(next);
      });
      s.addEventListener('click', async (e) => {
        const opt = e.target.closest('[data-w], [data-k]');
        if (opt) return pick(opt);
        if (e.target.closest('#wSave')) {
          await onSave(d);
          close();
        }
      });
    },
  });
}
