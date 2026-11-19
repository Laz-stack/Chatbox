// Backdrop scenes drawn in SVG. Shown in black and white behind the chat.
import { rng } from './util.js';

export const SCENES = [
  { key: 'cafe', name: 'Cafe window' },
  { key: 'night', name: 'Night sky' },
  { key: 'sakura', name: 'Sakura' },
  { key: 'rain', name: 'Rainy street' },
  { key: 'room', name: 'Cozy room' },
  { key: 'none', name: 'None' },
];

let n = 0;

export function sceneSVG(kind) {
  const u = 'sc' + ++n;
  const r = rng(kind);
  let d = '<defs>';
  let b = '';
  if (kind === 'cafe') {
    d += `<linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d1736"/><stop offset="1" stop-color="#52292f"/></linearGradient><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b3b82"/><stop offset="1" stop-color="#ff9a8b"/></linearGradient><filter id="f${u}"><feGaussianBlur stdDeviation="9"/></filter></defs>`;
    b += `<rect width="390" height="844" fill="url(#g${u})"/><rect x="44" y="120" width="302" height="320" rx="22" fill="url(#w${u})" opacity=".7"/><path d="M195 120V440M44 280H346" stroke="#2d1736" stroke-width="7" opacity=".8"/><rect x="44" y="120" width="302" height="320" rx="22" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/><g filter="url(#f${u})">`;
    for (const [cx, cy, rr, c] of [[90, 520, 34, '#ffb35c'], [180, 600, 26, '#ff8fb1'], [280, 540, 38, '#ffc680'], [330, 680, 28, '#ff9ab8'], [60, 700, 30, '#ffb35c'], [220, 740, 34, '#ffd48a'], [140, 470, 20, '#ffd9a0']])
      b += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${c}" opacity=".75"/>`;
    b += '</g>';
  } else if (kind === 'night') {
    d += `<linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120c34"/><stop offset="1" stop-color="#4a3290"/></linearGradient><filter id="f${u}"><feGaussianBlur stdDeviation="14"/></filter></defs>`;
    b += `<rect width="390" height="844" fill="url(#g${u})"/>`;
    for (let i = 0; i < 46; i++) b += `<circle cx="${Math.round(8 + r() * 372)}" cy="${Math.round(10 + r() * 510)}" r="${[0.8, 1.2, 1.8][Math.floor(r() * 3)]}" fill="#fff" opacity="${[0.4, 0.6, 0.9][Math.floor(r() * 3)]}"/>`;
    b += `<circle cx="290" cy="190" r="86" fill="#fff2d8" opacity=".35" filter="url(#f${u})"/><circle cx="290" cy="190" r="52" fill="#fff4dc"/><path d="M0 640 C80 580 160 620 240 590 C300 570 350 600 390 580 V844 H0Z" fill="#1a1046"/><path d="M0 720 C100 670 200 710 390 660 V844 H0Z" fill="#120b36"/>`;
  } else if (kind === 'sakura') {
    d += `<linearGradient id="g${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2162"/><stop offset=".6" stop-color="#8d4a9d"/><stop offset="1" stop-color="#f08fb4"/></linearGradient></defs>`;
    b += `<rect width="390" height="844" fill="url(#g${u})"/><path d="M-20 140 C80 160 120 90 230 110 C300 122 340 80 410 60" stroke="#2a1442" stroke-width="12" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < 38; i++) {
      const x = Math.round(r() * 390);
      const y = Math.round(40 + r() * 760);
      b += `<ellipse cx="${x}" cy="${y}" rx="${6 + Math.round(r() * 6)}" ry="${3 + Math.round(r() * 3)}" fill="#ffd3e4" opacity="${[0.5, 0.7, 0.9][Math.floor(r() * 3)]}" transform="rotate(${Math.round(r() * 180)} ${x} ${y})"/>`;
    }
  } else if (kind === 'rain') {
    d += `<linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a30"/><stop offset="1" stop-color="#1e3d5e"/></linearGradient><filter id="f${u}"><feGaussianBlur stdDeviation="8"/></filter></defs>`;
    b += `<rect width="390" height="844" fill="url(#g${u})"/><g filter="url(#f${u})">`;
    for (const [cx, cy, rr, c] of [[70, 560, 30, '#ff6fa8'], [160, 640, 24, '#5fd8ff'], [260, 580, 34, '#ff6fa8'], [330, 700, 26, '#8f7aff'], [110, 760, 30, '#5fd8ff'], [240, 770, 22, '#ff9ac0']])
      b += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${c}" opacity=".7"/>`;
    b += '</g>';
    for (let i = 0; i < 34; i++) b += `<path d="M${Math.round(r() * 390)} ${Math.round(r() * 780)} l-6 26" stroke="#bfe4ff" stroke-width="1.2" opacity=".3"/>`;
  } else if (kind === 'room') {
    d += `<linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1740"/><stop offset="1" stop-color="#47264f"/></linearGradient><radialGradient id="l${u}" cx=".2" cy=".15" r=".7"><stop offset="0" stop-color="#ffcf8a" stop-opacity=".7"/><stop offset="1" stop-color="#ffcf8a" stop-opacity="0"/></radialGradient></defs>`;
    b += `<rect width="390" height="844" fill="url(#g${u})"/><rect width="390" height="844" fill="url(#l${u})"/><rect x="210" y="110" width="140" height="190" rx="14" fill="#1a1450" opacity=".8" stroke="#fff" stroke-opacity=".25" stroke-width="2"/><path d="M280 110V300M210 205H350" stroke="#2a1740" stroke-width="5"/><path d="M30 400H190M30 470H190" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>`;
    for (let i = 0; i < 12; i++) b += `<circle cx="${20 + i * 32}" cy="${40 + (i % 2) * 14}" r="3.5" fill="#ffd98a" opacity=".9"/>`;
  } else {
    d += '</defs>';
    b += '<rect width="390" height="844" fill="#151515"/>';
  }
  return `<svg class="scene-svg" width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${d}${b}</svg>`;
}
