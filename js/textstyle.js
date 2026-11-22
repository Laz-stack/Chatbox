// Reading text: size, font and colours for chat messages (not the app's own controls).
// Stored in S.settings.text and applied as CSS variables, so both layouts follow it:
// the story layout on black and the cream narrator/character bubbles.
import { S } from './store.js';

// Archivo is the app's signage face; the rest are made for reading on screens (big lowercase,
// open shapes, letters that can't be mixed up, no hairline strokes to shimmer on black).
// Grouped like an e-reader's font list. Open look-alikes of Kindle's faces sit with the rest.
export const FONTS = {
  literata: { g: 'E-book serifs', name: 'Literata', note: 'Like Bookerly', css: "'Literata', Georgia, serif", url: 'Literata:ital,wght@0,200..900;1,200..900' },
  sourceserif: { g: 'E-book serifs', name: 'Source Serif', note: 'Calm, made for screens', css: "'Source Serif 4', Georgia, serif", url: 'Source+Serif+4:ital,opsz,wght@0,8..60,300..800;1,8..60,300..800' },
  newsreader: { g: 'E-book serifs', name: 'Newsreader', note: 'Made for long reads', css: "'Newsreader', Georgia, serif", url: 'Newsreader:ital,opsz,wght@0,6..72,300..800;1,6..72,300..800' },
  merriweather: { g: 'E-book serifs', name: 'Merriweather', note: 'Sturdy screen serif', css: "'Merriweather', Georgia, serif", url: 'Merriweather:ital,wght@0,300..900;1,300..900' },
  gelasio: { g: 'E-book serifs', name: 'Gelasio', note: 'Like Georgia', css: "'Gelasio', Georgia, serif", url: 'Gelasio:ital,wght@0,400..700;1,400..700' },
  baskerville: { g: 'Classic book', name: 'Baskervville', note: 'Like Baskerville', css: "'Baskervville', Georgia, serif", url: 'Baskervville:ital,wght@0,400..700;1,400..700' },
  garamond: { g: 'Classic book', name: 'EB Garamond', note: 'Old-style novel', css: "'EB Garamond', Georgia, serif", url: 'EB+Garamond:ital,wght@0,400..800;1,400..800' },
  crimson: { g: 'Classic book', name: 'Crimson Pro', note: 'Like Palatino', css: "'Crimson Pro', Georgia, serif", url: 'Crimson+Pro:ital,wght@0,300..800;1,300..800' },
  lora: { g: 'Classic book', name: 'Lora', note: 'Brushed, friendly', css: "'Lora', Georgia, serif", url: 'Lora:ital,wght@0,400..700;1,400..700' },
  alegreya: { g: 'Classic book', name: 'Alegreya', note: 'Literary, lively', css: "'Alegreya', Georgia, serif", url: 'Alegreya:ital,wght@0,400..900;1,400..900' },
  spectral: { g: 'Classic book', name: 'Spectral', note: 'Elegant, light', css: "'Spectral', Georgia, serif", url: 'Spectral:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500;1,600' },
  bitter: { g: 'Slab', name: 'Bitter', note: 'Like Caecilia', css: "'Bitter', Georgia, serif", url: 'Bitter:ital,wght@0,100..900;1,100..900' },
  archivo: { g: 'Sans', name: 'Archivo', note: 'Signboard (default)', css: "'Archivo', system-ui, sans-serif" },
  inter: { g: 'Sans', name: 'Inter', note: 'Crisp', css: "'Inter', system-ui, sans-serif", url: 'Inter:ital,wght@0,300..700;1,300..700' },
  sourcesans: { g: 'Sans', name: 'Source Sans', note: 'Open, neutral', css: "'Source Sans 3', system-ui, sans-serif", url: 'Source+Sans+3:ital,wght@0,300..800;1,300..800' },
  noto: { g: 'Sans', name: 'Noto Sans', note: 'Like Amazon Ember', css: "'Noto Sans', system-ui, sans-serif", url: 'Noto+Sans:ital,wght@0,300..800;1,300..800' },
  figtree: { g: 'Sans', name: 'Figtree', note: 'Clean, geometric', css: "'Figtree', system-ui, sans-serif", url: 'Figtree:ital,wght@0,300..800;1,300..800' },
  nunito: { g: 'Sans', name: 'Nunito', note: 'Soft and round', css: "'Nunito', system-ui, sans-serif", url: 'Nunito:ital,wght@0,300..800;1,300..800' },
  atkinson: { g: 'Easy to read', name: 'Atkinson Hyperlegible Next', short: 'Atkinson', note: 'Every letter distinct', css: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, sans-serif", url: 'Atkinson+Hyperlegible+Next:ital,wght@0,200..800;1,200..800' },
  lexend: { g: 'Easy to read', name: 'Lexend', note: 'Less strain (no italics)', css: "'Lexend', system-ui, sans-serif", url: 'Lexend:wght@300..700' },
};
// Like an e-reader: size 1–14, boldness 0–5, line spacing 1–5. Older word settings map onto them.
export const SIZE_STEPS = [14, 15, 16, 17, 18, 19, 20, 22, 23, 25, 26, 28, 30, 32];
export const BOLD_STEPS = [400, 450, 500, 560, 620, 700];
export const LH_STEPS = [1.4, 1.5, 1.6, 1.75, 1.9];
const OLD_SIZE = { s: 1, m: 3, l: 5, xl: 7 };
const OLD_WEIGHT = { light: 0, normal: 0, heavy: 2 };
const num = (v, min, max, d) => (Number.isFinite(+v) && v !== '' && v != null ? Math.max(min, Math.min(max, Math.round(+v))) : d);

// Text weight for the character's and narrator's text. Thin strokes glow and blur on black, so a
// little heavier can be easier on the eyes. b: bubbles, s: the story layout.
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
// The space between the chat's text and the screen's left and right edges.
export const SIDES = { normal: { label: 'Normal', px: 0 }, roomy: { label: 'Roomy', px: 26 }, wide: { label: 'Wide', px: 38 } };
// Page colour: the colour behind the story (the chat's message area). Comfort darks with softer text
// than pure white on black, and three light pages with dark text. Text colours follow the page.
export const PAGES = {
  original: { label: 'Black', pg: '#0A0A0A', note: 'The black page, as it always was.' },
  charcoal: { label: 'Charcoal', pg: '#1C1C1E', body: '#CFCFD2', note: 'Softer than black, and softer text: less glow around letters.' },
  graphite: { label: 'Graphite', pg: '#2A2B30', body: '#D3D4D8', note: 'A mid dark grey: the gentlest dark for long reading.' },
  night: { label: 'Night', pg: '#131A24', body: '#CBD2DB', note: 'Deep blue-black, like a night sky.' },
  ember: { label: 'Ember', pg: '#1F1A15', body: '#D9D0C2', note: 'Warm dark brown; easy at night.' },
  nightpaper: { label: 'Night paper', pg: '#24211D', body: '#D8D1C4', note: 'Dark paper, warm and soft. Try it with a texture.' },
  paper: { label: 'White paper', pg: '#F6F4EF', body: '#262626', narr: '#4E4E4E', light: true, note: 'Warm off-white, never pure white. Dark text.' },
  cream: { label: 'Cream', pg: '#F1E7D0', body: '#3A2F25', narr: '#54473A', light: true, note: 'Cream book paper. Dark text.' },
  sepia: { label: 'Sepia', pg: '#E6D9C0', body: '#3A2F25', narr: '#4F4235', light: true, note: 'A toned-down sepia, never bright. Dark text.' },
  sage: { label: 'Green', pg: '#DFE8DC', body: '#26332A', narr: '#46564A', light: true, note: 'Soft green paper. Dark text.' },
  grey: { label: 'Grey', pg: '#DEDCD6', body: '#2A2A2A', narr: '#4A4A4A', light: true, note: 'Grey recycled paper. Dark text.' },
};
// Paper textures, drawn by the browser (no picture files) and tiled behind the text; strength 0–5.
// On dark pages the same paper is drawn in light ink (inverted), so it shows instead of vanishing.
const svgTile = (inner, op, w = 256, light = false) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${w}'>${light ? "<filter id='inv'><feColorMatrix values='-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0'/></filter>" : ''}<g opacity='${op}'${light ? " filter='url(#inv)'" : ''}>${inner}</g></svg>`)}")`;
const noise = (id, f, oct, a, col = '.42 .35 .27', extra = '') => { const [r, g, b] = col.split(' '); return `<filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='${oct}' stitchTiles='stitch' ${extra}/><feColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${a} 0'/></filter><rect width='100%' height='100%' filter='url(#${id})'/>`; };
const tooth = (id, f, oct, scale, a = 1) => `<filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='${oct}' stitchTiles='stitch' result='n'/><feDiffuseLighting in='n' lighting-color='#fff' surfaceScale='${scale}' result='l'><feDistantLight azimuth='225' elevation='55'/></feDiffuseLighting><feColorMatrix in='l' values='0 0 0 0 .36  0 0 0 0 .31  0 0 0 0 .25  -1.1 0 0 0 1.04'/><feComponentTransfer><feFuncA type='linear' slope='${a}'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#${id})'/>`;
const flecks = (id, f, seed, a) => `<filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .28  0 0 0 0 .22  0 0 0 0 .17  0 0 0 ${a} ${-(a * 0.7).toFixed(2)}'/></filter><rect width='100%' height='100%' filter='url(#${id})'/>`;
const lines = (dir, step, op) => Array.from({ length: Math.ceil(256 / step) }, (_, i) => (dir === 'h' ? `<rect x='0' y='${(i * step).toFixed(1)}' width='256' height='.8' fill='#5a4a3a' opacity='${op}'/>` : `<rect x='${(i * step).toFixed(1)}' y='0' width='.9' height='256' fill='#5a4a3a' opacity='${op}'/>`)).join('');
export const TEXTURES = {
  none: { label: 'Smooth', note: 'Flat colour, no texture' },
  grain: { label: 'Fine grain', note: 'A light, even tooth', svg: () => tooth('t', '.9', 3, 1.4, 0.8) + noise('g', '.75', 2, '.35') },
  cold: { label: 'Cold press', note: 'Bumpy watercolour paper', svg: () => tooth('t', '.045', 5, 3.2, 1) + noise('g', '.8', 2, '.22') },
  laid: { label: 'Laid', note: 'Fine lines like old book paper', svg: () => lines('h', 3, 0.09) + lines('v', 32, 0.1) + noise('g', '.7', 2, '.25') + noise('f', '.008 .12', 2, '.18', '.42 .35 .27', "seed='3'") },
  linen: { label: 'Linen', note: 'A woven, cloth-like finish', svg: () => `<filter id='w' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.03' numOctaves='2' result='d'/><feDisplacementMap in='SourceGraphic' in2='d' scale='3'/></filter><g filter='url(#w)'>${lines('h', 2.6, 0.1)}${lines('v', 2.6, 0.1)}</g>` + noise('g', '.6', 2, '.2') },
  recycled: { label: 'Recycled', note: 'Grey flecks and fibres', svg: () => noise('g', '.7', 2, '.3') + noise('f', '.006 .14', 3, '.28', '.4 .34 .28', "seed='7'") + flecks('k', '.3', 5, 7.5) + flecks('k2', '.5', 11, 9) },
  parch: { label: 'Parchment', note: 'Mottled, darker at the edges', size: 512, vig: true, svg: () => noise('m', '.012', 4, '.55', '.5 .38 .22') + noise('g', '.8', 2, '.25') + noise('f', '.005 .1', 2, '.16', '.45 .35 .25', "seed='9'") },
};
export const TEX_STRENGTH = [0, 0.3, 0.45, 0.6, 0.78, 0.95];
// Blend a colour toward the page, so text on a softer page is softer too.
const mixHex = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * k + parseInt(b.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');

export const DEFAULT_TEXT = { tex: 'none', str: 2, upright: false, lh: 3, bold: 0, page: 'original', choices: true, names: true, marker: true, side: 'normal', size: 3, font: 'archivo', dialogue: 'white', narration: 'soft', bubble: 'cream', me: 'yellow', layout: 'bubbles', width: 'wide', align: 'left', track: 'normal', para: 'normal' };
export function textPrefs() {
  const t = { ...DEFAULT_TEXT, ...(S.settings.text || {}) };
  // Older settings used words; they become the nearest numbers.
  t.size = OLD_SIZE[t.size] ?? num(t.size, 1, 14, 3);
  if (t.bold === DEFAULT_TEXT.bold && S.settings.text?.weight) t.bold = OLD_WEIGHT[S.settings.text.weight] ?? 0;
  t.bold = num(t.bold, 0, 5, 0);
  delete t.weight;
  t.lh = num(t.lh, 1, 5, 3);
  t.str = num(t.str, 0, 5, 2);
  if (!TEXTURES[t.tex]) t.tex = 'none';
  if (t.align === 'right') t.align = 'left'; // the panel offers Left and Justified
  if (!FONTS[t.font]) t.font = 'archivo';
  return t;
}

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
  const px = SIZE_STEPS[t.size - 1] || 16;
  r.setProperty('--read-scene', `${px}px`);
  r.setProperty('--read-bubble', `${px - 1}px`);
  r.setProperty('--read-font', (FONTS[t.font] || FONTS.archivo).css);
  const w = BOLD_STEPS[t.bold] ?? 400;
  r.setProperty('--read-wb', Math.min(800, w + 100));
  r.setProperty('--read-ws', w);
  r.setProperty('--read-lh', LH_STEPS[t.lh - 1] || 1.6);
  document.documentElement.classList.toggle('narr-upright', !!t.upright);
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
  // Page colour. Original changes nothing; the others set the page and the text on it.
  const page = PAGES[t.page] || PAGES.original;
  const dlg = DIALOGUE[t.dialogue] || DIALOGUE.white;
  document.documentElement.dataset.page = PAGES[t.page] ? t.page : 'original';
  root.toggle('page-light', !!page.light);
  if (t.page && t.page !== 'original' && PAGES[t.page]) {
    r.setProperty('--page', page.pg);
    r.setProperty('--page-body', page.body);
    r.setProperty('--page-narr', page.light ? page.narr : mixHex((NARRATION[t.narration] || NARRATION.soft).dark, page.pg, 0.9));
    r.setProperty('--page-say', page.light ? dlg.cream : mixHex(dlg.dark, page.pg, 0.92));
    // Dim mode tints the screen warm; a light page would turn bright tan, so it reads as Ember then.
    r.setProperty('--page-say-dim', mixHex(dlg.dark, PAGES.ember.pg, 0.92));
    r.setProperty('--page-narr-dim', mixHex((NARRATION[t.narration] || NARRATION.soft).dark, PAGES.ember.pg, 0.9));
  } else ['--page', '--page-body', '--page-narr', '--page-say', '--page-say-dim', '--page-narr-dim'].forEach((v) => r.removeProperty(v));
  // Paper texture: baked at the chosen strength (fainter on dark pages), tiled behind the text.
  const tx = TEXTURES[t.tex];
  if (tx?.svg && t.str > 0) {
    r.setProperty('--page-tex', svgTile(tx.svg(), (TEX_STRENGTH[t.str] * (page.light ? 1 : 0.35)).toFixed(2), tx.size || 256, !page.light));
    r.setProperty('--page-tex-size', `${tx.size || 256}px`);
    r.setProperty('--page-vig', tx.vig ? `inset 0 0 90px rgba(90, 60, 25, ${(0.06 * t.str * (page.light ? 1 : 0.6)).toFixed(2)})` : 'none');
  } else ['--page-tex', '--page-tex-size', '--page-vig'].forEach((v) => r.removeProperty(v));
  document.documentElement.classList.toggle('page-tex', !!(tx?.svg && t.str > 0));
  document.documentElement.classList.toggle('page-dark-tex', !!(tx?.svg && t.str > 0 && !page.light));
  document.documentElement.classList.toggle('dlg-line', t.dialogue === 'line');
  r.setProperty('--read-track', (TRACKS[t.track] || TRACKS.normal).v);
  r.setProperty('--read-pgap', (PARAS[t.para] || PARAS.normal).em);
  r.setProperty('--read-bgap', (PARAS[t.para] || PARAS.normal).gap);
  document.documentElement.dataset.rw = WIDTHS[t.width] ? t.width : 'wide';
  document.documentElement.dataset.ra = ALIGNS[t.align] ? t.align : 'left';
  const side = SIDES[t.side]?.px || 0;
  if (side) r.setProperty('--read-side', side + 'px');
  else r.removeProperty('--read-side');
  loadFont(t.font);
}

export const textSummary = (t = textPrefs()) => `Size ${t.size} · ${(FONTS[t.font] || FONTS.archivo).short || (FONTS[t.font] || FONTS.archivo).name} · ${(DIALOGUE[t.dialogue] || DIALOGUE.white).label.toLowerCase()} speech`;
