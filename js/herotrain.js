// The Platform hero's railway: a metro line across the top of the Continue card with a bullet train
// waiting at its left end. Tap the card and the line lights, the train runs the line, bends through the
// corners and goes into the tunnel behind the picture tile; the chat opens from there.
// The train is OpenMoji's "high-speed train" by the OpenMoji contributors (openmoji.org), CC BY-SA 4.0,
// recoloured to cream and ink, with two coaches made from its body (this adaptation: icons/train/LICENSE.txt).
// It is drawn as one strip cut into thin slices, each following the line, so it bends without splitting;
// each slice's moves are worked out up front and run as transform animations (off the main thread).
import { reducedMotion } from './util.js';

const ART = `<path fill="#ECECEC" d="m68 48l-61.78-.503l-1.131-3.958l31.76-21.02l31.15-.578z"/><path fill="#9b9b9a" d="M68 48v5.5H12.65a1.004 1.004 0 0 1-.503-1.873L18.41 48z"/><path fill="#3f3f3f" d="M68 36.5H41.84a1.286 1.286 0 0 1-.69-2.37l7.259-4.62a12.86 12.86 0 0 1 6.903-2.01h12.68m-52.382 9h9.502a12.86 12.86 0 0 0 6.903-2.01l7.259-4.62a1.286 1.286 0 0 0-.69-2.37H29.11"/><path fill="#0A0A0A" d="M67.93 44H18.64a.571.571 0 0 1-.307-1.054l3.227-2.053A5.7 5.7 0 0 1 24.628 40h43.3"/><g fill="none" stroke="#0A0A0A" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2"><path d="M67 36.5H41.84a1.286 1.286 0 0 1-.69-2.37l7.259-4.62a12.86 12.86 0 0 1 6.903-2.01h11.68m-51.382 9h9.502a12.86 12.86 0 0 0 6.903-2.01l7.259-4.62a1.286 1.286 0 0 0-.69-2.37H29.11"/><path d="M67 48H8.27a3 3 0 0 1-1.664-5.496l24.95-16.63a23.4 23.4 0 0 1 12.97-3.926h22.48M67 53.5H12.65a1.004 1.004 0 0 1-.503-1.873L18.41 48"/><path d="M66.93 44H18.64a.571.571 0 0 1-.307-1.054l3.227-2.053A5.7 5.7 0 0 1 24.628 40h42.3"/></g>`;
const U = 64 / 72; // px per art unit
const Y0 = 19, YH = 38; // the train's band in the art
const LEN = 63 + 34 + 34 + 63; // tail nose, two coaches, lead nose
export const SW = LEN * U; // train length, px
export const SH = YH * U; // train height, px
const STEP = 3; // slice width, px
const coach = (x) => `<g transform="translate(${x} 0) scale(2 1) translate(-50 0)" clip-path="url(#cb)">${ART}</g><path d="M${x} 22v31" stroke="#0A0A0A" stroke-width="1.4"/>`;
const SPRITE = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${Y0} ${LEN} ${YH}" width="${SW.toFixed(1)}" height="${SH.toFixed(1)}"><defs><clipPath id="cb"><rect x="50" y="0" width="17" height="72"/></clipPath></defs><g transform="translate(-5 0)">${ART}</g>${coach(63)}${coach(97)}<g transform="translate(${LEN + 5} 0) scale(-1 1)">${ART}</g><path d="M131 22v31" stroke="#0A0A0A" stroke-width="1.4"/></svg>`).replace(/'/g, '%27');

// The line: a straight run in from off the card, two 45° bends of radius 90, then along the top into the tunnel.
const Y_LOW = 84, Y_TOP = 26;
const pathFor = (w) => `M -220 ${Y_LOW} H 10 A 90 90 0 0 0 73.6 ${Y_LOW - 26.4} L 78.9 ${Y_LOW - 31.7} A 90 90 0 0 1 142.5 ${Y_TOP} H ${w + 260}`;
const STOPS = [[8, Y_LOW], [44.4, Y_LOW - 6.9], [108.1, Y_TOP + 6.9], [196, Y_TOP]];
const HERE = [150, Y_TOP];
const BEND_END = 230 + 90 * Math.PI / 4 * 2 + 7.5; // path length up to the top straight
const REST = 262; // where the head waits: just round the first bend's start, the rest of the train off the card
export const RUN_MS = 800;

