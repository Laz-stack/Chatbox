// In-world time: each chat can keep a story clock (day, time, weather). The chat header shows it
// ("D3 · 21:40"), the AI is told it, background tracking moves it along as the story goes, and
// skipping time from the sheet leaves a divider in the log ("Day 4 · 07:00 — next morning · clear").
import { esc } from './util.js';
import { icon, openSheet, toggleRow, bindSwitch } from './ui.js';

export const WEATHER = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', fog: 'Fog', storm: 'Storm' };
export const clockOn = (chat) => !!chat?.clock?.on;
const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export function partOfDay(min) {
  const h = Math.floor(min / 60);
  if (h < 5) return 'night';
  if (h < 8) return 'early morning';
  if (h < 12) return 'morning';
  if (h < 14) return 'midday';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  if (h < 23) return 'late evening';
  return 'night';
}
export const chipText = (c) => `D${c.day} · ${hhmm(c.min)}`;
export const longText = (c) => `Day ${c.day} · ${hhmm(c.min)}`;
const weatherWord = (c) => (WEATHER[c.weather] || 'Clear').toLowerCase();

export function newClock(min = 8 * 60) {
  return { on: true, day: 1, min, weather: 'clear', start: { day: 1, min }, skip: null };
}
// Move the clock by some minutes (never before Day 1, 00:00).
export function advance(c, minutes) {
  const total = Math.max(0, (c.day - 1) * 1440 + c.min + Math.round(minutes));
  c.day = Math.floor(total / 1440) + 1;
  c.min = total % 1440;
  return c;
}

// The prompt layer.
export function clockLayer(chat) {
  if (!clockOn(chat)) return '';
  const c = chat.clock;
  return `Story time: Day ${c.day}, ${hhmm(c.min)} (${partOfDay(c.min)}). Weather: ${weatherWord(c)}. Keep the scene consistent with the time of day and the weather; characters notice when it is late, early or dark.`;
}

// The log divider after a skip, and the note the AI gets with it.
export const skipLabel = (c, what) => `${longText(c)} — ${what} · ${weatherWord(c)}`;
// (The log sends stage directions in [brackets] itself.)
export const skipNote = (c, what) => `Time skip: it is now Day ${c.day}, ${hhmm(c.min)} (${partOfDay(c.min)}), ${what}. Weather: ${weatherWord(c)}. Pick up the story from this new moment.`;
// "+12 hours", "+1 day 3 hours"
export function jumpText(mins) {
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return '+' + [d && `${d} day${d === 1 ? '' : 's'}`, h && `${h} hour${h === 1 ? '' : 's'}`, !d && m && `${m} min`].filter(Boolean).join(' ');
}

// [key, label, minutes to jump, shown?]
const SKIPS = [
  ['hour', '+1 hour', () => 60, () => true],
  ['morning', 'Next morning', (c) => (c.min < 7 * 60 ? 7 * 60 - c.min : 1440 - c.min + 7 * 60), () => true],
  ['tonight', 'Tonight', (c) => 20 * 60 - c.min, (c) => c.min < 20 * 60],
  ['day', 'Next day', () => 1440, () => true],
];
const skipsFor = (c) => SKIPS.filter((x) => x[3](c));
const SKIP_WORDS = { hour: 'an hour later', morning: 'the next morning', tonight: 'that evening', day: 'the next day' };

