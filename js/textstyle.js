// Reading text: size, font and colours for chat messages (not the app's own controls).
// Stored in S.settings.text and applied as CSS variables, so both layouts follow it:
// the story layout on black and the cream narrator/character bubbles.
import { S } from './store.js';

export const SIZES = { s: { label: 'Small', d: -2 }, m: { label: 'Medium', d: 0 }, l: { label: 'Large', d: 2 }, xl: { label: 'Extra large', d: 4 } };
export const FONTS = {
  archivo: { name: 'Archivo', note: 'Signboard (default)', css: "'Archivo', system-ui, sans-serif" },
  literata: { name: 'Literata', note: 'Book', css: "'Literata', Georgia, serif", url: 'Literata:ital,wght@0,400..700;1,400..700' },
  atkinson: { name: 'Atkinson Hyperlegible', short: 'Atkinson', note: 'Easy to read', css: "'Atkinson Hyperlegible', system-ui, sans-serif", url: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700' },
  nunito: { name: 'Nunito', note: 'Soft', css: "'Nunito', system-ui, sans-serif", url: 'Nunito:ital,wght@0,400..800;1,400..800' },
};
// Each dialogue colour has a value for black (story layout) and one for the cream bubbles (≥4.5:1 on both).
// No red (action) and no yellow (selected) in the list, by the app's colour rules.
export const DIALOGUE = {
  white: { label: 'White', dark: '#FFFFFF', cream: '#0A0A0A' },
  parchment: { label: 'Parchment', dark: '#F2E6C9', cream: '#5A4410' },
  sand: { label: 'Sand', dark: '#E3C99A', cream: '#6B4E1A' },
  // On black: the speaker's colour lightened; in cream bubbles: the character's colour darkened (set in CSS).
  line: { label: 'Speaker’s line colour', dark: '#FFFFFF', cream: '#0A0A0A' },
};
export const NARRATION = {
  grey: { label: 'Grey', dark: '#9B9B9B' },
  soft: { label: 'Soft grey', dark: '#BDBDBD' },
  warm: { label: 'Warm grey', dark: '#D9D6CC' },
};
export const LAYOUTS = { bubbles: { label: 'Bubbles', note: 'Messages in bubbles' }, story: { label: 'Story', note: 'Narration as text, speech on a line' } };
// The character's and narrator's text only (your own lines keep the standard look).
export const WIDTHS = { tight: { label: 'Tight' }, wide: { label: 'Wide' }, fill: { label: 'Fill' } };
export const ALIGNS = { left: { label: 'Left' }, right: { label: 'Right' }, justify: { label: 'Justify' } };
export const TRACKS = { tight: { label: 'Tight', v: '-0.015em' }, normal: { label: 'Normal', v: '0em' }, wide: { label: 'Wide', v: '0.035em' } };
// em: the gap between paragraphs inside one message; gap: between story blocks.
export const PARAS = { tight: { label: 'Tight', em: '.5lh', gap: '12px' }, normal: { label: 'Normal', em: '1lh', gap: '20px' }, wide: { label: 'Wide', em: '1.7lh', gap: '30px' } };
export const DEFAULT_TEXT = { size: 'm', font: 'archivo', dialogue: 'white', narration: 'soft', layout: 'bubbles', width: 'wide', align: 'left', track: 'normal', para: 'normal' };
export const textPrefs = () => ({ ...DEFAULT_TEXT, ...(S.settings.text || {}) });

const loaded = new Set();
function loadFont(key) {
  const f = FONTS[key];
  if (!f?.url || loaded.has(key)) return;
  loaded.add(key);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${f.url}&display=swap`;
  document.head.appendChild(l);
}

export function applyText(t = textPrefs()) {
  const r = document.documentElement.style;
  const d = SIZES[t.size]?.d ?? 0;
  r.setProperty('--read-scene', `${16 + d}px`);
  r.setProperty('--read-bubble', `${15 + d}px`);
  r.setProperty('--read-font', (FONTS[t.font] || FONTS.archivo).css);
  r.setProperty('--dlg-dark', (DIALOGUE[t.dialogue] || DIALOGUE.white).dark);
  r.setProperty('--dlg-cream', (DIALOGUE[t.dialogue] || DIALOGUE.white).cream);
  r.setProperty('--narr-dark', (NARRATION[t.narration] || NARRATION.soft).dark);
  document.documentElement.classList.toggle('dlg-line', t.dialogue === 'line');
  r.setProperty('--read-track', (TRACKS[t.track] || TRACKS.normal).v);
  r.setProperty('--read-pgap', (PARAS[t.para] || PARAS.normal).em);
  r.setProperty('--read-bgap', (PARAS[t.para] || PARAS.normal).gap);
  document.documentElement.dataset.rw = WIDTHS[t.width] ? t.width : 'wide';
  document.documentElement.dataset.ra = ALIGNS[t.align] ? t.align : 'left';
  loadFont(t.font);
}

export const textSummary = (t = textPrefs()) => `${SIZES[t.size]?.label || 'Medium'} · ${(FONTS[t.font] || FONTS.archivo).short || (FONTS[t.font] || FONTS.archivo).name} · ${(DIALOGUE[t.dialogue] || DIALOGUE.white).label.toLowerCase()} speech`;