export const railHTML = () =>
  `<span class="hero-rail" aria-hidden="true"><svg class="hr-svg"><path class="hr-base"/><path class="hr-lit" pathLength="1"/>${STOPS.map(([x, y]) => `<circle class="hr-stop" cx="${x}" cy="${y}" r="6.5"/>`).join('')}<circle class="hr-here" cx="${HERE[0]}" cy="${HERE[1]}" r="11"/></svg><span class="hr-train"></span></span>`;

// Ease-in (a departure): slow away, then quicker.
const ease = (t) => t * t * (0.55 + 0.45 * t);

let ro = null;
export function mountRail(hero, { onDepart } = {}) {
  const rail = hero.querySelector('.hero-rail');
  if (!rail) return;
  const svg = rail.querySelector('.hr-svg');
  const train = rail.querySelector('.hr-train');
  const base = svg.querySelector('.hr-base');
  const lit = svg.querySelector('.hr-lit');
  let w = 0;
  let total = 0;
  let plan = null; // each slice's keyframes for the run, worked out while the screen is idle
  const n = Math.ceil(SW / STEP);
  train.style.setProperty('--spr', `url("${SPRITE}")`);
  train.innerHTML = Array.from({ length: n }, (_, i) => `<i style="background-position:${1.25 - i * STEP}px 0"></i>`).join('');
  const slices = [...train.children];
  const at = (d) => {
    const c = Math.max(0, Math.min(total, d));
    const p = base.getPointAtLength(c);
    const q = base.getPointAtLength(Math.min(total, c + 1));
    const r = base.getPointAtLength(Math.max(0, c - 1));
    return `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${Math.atan2(q.y - r.y, q.x - r.x).toFixed(4)}rad) translate(-50%, -50%)`;
  };
  // Each slice's centre sits this far behind the head.
  const behind = (i) => SW - i * STEP - STEP / 2;
  // The head runs to just past the tunnel (or the card's edge), so the last coach is out of sight.
  const end = () => BEND_END + (w - 40 - 142.5) + SW;
  const K = 20;
  const makePlan = () => {
    const e = end();
    plan = slices.map((_, i) => Array.from({ length: K + 1 }, (_, k) => ({ transform: at(REST + (e - REST) * ease(k / K) - behind(i)) })));
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  const layout = () => {
    w = hero.clientWidth;
    const d = pathFor(w);
    base.setAttribute('d', d);
    lit.setAttribute('d', d);
    total = base.getTotalLength();
    slices.forEach((s, i) => (s.style.transform = at(REST - behind(i))));
    plan = null;
    idle(() => !plan && hero.isConnected && makePlan());
  };
  layout();
  ro?.disconnect();
  ro = new ResizeObserver(() => {
    if (!hero.isConnected) return ro.disconnect();
    if (hero.clientWidth !== w && !hero.classList.contains('go')) layout();
  });
  ro.observe(hero);

  hero.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    if (hero.classList.contains('go')) return;
    hero.classList.add('go');
    const href = hero.getAttribute('href');
    // The chat opens from the tunnel (the picture tile), or from the card's top-right corner without one.
    const box = (hero.querySelector('.hero-av') || hero).getBoundingClientRect();
    const tile = !!hero.querySelector('.hero-av');
    const go = () => {
      onDepart?.(tile ? box.left + box.width / 2 : box.right - 24, tile ? box.top + box.height / 2 : box.top + 30);
      location.hash = href;
    };
    if (reducedMotion()) return setTimeout(go, 300);
    if (!plan) makePlan();
    const runs = slices.map((s, i) => s.animate(plan[i], { duration: RUN_MS, delay: 90, easing: 'linear', fill: 'forwards' }));
    // Open the chat once the whole train is in the tunnel.
    runs[0].finished.then(go, go);
  });
}