// The Story time sheet. onChange(): the clock changed (redraw the chip). onSkip(label, note): add the divider.
export function clockSheet(chat, { onChange, onSkip, save }) {
  const c = chat.clock || { ...newClock(), on: false };
  const skips = () => skipsFor(c).map(([k, l]) => `<button type="button" class="press" data-skip="${k}">${l}</button>`).join('');
  const rows = () => {
    const s = c.start || { day: 1, min: 8 * 60 };
    return `<div class="ck-tt"><div><span>Now</span><span class="num">${longText(c)}</span></div><div><span>Started</span><span class="num">${longText(s)}</span></div><div><span>Last skip</span><span class="num">${c.skip ? esc(c.skip) : 'None yet'}</span></div></div>`;
  };
  const body = () =>
    c.on
      ? `<div class="ck-big"><button type="button" class="ck-digits press num" id="ckDigits" aria-label="Time ${hhmm(c.min)}. Change"><span>${hhmm(c.min)}</span>${icon('edit', 20)}</button><input type="time" id="ckTime" class="ck-pick" value="${hhmm(c.min)}" tabindex="-1" aria-hidden="true"><span id="ckPart">${partOfDay(c.min)} · ${weatherWord(c)}</span></div>
      <p class="tx-lbl">Day</p><div class="ck-step"><button type="button" class="press" data-day="-1" aria-label="Previous day" ${c.day <= 1 ? 'disabled' : ''}>−</button><b class="num" id="ckDay">Day ${c.day}</b><button type="button" class="press" data-day="1" aria-label="Next day">+</button></div>
      <div id="ckRows">${rows()}</div>
      <p class="tx-lbl">Skip to</p><div class="ck-chips" id="ckSkips">${skips()}</div>
      <p class="tx-lbl">Weather</p><div class="ck-chips" role="radiogroup" aria-label="Weather">${Object.entries(WEATHER).map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${c.weather === k}" data-w="${k}">${l}</button>`).join('')}</div>`
      : `<p class="sheet-p">Give this chat a clock: a day, a time and the weather. The story moves it along, and characters notice when it’s late.</p>`;
  openSheet({
    label: 'Story time',
    html: `<h2 class="sheet-title">Story time</h2><div id="ckBody">${body()}</div>
      <div class="ck-tog">${toggleRow('ckOn', 'Keep story time', 'In this chat only', c.on)}</div>
      <button type="button" class="btn-primary press ck-done" data-close><span>Done</span></button>`,
    onMount(s, close) {
      const $ = (q) => s.querySelector(q);
      const commit = async () => {
        if (c.on) chat.clock = c;
        await save();
        onChange();
      };
      const redraw = () => {
        $('#ckBody').innerHTML = body();
      };
      const refresh = () => {
        if (!c.on) return;
        $('#ckDay').textContent = `Day ${c.day}`;
        $('#ckPart').textContent = `${partOfDay(c.min)} · ${weatherWord(c)}`;
        $('#ckTime').value = hhmm(c.min);
        $('#ckDigits span').textContent = hhmm(c.min);
        $('#ckSkips').innerHTML = skips();
        $('#ckDigits').setAttribute('aria-label', `Time ${hhmm(c.min)}. Change`);
        $('#ckRows').innerHTML = rows();
        s.querySelector('[data-day="-1"]').disabled = c.day <= 1;
      };
      // Turning it off keeps the clock (and the log's dividers keep making sense); on again resumes it.
      bindSwitch($('#ckOn'), async (on) => {
        c.on = on;
        chat.clock = c;
        redraw();
        await commit();
      });
      $('#ckBody').addEventListener('change', async (e) => {
        if (e.target.id !== 'ckTime' || !e.target.value) return;
        const [h, m] = e.target.value.split(':').map(Number);
        c.min = h * 60 + m;
        refresh();
        await commit();
      });
      $('#ckBody').addEventListener('click', async (e) => {
        // The big digits open the phone's own time picker (always shown here as 24-hour).
        if (e.target.closest('#ckDigits')) {
          const inp = $('#ckTime');
          try {
            inp.showPicker();
          } catch {
            // No picker API: show the time field itself.
            inp.classList.remove('ck-pick');
            inp.removeAttribute('aria-hidden');
            inp.removeAttribute('tabindex');
            inp.focus();
          }
          return;
        }
        const d = e.target.closest('[data-day]');
        const k = e.target.closest('[data-skip]');
        const w = e.target.closest('[data-w]');
        if (d) {
          c.day = Math.max(1, c.day + Number(d.dataset.day));
          refresh();
          await commit();
        } else if (k) {
          const [key, , mins] = SKIPS.find((x) => x[0] === k.dataset.skip);
          const jump = mins(c);
          advance(c, jump);
          c.skip = jumpText(jump);
          refresh();
          await commit();
          onSkip(skipLabel(c, SKIP_WORDS[key]), skipNote(c, SKIP_WORDS[key]), { ...c });
        } else if (w) {
          c.weather = w.dataset.w;
          s.querySelectorAll('[data-w]').forEach((x) => x.setAttribute('aria-checked', x === w));
          refresh();
          await commit();
        }
      });
      $('[data-close]').addEventListener('click', () => close());
    },
  });
}
