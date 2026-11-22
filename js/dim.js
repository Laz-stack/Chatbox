// Dim mode ("Ember"): for reading at night. A warm, dimming layer over the whole app turns the bright
// whites to soft paper and the yellow to amber and cuts blue light, without changing the layout.
// It multiplies the colours under it, so black stays black and text keeps its contrast. It sits on top
// of everything (sheets and toasts too) and lets every touch through; fixed bars are unaffected.
// Off / At night (a time range, default 21:00 to 6:00) / Always. It fades in and out slowly.
import { S, saveSettings } from './store.js';
import { openSheet, toast } from './ui.js';
import { esc } from './util.js';

export const dimPrefs = () => ({ mode: 'off', from: '21:00', to: '06:00', skip: 0, ...(S.settings.dim || {}) });
const mins = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const inRange = (now, from, to) => (from <= to ? now >= from && now < to : now >= from || now < to);

// Is dim mode on right now?
export function dimNow(d = dimPrefs(), date = new Date()) {
  if (d.mode === 'off') return false;
  if (d.skip && Date.now() < d.skip) return false;
  if (d.mode === 'always') return true;
  return inRange(date.getHours() * 60 + date.getMinutes(), mins(d.from), mins(d.to));
}
// When "Off for tonight" should end: the end of the current night.
function endOfNight(d = dimPrefs()) {
  const t = new Date();
  const [h, m] = d.to.split(':').map(Number);
  const end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), h, m);
  if (end <= t) end.setDate(end.getDate() + 1);
  return d.mode === 'always' ? Date.now() + 8 * 3600e3 : +end;
}

let layer = null;
export function applyDim() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'dim-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  const on = dimNow();
  layer.classList.toggle('on', on);
  document.documentElement.classList.toggle('dim', on);
  // The browser bar follows (Android Chrome).
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#070605' : '#0A0A0A');
}
export function startDim() {
  applyDim();
  setInterval(applyDim, 60e3);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && applyDim());
}
export const dimSummary = (d = dimPrefs()) => (d.mode === 'always' ? 'Always on' : d.mode === 'night' ? `At night, ${d.from} to ${d.to}` : 'Off');

async function save(patch) {
  S.settings.dim = { ...dimPrefs(), ...patch };
  await saveSettings();
  applyDim();
}

// Depot › Dim mode.
export function dimSheet({ onChange } = {}) {
  const html = (d = dimPrefs()) => `<h2 class="sheet-title">Dim mode</h2>
    <p class="sheet-p">For reading at night: the whole app gets warmer and dimmer, like a reading lamp. Whites turn to soft paper, yellow to amber, and blue light is cut.</p>
    <div class="ad-states" role="radiogroup" aria-label="Dim mode" style="flex-wrap:wrap">${[['off', 'Off'], ['night', 'At night'], ['always', 'Always']].map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${d.mode === k}" tabindex="${d.mode === k ? 0 : -1}" data-mode="${k}">${l}</button>`).join('')}</div>
    <div class="dim-times"${d.mode === 'night' ? '' : ' hidden'}><label>From<input class="input" type="time" id="dimFrom" value="${esc(d.from)}"></label><label>To<input class="input" type="time" id="dimTo" value="${esc(d.to)}"></label></div>
    ${d.mode !== 'off' ? `<button type="button" class="pill press dim-skip" id="dimSkip">${d.skip > Date.now() ? 'Turn back on now' : d.mode === 'always' ? 'Off for the next 8 hours' : 'Off for tonight'}</button>` : ''}
    <p class="fhint" role="status">${dimNow(d) ? 'On now.' : d.mode === 'off' ? 'Off.' : d.skip > Date.now() ? `Off until ${new Date(d.skip).toTimeString().slice(0, 5)}.` : 'Off now; it turns on at ' + esc(d.from) + '.'}</p>`;
  openSheet({
    label: 'Dim mode',
    html: `<div id="dimBody">${html()}</div>`,
    onMount(s) {
      const body = s.querySelector('#dimBody');
      // Redraw, then put focus back where it was (the same option, time field or button).
      const redraw = () => {
        const a = document.activeElement;
        const sel = a?.dataset?.mode ? `[data-mode="${a.dataset.mode}"]` : a?.id ? `#${a.id}` : null;
        body.innerHTML = html();
        onChange?.();
        if (sel) (body.querySelector(sel) || body.querySelector('[aria-checked="true"]'))?.focus();
      };
      body.addEventListener('keydown', async (e) => {
        const cur = e.target.closest('[data-mode]');
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!cur || !step) return;
        e.preventDefault();
        const all = [...body.querySelectorAll('[data-mode]')];
        const next = all[(all.indexOf(cur) + step + all.length) % all.length];
        next.focus();
        await save({ mode: next.dataset.mode, skip: 0 });
        redraw();
      });
      body.addEventListener('click', async (e) => {
        const m = e.target.closest('[data-mode]');
        if (m) return await save({ mode: m.dataset.mode, skip: 0 }), redraw();
        if (e.target.closest('#dimSkip')) {
          const d = dimPrefs();
          const off = d.skip > Date.now();
          await save({ skip: off ? 0 : endOfNight(d) });
          toast(off ? 'Dim mode back on' : 'Dim mode off for now');
          redraw();
        }
      });
      body.addEventListener('change', async (e) => {
        if (e.target.id === 'dimFrom' || e.target.id === 'dimTo') {
          await save({ [e.target.id === 'dimFrom' ? 'from' : 'to']: e.target.value || (e.target.id === 'dimFrom' ? '21:00' : '06:00') });
          redraw();
        }
      });
    },
  });
}
