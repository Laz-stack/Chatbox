// The Build sheet, opened from the red stop in the bar: lay down a new line (character)
// or start an Interchange (2 or 3 lines take turns, or up to 5 share one scene).
import { S } from './store.js';
import { openSheet, icon, arrow, avatarBullet } from './ui.js';
import { startImport } from './views/import.js';
import { setPicked, prepare } from './frompicture.js';
import { toast } from './ui.js';
import { linkImportSheet } from './linkimport.js';

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
          ? `<a class="bopt yel press" href="#/interchange/new" data-close>${meet}<span class="bo-tx"><b>Interchange</b><span>A group chat: 2 or 3 lines take turns, or up to 5 in one scene</span></span>${arrow(28, 'currentColor')}</a>`
          : `<div class="bopt off">${meet}<span class="bo-tx"><b>Interchange</b><span>Make at least two lines first, then let them meet.</span></span></div>`
      }
      <label class="bopt imp press"><span class="bo-ic">${icon('image', 28)}</span><span class="bo-tx"><b>From a picture</b><span>The AI writes a character from an image</span></span>${arrow(28, 'currentColor')}<input type="file" class="vh" id="buildPic" accept="image/*"></label>
      <label class="bopt imp press"><span class="bo-ic">${icon('upload', 28)}</span><span class="bo-tx"><b>Import</b><span>A card, a ZIP of cards and lorebooks, or a lorebook</span></span>${arrow(28, 'currentColor')}<input type="file" class="vh" id="buildImport" multiple accept=".zip,.png,.json,application/zip,image/png,application/json"></label>
      <button type="button" class="bopt imp press" id="buildLink"><span class="bo-ic">${icon('link', 28)}</span><span class="bo-tx"><b>From a link</b><span>Paste a link to a card or a character page</span></span>${arrow(28, 'currentColor')}</button>`,
    onMount(s, close) {
      s.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close()));
      s.querySelector('#buildPic').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        close();
        if (!f) return;
        try {
          setPicked(await prepare(f));
          location.hash = '#/from-picture';
        } catch (err) {
          toast(err.message, { kind: 'err' });
        }
      });
      s.querySelector('#buildLink').addEventListener('click', () => (close(), setTimeout(linkImportSheet, 320)));
      s.querySelector('#buildImport').addEventListener('change', (e) => {
        const files = [...e.target.files];
        close();
        startImport(files);
      });
    },
  });
}
