// Reading text: size, font and colours for chat messages (not the app's own controls).
// Stored in S.settings.text and applied as CSS variables, so both layouts follow it:
// the story layout on black and the cream narrator/character bubbles.
import { S } from './store.js';

export const SIZES = { s: { label: 'Small', d: -2 }, m: { label: 'Medium', d: 0 }, l: { label: 'Large', d: 2 }, xl: { label: 'Extra large', d: 4 } };
// Archivo is the app's signage face; the rest are made for reading on screens (big lowercase,
// open shapes, letters that can't be mixed up, no hairline strokes to shimmer on black).
export const FONTS = {
  archivo: { name: 'Archivo', note: 'Signboard (default)', css: "'Archivo', system-ui, sans-serif" },
  atkinson: { name: 'Atkinson Hyperlegible Next', short: 'Atkinson', note: 'Every letter distinct', css: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, sans-serif", url: 'Atkinson+Hyperlegible+Next:ital,wght@0,200..800;1,200..800' },
  lexend: { name: 'Lexend', note: 'Made for less strain', css: "'Lexend', system-ui, sans-serif", url: 'Lexend:wght@300..700' },
  inter: { name: 'Inter', note: 'Crisp on screens', css: "'Inter', system-ui, sans-serif", url: 'Inter:ital,wght@0,400..700;1,400..700' },
  merriweather: { name: 'Merriweather', note: 'Screen serif', css: "'Merriweather', Georgia, serif", url: 'Merriweather:ital,wght@0,300..900;1,300..900' },
  literata: { name: 'Literata', note: 'E-book serif', css: "'Literata', Georgia, serif", url: 'Literata:ital,wght@0,400..700;1,400..700' },
  nunito: { name: 'Nunito', note: 'Soft and round', css: "'Nunito', system-ui, sans-serif", url: 'Nunito:ital,wght@0,400..800;1,400..800' },
};
// Text weight for the character's and narrator's text. Thin strokes glow and blur on black, so a
// little heavier can be easier on the eyes. b: bubbles, s: the story layout.
export const WEIGHTS = { light: { label: 'Lighter', b: 400, s: 380 }, normal: { label: 'Normal', b: 500, s: 400 }, heavy: { label: 'Heavier', b: 600, s: 500 } };
// Each dialogue colour has a value for black (story layout) and one for the cream bubbles (≥4.5:1 on both).
// No red (action) and no yellow (selected) in the list, by the app's colour rules.
export const DIALOGUE = {
  white: { label: 'White', dark: '#FFFFFF', cream: '#0A0A0A' },
  parchment: { label: 'Parchment', dark: '#F2E6C9', cream: '#5A4410' },
  sand: { label: 'Sand', dark: '#E3C99A', cream: '#6B4E1A' },
  rose: { label: 'Rose', dark: '#FFB3C7', cream: '#9A1D47' },
  peach: { label: 'Peach', dark: '#FFC59E', cream: '#87390D' },
  mint: { label: 'Mint', dark: '#9EE6C2', cream: '#11603F' },
  teal: { label: 'Teal', dark: '#86E0E0', cream: '#0A5858' },
  sky: { label: 'Sky', dark: '#9FD3FF', cream: '#124A80' },
  lilac: { label: 'Lilac', dark: '#CDBEFF', cream: '#4A2D99' },
  // On black: the speaker's colour lightened; in cream bubbles: the character's colour darkened (set in CSS).
  line: { label: 'Speaker’s line colour', dark: '#FFFFFF', cream: '#0A0A0A' },
};
export const NARRATION = {
  grey: { label: 'Grey', dark: '#9B9B9B' },
  soft: { label: 'Soft grey', dark: '#BDBDBD' },
  warm: { label: 'Warm grey', dark: '#D9D6CC' },
  sepia: { label: 'Sepia', dark: '#CDB99A' },
  blue: { label: 'Blue grey', dark: '#A9B9CF' },
  lilac: { label: 'Lilac grey', dark: '#BFB5DA' },
  sage: { label: 'Sage', dark: '#B2C3AE' },
};
// The character's bubble (Bubbles layout). Light ones keep dark text, dark ones light text; every
// speech colour above stays at 4.5:1 or more on each. No black: it would vanish into the background.
export const BUBBLES = {
  cream: { label: 'Cream', bg: '#ECECEC' },
  white: { label: 'White', bg: '#FFFFFF' },
  paper: { label: 'Paper', bg: '#F2E9DA' },
  mist: { label: 'Mist', bg: '#DDE4EC' },
  sage: { label: 'Sage', bg: '#DCE6DA' },
  blush: { label: 'Blush', bg: '#F2DDE4' },
  lilac: { label: 'Lilac', bg: '#E4DEF4' },
  line: { label: 'Character’s line colour', bg: 'line' },
  plate: { label: 'Charcoal', bg: '#262626', dark: true },
  night: { label: 'Night', bg: '#17233A', dark: true },
  plum: { label: 'Plum', bg: '#2B1F36', dark: true },
  forest: { label: 'Forest', bg: '#17291F', dark: true },
};
// Your own bubble.
export const MY_BUBBLES = {
  yellow: { label: 'Yellow (Signboard)', bg: '#FDCD15' },
  cream: { label: 'Cream', bg: '#ECECEC' },
  white: { label: 'White', bg: '#FFFFFF' },
  plate: { label: 'Charcoal', bg: '#262626', dark: true },
};
export const LAYOUTS = { bubbles: { label: 'Bubbles', note: 'Messages in bubbles' }, story: { label: 'Story', note: 'Narration as text, speech on a line' } };
// The character's and narrator's text only (your own lines keep the standard look).
export const WIDTHS = { tight: { label: 'Tight' }, wide: { label: 'Wide' }, fill: { label: 'Fill' } };
export const ALIGNS = { left: { label: 'Left' }, right: { label: 'Right' }, justify: { label: 'Justify' } };
export const TRACKS = { tight: { label: 'Tight', v: '-0.015em' }, normal: { label: 'Normal', v: '0em' }, wide: { label: 'Wide', v: '0.035em' } };
// em: the gap between paragraphs inside one message; gap: between story blocks.
export const PARAS = { tight: { label: 'Tight', em: '.5lh', gap: '12px' }, normal: { label: 'Normal', em: '1lh', gap: '20px' }, wide: { label: 'Wide', em: '1.7lh', gap: '30px' } };
export const DEFAULT_TEXT = { size: 'm', font: 'archivo', dialogue: 'white', narration: 'soft', bubble: 'cream', me: 'yellow', weight: 'normal', layout: 'bubbles', width: 'wide', align: 'left', track: 'normal', para: 'normal' };
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
  const w = WEIGHTS[t.weight] || WEIGHTS.normal;
  r.setProperty('--read-wb', w.b);
  r.setProperty('--read-ws', w.s);
  r.setProperty('--dlg-dark', (DIALOGUE[t.dialogue] || DIALOGUE.white).dark);
  const bub = BUBBLES[t.bubble] || BUBBLES.cream;
  const me = MY_BUBBLES[t.me] || MY_BUBBLES.yellow;
  const root = document.documentElement.classList;
  // Speech inside the bubble: the dark-ground value on a dark bubble, else the light-ground one.
  r.setProperty('--dlg-cream', (DIALOGUE[t.dialogue] || DIALOGUE.white)[bub.dark ? 'dark' : 'cream']);
  if (bub.bg === 'line') r.removeProperty('--bub-bg');
  else r.setProperty('--bub-bg', bub.bg);
  r.setProperty('--bub-ink', bub.dark ? '#ECECEC' : '#0A0A0A');
  r.setProperty('--bub-act', bub.dark ? '#B4B4B4' : '#555555');
  root.toggle('bub-line', bub.bg === 'line');
  root.toggle('bub-dark', !!bub.dark);
  r.setProperty('--me-bg', me.bg);
  r.setProperty('--me-ink', me.dark ? '#ECECEC' : '#0A0A0A');
  r.setProperty('--me-act', me.dark ? '#B4B4B4' : 'rgba(10, 10, 10, .7)');
  root.toggle('me-dark', !!me.dark);
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
