// Original chibi avatars drawn in SVG, with four expressions.
import { esc, shade, inkOn } from './util.js';

export const PRESETS = {
  mika: { name: 'Cat ears', hair: '#f6a0c6', hi: '#ffd3e6', skin: '#ffe3d6', e1: '#7a3fa0', e2: '#e08ae0', cloth: '#fff0f6', acc: 'cat', long: true },
  ren: { name: 'Short', hair: '#9db6ea', hi: '#d8e4ff', skin: '#fddfcf', e1: '#2d58a8', e2: '#6cb8ea', cloth: '#2b3452', acc: 'none', long: false },
  sora: { name: 'Star clip', hair: '#c6a4f4', hi: '#ebdcff', skin: '#ffe4d8', e1: '#5a3fb0', e2: '#ab8cf2', cloth: '#efe8ff', acc: 'star', long: true },
  haru: { name: 'Headphones', hair: '#7fe0c8', hi: '#c8fff1', skin: '#fddccb', e1: '#1f7a6a', e2: '#52d8b2', cloth: '#233a44', acc: 'phones', long: false },
  yui: { name: 'Ribbon', hair: '#ffb37c', hi: '#ffdcbd', skin: '#ffe2d2', e1: '#9a4a1a', e2: '#f2a43e', cloth: '#fff4e6', acc: 'ribbon', long: true },
  kai: { name: 'Dark hair', hair: '#4a4470', hi: '#8f88c4', skin: '#fde0d0', e1: '#2a4a7a', e2: '#5aa4dc', cloth: '#4b4080', acc: 'none', long: false },
};
export const PRESET_KEYS = Object.keys(PRESETS);
export const EXPRESSIONS = ['happy', 'flustered', 'sleepy', 'excited'];

let n = 0;

// A plain initial on the line colour: for characters with no face chosen yet (e.g. saved passengers).
export const initialSVG = (name, size, bg = '#2EAA67') =>
  `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/><text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Archivo, sans-serif" font-weight="900" font-size="52" fill="${inkOn(bg)}">${esc(((name || '?').trim()[0] || '?').toUpperCase())}</text></svg>`;
export const faceSVG = (who, size, expr, bg) => (who.preset === 'initial' ? initialSVG(who.name, size, bg) : avatarSVG(who.preset, size, expr, bg));

