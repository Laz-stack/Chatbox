// A character's voice: which of the phone's voices, pitch and speed, with a Play preview.
// "Default (narrator)" uses the voice set in Depot › Chat › Voice.
import { voices, ttsSupported } from '../tts.js';
import { voiceOf, preview, voiceMissing } from '../voice.js';
import { esc } from '../util.js';
import { openSheet, icon } from '../ui.js';

export function voiceSheet(who, { onSave }) {
  if (!ttsSupported) return openSheet({ label: 'Voice', html: `<h2 class="sheet-title">Voice</h2><p class="sheet-p">This browser can’t read aloud.</p>` });
  const v = voiceOf(who);
  const list = () => {
    const lang = (navigator.language || 'en').slice(0, 2);
    return voices()
      .slice()
      .sort((a, b) => (b.lang.startsWith(lang) - a.lang.startsWith(lang)) || a.name.localeCompare(b.name))
      .slice(0, 40);
  };
  const sample = who.firstMessage || who.tagline || `Hello. I’m ${who.name}.`;
  const row = (uri, name, sub) =>
    `<div class="vs-row${v.uri === uri ? ' on' : ''}"><button type="button" class="vs-pick press" role="radio" aria-checked="${v.uri === uri}" data-uri="${esc(uri)}"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button><button type="button" class="vs-play press" data-play="${esc(uri)}" aria-label="Play ${esc(name)}">${icon('speaker', 18)}</button></div>`;
  const rows = () => row('', 'Default (narrator)', 'The voice set in Depot') + list().map((x) => row(x.voiceURI, x.name, x.lang)).join('');
  const slider = (k, label) => `<div class="vs-sl"><label for="vs-${k}">${label} <span class="num" id="vsv-${k}">${v[k].toFixed(1)}×</span></label><input type="range" id="vs-${k}" min="0.5" max="2" step="0.1" value="${v[k]}" aria-valuetext="${v[k].toFixed(1)} times"></div>`;
  openSheet({
    label: `${who.name}’s voice`,
    html: `<h2 class="sheet-title">${esc(who.name)}’s voice</h2>
      ${voiceMissing(who) ? `<p class="sheet-p">The voice chosen before isn’t on this device, so the default is used.</p>` : ''}
      <div class="vs-list" role="radiogroup" aria-label="Voice">${rows()}</div>
      ${slider('pitch', 'Pitch')}${slider('rate', 'Speed')}
      <button type="button" class="btn-text press" id="vsReset">${icon('restart', 15)}Reset pitch and speed</button>`,
    onMount(s) {
      const save = () => onSave({ ...v });
      // Voices load late on some phones.
      if (!voices().length && 'onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = () => (s.querySelector('.vs-list').innerHTML = rows());
      s.addEventListener('click', (e) => {
        const p = e.target.closest('[data-uri]');
        const pl = e.target.closest('[data-play]');
        if (p) {
          v.uri = p.dataset.uri;
          s.querySelectorAll('.vs-row').forEach((r) => r.classList.toggle('on', r.contains(p)));
          s.querySelectorAll('[data-uri]').forEach((x) => x.setAttribute('aria-checked', x === p));
          save();
          preview(sample, v);
        } else if (pl) preview(sample, { ...v, uri: pl.dataset.play });
        else if (e.target.closest('#vsReset')) {
          v.pitch = 1;
          v.rate = 1;
          for (const k of ['pitch', 'rate']) (s.querySelector(`#vs-${k}`).value = 1), (s.querySelector(`#vsv-${k}`).textContent = '1.0×');
          save();
        }
      });
      for (const k of ['pitch', 'rate']) {
        const el = s.querySelector(`#vs-${k}`);
        el.addEventListener('input', () => {
          v[k] = Number(el.value);
          s.querySelector(`#vsv-${k}`).textContent = `${v[k].toFixed(1)}×`;
          el.setAttribute('aria-valuetext', `${v[k].toFixed(1)} times`);
        });
        el.addEventListener('change', () => (save(), preview(sample, v)));
      }
    },
  });
}
