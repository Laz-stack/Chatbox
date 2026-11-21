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
export const soundsLikeName = (k) => SOUNDS_LIKE.find((x) => x[0] === k)?.[1] || 'Quiet';

// value: { win: 'card' | 'sign', scene }. pic: the card picture (or empty). onSave(d) on the button.
export function windowSheet({ value, pic = '', name = 'this character', cta = 'Save', onSave }) {
  const d = { win: value.win === 'sign' ? 'sign' : 'card', scene: value.scene || 'none' };
  const opt = (k, title, sub, art) =>
    `<button type="button" class="wopt press" role="radio" aria-checked="${d.win === k}" data-w="${k}"><span class="wopt-art">${art}</span><span class="wopt-t"><b>${title}</b><small>${sub}</small></span></button>`;
  const sign = `<span class="sign mini"><span class="rnd" aria-hidden="true" style="--c:#0A0A0A">${esc((name || '?').trim()[0]?.toUpperCase() || '?')}<b>01</b></span><span class="ln"></span><i class="band" style="background:#0A0A0A"></i></span>`;
  openSheet({
    label: 'Window',
    html: `<h2 class="sheet-title">Window</h2><p class="sheet-p">The picture at the top of the chat, with a sign that names where the story is.</p>
      <div class="wopts" role="radiogroup" aria-label="Window">
        ${opt('card', 'Card picture', pic ? `${esc(name)}’s own picture` : `${esc(name)} has no picture yet. Add one in Edit`, pic ? `<img src="${esc(pic)}" alt="">${sign}` : `${icon('image', 26)}${sign}`)}
        ${opt('sign', 'Sign only', 'Just the station sign, more room for the chat', sign)}
      </div>
      <h3 class="snd-hd">Sounds like</h3><p class="sheet-p" style="margin-top:-4px">The ambience when Sound is on Auto.</p>
      <div class="ad-states" role="radiogroup" aria-label="Sounds like" style="flex-wrap:wrap">${SOUNDS_LIKE.map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${d.scene === k}" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="sheet-actions"><button type="button" class="btn-primary press" id="wSave"><span>${esc(cta)}</span></button></div>`,
    onMount(s, close) {
      s.addEventListener('click', async (e) => {
        const w = e.target.closest('[data-w]');
        if (w) return (d.win = w.dataset.w), s.querySelectorAll('[data-w]').forEach((x) => x.setAttribute('aria-checked', x === w));
        const k = e.target.closest('[data-k]');
        if (k) return (d.scene = k.dataset.k), s.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-checked', x === k));
        if (e.target.closest('#wSave')) {
          await onSave(d);
          close();
        }
      });
    },
  });
}
