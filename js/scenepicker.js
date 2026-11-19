// One Scene sheet for the chat and the character editor: pick a backdrop, set its blur and dim.
import { esc } from './util.js';
import { sceneSVG, SCENES } from './scenes.js';
import { openSheet, ruler, bindRuler, icon, arrow } from './ui.js';

// value: { scene, blur, dim }. onPreview(d) is called live while picking (optional);
// onSave(d) when the button is pressed. Closing without saving calls onPreview(original).
export function sceneSheet({ value, cta = 'Use this scene', onPreview, onSave }) {
  const orig = { ...value };
  const d = { ...value };
  let saved = false;
  const check = `<span class="check"><span class="bullet" style="width:24px;height:24px;background:var(--yellow);color:var(--bg)">${icon('check', 13)}</span></span>`;
  openSheet({
    label: 'Scene',
    html: `<div class="sheet-head"><h2 class="t2" style="font-size:28px"><span>Scene</span><span class="sub">Shown softly behind the chat</span></h2></div>
      <div class="grid3" id="scGrid">${SCENES.map((s) => `<button type="button" class="pick press" data-k="${s.key}" aria-pressed="${s.key === d.scene}"><span class="thumb scene">${sceneSVG(s.key)}${check}</span><span class="nm">${esc(s.name)}</span></button>`).join('')}</div>
      <div class="stack" style="margin:18px 0">${ruler('scBlur', 'Blur', d.blur, 20)}${ruler('scDim', 'Dim', d.dim, 100)}</div>
      <button type="button" class="btn-primary press" id="scSave"><span>${cta}</span>${arrow(30)}</button>`,
    onMount(s, close) {
      s.querySelector('#scGrid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        d.scene = b.dataset.k;
        s.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        onPreview?.(d);
      });
      bindRuler(s.querySelector('#scBlur').closest('.ruler-wrap'), (v) => ((d.blur = v), onPreview?.(d)));
      bindRuler(s.querySelector('#scDim').closest('.ruler-wrap'), (v) => ((d.dim = v), onPreview?.(d)));
      s.querySelector('#scSave').onclick = async () => {
        saved = true;
        await onSave(d);
        close();
      };
    },
    onClose() {
      if (!saved) onPreview?.(orig);
    },
  });
}
