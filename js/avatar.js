// Built-in faces for characters without a picture of their own: Open Peeps by Pablo Stanley
// (CC0, drawn by hand; files in icons/faces), each in four expressions, on the line colour.
import { esc, inkOn } from './util.js';

export const PRESETS = {
  mika: { name: 'Long bangs' },
  ren: { name: 'Short' },
  sora: { name: 'Headband' },
  haru: { name: 'Glasses' },
  yui: { name: 'Curls' },
  kai: { name: 'Swept back' },
  nao: { name: 'Straight' },
  zen: { name: 'Afro' },
  lin: { name: 'Hijab' },
  taro: { name: 'Beanie' },
};
export const PRESET_KEYS = Object.keys(PRESETS);
export const EXPRESSIONS = ['happy', 'flustered', 'sleepy', 'excited'];

const faceFile = (key, expr) => `icons/faces/${PRESETS[key] ? key : 'mika'}-${EXPRESSIONS.includes(expr) ? expr : 'happy'}.svg`;

// A plain initial on the line colour: for characters with no face chosen yet (e.g. saved passengers).
export const initialSVG = (name, size, bg = '#2EAA67') =>
  `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/><text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Archivo, sans-serif" font-weight="900" font-size="52" fill="${inkOn(bg)}">${esc(((name || '?').trim()[0] || '?').toUpperCase())}</text></svg>`;
export const faceSVG = (who, size, expr, bg) => (who.preset === 'initial' ? initialSVG(who.name, size, bg) : avatarSVG(who.preset, size, expr, bg));

export function avatarSVG(presetKey, size, expr = 'happy', bg = '#2EAA67', href = faceFile(presetKey, expr)) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/><image href="${href}" x="0" y="2" width="100" height="100"/></svg>`;
}

// The same face as one self-contained image (for drawing on a canvas, where linked files don't load).
export async function faceDataURL(who, size, expr = 'happy', bg = '#2EAA67') {
  if (who.preset === 'initial') return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(initialSVG(who.name, size, bg));
  const svg = await (await fetch(faceFile(who.preset, expr))).text();
  const inner = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSVG(who.preset, size, expr, bg, inner).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
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
