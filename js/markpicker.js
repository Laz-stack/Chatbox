// The composer's mark button: tap wraps your text in the mark (*action*, "speech", 'thought');
// hold it and three stops rise on a short line above it to pick another. The pick is remembered.
import { S, saveSettings } from './store.js';
import { icon } from './ui.js';
import { esc, reducedMotion } from './util.js';

export const MARKS = [
  { k: '*', label: 'Action' },
  { k: '"', label: 'Speech' },
  { k: "'", label: 'Thought' },
];
export const markNow = () => MARKS.find((m) => m.k === S.settings.mark) || MARKS[0];
export const markGlyph = (m) => (m.k === '*' ? icon('asterisk') : `<span class="mk-g" aria-hidden="true">${esc(m.k)}</span>`);
const labelFor = (m) => `${m.label} mark: tap to wrap your text in ${m.k}${m.k}. Hold to change`;

const HOLD = 380; // ms before the stops open
const FIRST = 58; // the first stop's centre above the button's centre
const STEP = 52; // between stops

// btn: the composer button. onTap(mark) wraps the text. color: the line colour for the rail.
export function bindMarkButton(btn, { onTap, color = () => '#ECECEC' }) {
  const paint = () => {
    const m = markNow();
    btn.innerHTML = markGlyph(m);
    btn.setAttribute('aria-label', labelFor(m));
    btn.dataset.mark = m.k;
  };
  paint();
  let timer = null;
  let pop = null; // { el, stops, hot, close }
  let downAt = null;

  function open(fromKeyboard = false) {
    if (pop) return;
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const cur = MARKS.indexOf(markNow());
    const el = document.createElement('div');
    el.className = 'mkp' + (reducedMotion() ? ' still' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Choose a mark');
    el.style.setProperty('--rail', color());
    el.innerHTML =
      `<div class="mkp-scrim"></div><i class="mkp-rail" style="left:${cx - 2}px;top:${cy - FIRST - STEP * 2}px;height:${FIRST + STEP * 2 - r.height / 2}px"></i>` +
      MARKS.map(
        (m, i) =>
          `<button type="button" class="mkp-o${i === cur ? ' cur' : ''}" role="menuitemradio" aria-checked="${i === cur}" data-i="${i}" style="left:${cx - 23}px;top:${cy - FIRST - STEP * i - 23}px;--d:${i * 30}ms">${markGlyph(m)}<small>${m.label}</small></button>`
      ).join('');
    document.body.appendChild(el);
    const stops = [...el.querySelectorAll('.mkp-o')];
    navigator.vibrate?.(12);
    requestAnimationFrame(() => el.classList.add('on'));
    const close = () => {
      if (!pop) return;
      const p = pop;
      pop = null;
      p.el.classList.remove('on');
      p.el.classList.add('off');
      setTimeout(() => p.el.remove(), reducedMotion() ? 0 : 160);
      btn.classList.remove('held');
      removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') return e.preventDefault(), close(), btn.focus();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const i = stops.indexOf(document.activeElement);
        const n = Math.max(0, Math.min(2, (i < 0 ? cur : i) + (e.key === 'ArrowUp' ? 1 : -1)));
        stops[n].focus();
        setHot(n);
      }
    };
    addEventListener('keydown', onKey, true);
    el.querySelector('.mkp-scrim').addEventListener('click', () => close());
    el.addEventListener('click', (e) => {
      const o = e.target.closest('.mkp-o');
      if (o) pick(+o.dataset.i);
    });
    pop = { el, stops, hot: -1, close, cy };
    if (fromKeyboard) setTimeout(() => stops[cur].focus(), 30);
  }
  function setHot(i) {
    if (!pop) return;
    pop.hot = i;
    pop.stops.forEach((s, k) => s.classList.toggle('hot', k === i));
  }
  function pick(i) {
    S.settings.mark = MARKS[i].k;
    saveSettings();
    paint();
    pop?.close();
    btn.focus({ preventScroll: true });
  }
  // The stop nearest the finger, once it has moved up past the button; none on the button itself.
  function nearest(y) {
    const dy = pop.cy - y;
    if (dy < 26) return -1;
    return Math.max(0, Math.min(2, Math.round((dy - FIRST) / STEP)));
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    downAt = Date.now();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('held');
    timer = setTimeout(() => open(), HOLD);
  });
  btn.addEventListener('pointermove', (e) => {
    if (pop) setHot(nearest(e.clientY));
  });
  const end = (e, cancel = false) => {
    clearTimeout(timer);
    if (downAt == null) return;
    downAt = null;
    if (pop) {
      // Let go on a stop: pick it. On the button: the stops stay open to tap.
      if (pop.hot >= 0 && !cancel) pick(pop.hot);
      else btn.classList.remove('held');
      return;
    }
    btn.classList.remove('held');
    if (!cancel) onTap(markNow());
  };
  btn.addEventListener('pointerup', (e) => end(e));
  btn.addEventListener('pointercancel', (e) => end(e, true));
  // Long-press menus and right-click open the stops; the keyboard: Arrow Up, or Enter/Space to wrap.
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    open();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') e.preventDefault(), open(true);
    else if (e.key === 'Enter' || e.key === ' ') e.preventDefault(), onTap(markNow());
  });
  return { close: () => pop?.close() };
}
