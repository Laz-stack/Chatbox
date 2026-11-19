// The Build sheet, opened from the red stop in the bar: lay down a new line (character)
// or start an Interchange (a group chat where 2–3 lines meet).
import { S } from './store.js';
import { openSheet, icon, arrow, avatarBullet } from './ui.js';

export function openBuildSheet() {
  const few = S.characters.slice(0, 3);
  const meet = few.length
    ? `<span class="meet">${few.map((c, i) => avatarBullet(c, 40, i ? 'margin-left:-12px' : '')).join('')}</span>`
    : `<span class="bo-ic">${icon('link', 26)}</span>`;
  const canMeet = S.characters.length >= 2;
  openSheet({
    label: 'Build',
    html: `<h2 class="sheet-title">Build</h2><p class="sheet-p">Lay down a new line, or let a few of yours meet.</p>
      <a class="bopt red press" href="#/edit/new" data-close><span class="bo-ic">${icon('track', 30)}</span><span class="bo-tx"><b>New line</b><span>Create a character</span></span>${arrow(28, 'currentColor')}</a>
      ${
        canMeet
          ? `<a class="bopt yel press" href="#/interchange/new" data-close>${meet}<span class="bo-tx"><b>Interchange</b><span>A group chat where 2–3 lines meet</span></span>${arrow(28, 'currentColor')}</a>`
          : `<div class="bopt off">${meet}<span class="bo-tx"><b>Interchange</b><span>Make at least two lines first, then let them meet.</span></span></div>`
      }`,
    onMount(s, close) {
      s.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close()));
    },
  });
}