export function avatarSVG(presetKey, size, expr = 'happy', bg = '#2EAA67') {
  const p = PRESETS[presetKey] || PRESETS.mika;
  const u = 'av' + ++n;
  const back = p.long
    ? 'M19 54 C17 26 36 12 50 12 C64 12 83 26 81 54 C80 70 77 84 72 92 L28 92 C23 84 20 70 19 54Z'
    : 'M21 52 C20 26 36 14 50 14 C64 14 80 26 79 52 C79 58 77 60 76 62 L24 62 C23 60 21 58 21 52Z';
  let ears = '';
  let front = '';
  if (p.acc === 'cat')
    ears = `<path d="M26 36 L29 11 L45 23Z" fill="${p.hair}"/><path d="M30 30 L32 18 L40 24Z" fill="#ffb5cf"/><path d="M74 36 L71 11 L55 23Z" fill="${p.hair}"/><path d="M70 30 L68 18 L60 24Z" fill="#ffb5cf"/>`;
  if (p.acc === 'star') front = '<path d="M69 21 L71.2 27.8 L78 30 L71.2 32.2 L69 39 L66.8 32.2 L60 30 L66.8 27.8Z" fill="#fff2a6"/>';
  if (p.acc === 'ribbon') front = '<path d="M31 27 L16 18 L17 37Z" fill="#ff6a9c"/><path d="M31 27 L46 18 L45 37Z" fill="#ff6a9c"/><circle cx="31" cy="27" r="4" fill="#ff93b8"/>';
  if (p.acc === 'phones')
    front = '<path d="M24 52 C21 22 79 22 76 52" stroke="#2b2f45" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="18" y="47" width="10" height="17" rx="5" fill="#3d4468"/><rect x="72" y="47" width="10" height="17" rx="5" fill="#3d4468"/>';

  let eyes = '';
  for (const x of [40, 60]) {
    if (expr === 'happy' || expr === 'flustered') {
      eyes +=
        `<ellipse cx="${x}" cy="58" rx="5.6" ry="7.1" fill="#1b1030"/>` +
        `<ellipse cx="${x}" cy="58.6" rx="4.6" ry="6.1" fill="url(#ey${u})"/>` +
        `<ellipse cx="${x}" cy="59" rx="2" ry="3.2" fill="#1b1030"/>` +
        `<circle cx="${x + 1.8}" cy="55.4" r="2.2" fill="#fff"/>` +
        `<circle cx="${x - 1.6}" cy="61.4" r="1" fill="#fff" fill-opacity=".85"/>` +
        `<path d="M${x - 6} 55.2 Q${x} 51.6 ${x + 6} 55.2" stroke="#1b1030" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    } else if (expr === 'sleepy') {
      eyes += `<path d="M${x - 5.5} 58 Q${x} 62.5 ${x + 5.5} 58" stroke="#1b1030" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    } else {
      eyes += `<path d="M${x - 5.5} 59.5 Q${x} 53 ${x + 5.5} 59.5" stroke="#1b1030" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    }
  }
  let blush = '.5';
  let mouth = '<path d="M45.5 67 Q50 72.2 54.5 67" stroke="#a0475c" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  let extra = '';
  if (expr === 'flustered') {
    blush = '.9';
    mouth = '<path d="M46 68.5 q2 -2.2 4 0 t4 0" stroke="#a0475c" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    extra = '<path d="M72 34 C75 39 76 42 73.5 44 C71 45 69 42.5 70 40 C70.5 38.5 71 36.5 72 34Z" fill="#9fdcff" opacity=".9"/>';
  } else if (expr === 'sleepy') {
    mouth = '<path d="M47.5 68 Q50 69.6 52.5 68" stroke="#a0475c" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    extra = '<path d="M68 31h7l-7 8h7M77 22h5l-5 6h5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>';
  } else if (expr === 'excited') {
    mouth = '<path d="M44.5 66 Q50 76 55.5 66Z" fill="#a0475c"/><path d="M47 70.5 Q50 73 53 70.5" stroke="#ff8fb1" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
    extra = '<path d="M20 38 L21.4 41.6 L25 43 L21.4 44.4 L20 48 L18.6 44.4 L15 43 L18.6 41.6Z" fill="#fff2a6"/>';
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" class="av-svg">` +
    `<defs><linearGradient id="bg${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(bg, -0.38)}"/><stop offset="1" stop-color="${bg}"/></linearGradient>` +
    `<linearGradient id="ey${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.e1}"/><stop offset="1" stop-color="${p.e2}"/></linearGradient>` +
    `<radialGradient id="gl${u}" cx=".3" cy=".15" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="100" height="100" fill="url(#bg${u})"/><rect width="100" height="100" fill="url(#gl${u})"/>` +
    `<path d="${back}" fill="${p.hair}"/>${ears}` +
    `<path d="M20 101 C22 85 34 77 50 77 C66 77 78 85 80 101Z" fill="${p.cloth}"/>` +
    `<ellipse cx="50" cy="75" rx="7" ry="6" fill="${p.skin}"/><ellipse cx="50" cy="55" rx="22" ry="21" fill="${p.skin}"/>` +
    `<path d="M27 54 C25 33 37 22 50 22 C63 22 75 33 73 54 C70 46 66 42 61 40 C60 46 54 48 49 44 C46 48 38 48 36 41 C32 44 29 48 27 54Z" fill="${p.hair}"/>` +
    `<path d="M36 30 C42 25 55 25 63 31" stroke="${p.hi}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".75"/>` +
    eyes +
    `<ellipse cx="32" cy="66" rx="4.8" ry="2.7" fill="#ff8fb1" opacity="${blush}"/><ellipse cx="68" cy="66" rx="4.8" ry="2.7" fill="#ff8fb1" opacity="${blush}"/>` +
    mouth + front + extra + '</svg>'
  );
}

// Avatar tile for a character (or the persona): uploaded image or chibi preset.
export function avatarTile(who, size, { expr = 'happy', radius, rot = 0, cls = '', ring = '' } = {}) {
  const r = radius ?? Math.round(size * 0.28);
  const bg = who.line?.color || who.color || '#2EAA67';
  const inner = who.avatarImage
    ? `<img src="${esc(who.avatarImage)}" alt="" width="${size}" height="${size}" style="width:100%;height:100%;object-fit:cover;display:block">`
    : faceSVG(who, size, expr, bg);
  const ringStyle = ring ? `box-shadow:0 0 0 4px ${ring};` : '';
  return `<span class="av ${cls}" data-expr="${expr}" style="width:${size}px;height:${size}px;border-radius:${r}px;transform:rotate(${rot}deg);${ringStyle}">${inner}</span>`;
}
