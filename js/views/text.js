// Reading settings, Kindle-style: one panel with five tabs (Font, Layout, Page, Colours, Help).
// Size 1–14, boldness 0–5 and line spacing 1–5 move one exact step per tap; fonts are grouped like an
// e-reader's list; pages come in colours and paper textures. The chat's ⋯ › Text opens it as a sheet
// over the chat (the story stays in view above it), and Depot › Reading text shows it as a page with
// a preview.
import { S, saveSettings } from '../store.js';
import { MARK_STYLES, MARK_COLOURS, PAGES, FONTS, DIALOGUE, NARRATION, BUBBLES, MY_BUBBLES, LAYOUTS, WIDTHS, TRACKS, PARAS, SIDES, TEXTURES, SIZE_STEPS, DEFAULT_TEXT, textPrefs, applyText } from '../textstyle.js';
import { esc, formatMessage } from '../util.js';
import { topbar, icon, openSheet } from '../ui.js';
import { dimSheet, dimSummary } from '../dim.js';

const SAMPLE_SCENE = '*The first corpse coughs when Lumi Quill opens its chest.* “Remember what it looks like.” *She holds the vial out to you.*';
const SAMPLE_BUBBLE = '*looks up from the counter* “Oh! You came back. Same window seat?”\n\n*slides a menu across before you can answer* “The soup is still warm, if you want it.”';

async function setPref(k, v) {
  S.settings.text = { ...textPrefs(), [k]: v };
  applyText();
  await saveSettings();
}

// ---------- controls ----------
const RANGES = { size: [1, 14, 'Text size'], bold: [0, 5, 'Boldness'], lh: [1, 5, 'Line spacing'], str: [0, 5, 'Texture strength'] };
const spoken = (k, v) => (k === 'size' ? `${v}, ${SIZE_STEPS[v - 1]} pixels` : String(v));
// A slider with tick marks, and − / + for exact single steps.
function range(t, k, ends = ['−', '+'], marks = null) {
  const [a, b, label] = RANGES[k];
  const v = t[k];
  const pct = ((v - a) / (b - a)) * 100;
  return `<div class="kr-lbl"><span>${label}</span><b class="num" aria-hidden="true">${v}</b></div>
    <div class="kr-rng"><button type="button" class="kr-end press" data-step="${k}:-1" aria-label="${label}: less" ${v <= a ? 'disabled' : ''}>${ends[0]}</button>
      <span class="kr-track"><span class="kr-rail"><span class="kr-fill" style="width:${pct}%"></span></span><span class="kr-ticks" aria-hidden="true">${Array.from({ length: b - a + 1 }, () => '<i></i>').join('')}</span><input type="range" min="${a}" max="${b}" step="1" value="${v}" data-rng="${k}" aria-label="${label}" aria-valuetext="${spoken(k, v)}"></span>
      <button type="button" class="kr-end press" data-step="${k}:1" aria-label="${label}: more" ${v >= b ? 'disabled' : ''}>${ends[1]}</button></div>
    ${marks ? `<div class="kr-nums" aria-hidden="true">${marks.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}`;
}
const lbl = (t, sub = '') => `<p class="kr-h">${t}${sub ? `<span>${sub}</span>` : ''}</p>`;
const seg = (key, label, opts, cur, pic) =>
  `<div class="kr-seg" style="--n:${opts.length}" role="radiogroup" aria-label="${label}">${opts.map(([v, l]) => `<button type="button" class="press" role="radio" aria-checked="${cur === v}" data-set="${key}:${v}">${pic ? pic(v) : ''}<span>${l}</span></button>`).join('')}</div>`;
const tog = (key, title, sub, on) => `<button type="button" class="kr-tog press" role="switch" aria-checked="${!!on}" data-tog="${key}"><span>${title}<small>${sub}</small></span><i aria-hidden="true"></i></button>`;
const linesPic = (gap) => `<svg class="kr-ic" viewBox="0 0 26 18" aria-hidden="true">${[0, 1, 2].map((i) => `<rect x="2" y="${2 + i * gap}" width="22" height="2" rx="1"/>`).join('')}</svg>`;
const sidePic = (v) => {
  const k = { normal: 0, roomy: 1, wide: 2 }[v];
  return `<svg class="kr-ic" viewBox="0 0 26 18" aria-hidden="true"><rect x="0" y="1" width="1.5" height="16"/><rect x="24.5" y="1" width="1.5" height="16"/>${[0, 1, 2].map((i) => `<rect x="${[3, 5, 8][k]}" y="${3 + i * 5}" width="${[20, 16, 10][k]}" height="2" rx="1"/>`).join('')}</svg>`;
};
const alignPic = (v) => `<svg class="kr-ic" viewBox="0 0 26 18" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<rect x="${v === 'right' ? 24 - [22, 16, 20, 12][i] : 2}" y="${2 + i * 4.2}" width="${v === 'justify' ? (i === 3 ? 14 : 22) : [22, 16, 20, 12][i]}" height="2" rx="1"/>`).join('')}</svg>`;
const swatchRow = (key, label, list, cur, colourOf) =>
  `<div class="kr-sw" role="radiogroup" aria-label="${label}">${Object.entries(list)
    .map(([k, c]) => `<button type="button" class="press${k === 'line' || c.bg === 'line' ? ' line' : ''}" role="radio" aria-checked="${cur === k}" data-set="${key}:${k}"><i aria-hidden="true" style="--c:${colourOf(c)}"></i>${esc(c.label)}</button>`)
    .join('')}</div>`;

// ---------- the five tabs ----------
const TABS = [
  ['font', 'Font'],
  ['layout', 'Layout'],
  ['page', 'Page'],
  ['colours', 'Colours'],
  ['help', 'Help'],
];
function fontTab(t) {
  const groups = [...new Set(Object.values(FONTS).map((f) => f.g))];
  return (
    range(t, 'size', ['<span style="font-size:13px">A</span>', '<span style="font-size:21px">A</span>'], [1, 7, 14]) +
    range(t, 'bold', ['−', '+'], [0, 5]) +
    lbl('Font', esc(FONTS[t.font]?.short || FONTS[t.font]?.name || '')) +
    groups
      .map(
        (g) =>
          `<p class="kr-g">${g}</p><div class="kr-fonts" role="radiogroup" aria-label="${g}">${Object.entries(FONTS)
            .filter(([, f]) => f.g === g)
            .map(([k, f]) => `<button type="button" class="press" role="radio" aria-checked="${t.font === k}" data-set="font:${k}" style="font-family:${esc(f.css)}">${esc(f.short || f.name)}<small>${esc(f.note)}</small></button>`)
            .join('')}</div>`
      )
      .join('')
  );
}
function layoutTab(t) {
  return (
    lbl('Chat layout', 'one-on-one chats; group chats are always Story') +
    seg('layout', 'Chat layout', Object.entries(LAYOUTS).map(([k, l]) => [k, l.label]), t.layout) +
    range(t, 'lh', ['−', '+'], [1, 3, 5]) +
    lbl('Paragraph spacing') +
    seg('para', 'Paragraph spacing', Object.entries(PARAS).map(([k, p]) => [k, p.label]), t.para, (v) => linesPic({ tight: 4, normal: 5.5, wide: 7 }[v])) +
    lbl('Margins') +
    seg('side', 'Margins', [['normal', 'Narrow'], ['roomy', 'Normal'], ['wide', 'Wide']], t.side, sidePic) +
    lbl('Text width', 'character and narrator') +
    seg('width', 'Text width', Object.entries(WIDTHS).map(([k, w]) => [k, w.label]), t.width) +
    lbl('Alignment') +
    seg('align', 'Alignment', [['left', 'Left'], ['justify', 'Justified']], t.align === 'right' ? 'left' : t.align, alignPic) +
    lbl('Letter spacing') +
    seg('track', 'Letter spacing', Object.entries(TRACKS).map(([k, x]) => [k, x.label]), t.track)
  );
}
function pageTab(t) {
  const cur = PAGES[t.page] ? t.page : 'original';
  return (
    lbl('Page colour', esc(PAGES[cur].label)) +
    `<div class="kr-pages" role="radiogroup" aria-label="Page colour">${Object.entries(PAGES)
      .map(([k, p]) => `<button type="button" class="press" role="radio" aria-checked="${cur === k}" data-set="page:${k}"><i aria-hidden="true" style="--c:${p.pg}"></i>${esc(p.label)}</button>`)
      .join('')}</div><p class="kr-note" aria-live="polite">${esc(PAGES[cur].note)}</p>` +
    lbl('Paper texture', esc(TEXTURES[t.tex].note)) +
    `<div class="kr-tex" role="radiogroup" aria-label="Paper texture">${Object.entries(TEXTURES)
      .map(([k, x]) => `<button type="button" class="press" role="radio" aria-checked="${t.tex === k}" data-set="tex:${k}"><span class="kr-texsw" data-sw="${k}" aria-hidden="true" style="--c:${PAGES[cur].pg}"></span>${esc(x.label)}</button>`)
      .join('')}</div>` +
    (t.tex !== 'none' ? range(t, 'str', ['−', '+'], [0, 5]) : '')
  );
}
function coloursTab(t) {
  return (
    lbl('Speech colour') +
    swatchRow('dialogue', 'Speech colour', DIALOGUE, t.dialogue, (c) => c.dark) +
    lbl('Narration colour', 'on dark pages') +
    swatchRow('narration', 'Narration colour', NARRATION, t.narration, (c) => c.dark) +
    lbl('Narration') +
    tog('upright', 'Upright narration', 'Normal letters instead of italics; its colour still tells it apart', t.upright) +
    lbl('Character’s bubble', 'Bubbles layout') +
    swatchRow('bubble', 'Character’s bubble', BUBBLES, t.bubble, (c) => c.bg) +
    lbl('Your bubble') +
    swatchRow('me', 'Your bubble', MY_BUBBLES, t.me, (c) => c.bg)
  );
}
function helpTab(t) {
  return (
    tog('choices', 'Choices as cards', 'Numbered options at the end of a reply become cards. Tap one to pick it, then Send.', t.choices) +
    tog('names', 'Names in colour', 'The first time a character is named in a paragraph, the name wears their line colour.', t.names) +
    tog('marker', 'Place marker', 'Tap a paragraph of a reply to mark your place. Long-press it to clear it.', t.marker) +
    (t.marker
      ? tog('autoMark', 'Mark where I stop', 'When you leave a chat after reading, the paragraph you were on gets the marker.', t.autoMark) +
        lbl('Marker looks', 'any mix') +
        Object.entries(MARK_STYLES)
          .map(([k, st]) => {
            const m = t.mk[k];
            return `<div class="kr-mk">${tog('mk:' + k, st.label, st.note, m.on)}${
              m.on
                ? `<div class="kr-mk-set"><div class="kr-mk-cols" role="radiogroup" aria-label="${st.label} colour">${Object.entries(MARK_COLOURS)
                    .map(([ck, c]) => `<button type="button" class="press${c.c === 'line' ? ' line' : ''}" role="radio" aria-checked="${m.c === ck}" aria-label="${esc(c.label)}" data-mkc="${k}:${ck}"><i style="--c:${c.c}"></i></button>`)
                    .join('')}</div><div class="kr-mk-k"><span>Strength</span><button type="button" class="press" data-mkk="${k}:-1" aria-label="${st.label}: fainter" ${m.k <= 1 ? 'disabled' : ''}>−</button><b class="num" aria-live="polite">${m.k}</b><button type="button" class="press" data-mkk="${k}:1" aria-label="${st.label}: stronger" ${m.k >= 5 ? 'disabled' : ''}>+</button></div></div>`
                : ''
            }</div>`;
          })
          .join('') +
        `<p class="kr-mk-prev"><span class="para here" aria-current="location"><i class="mk-rib" aria-hidden="true"></i>The marked paragraph looks like this, so you can find your place again.</span></p>`
      : '') +
    `<button type="button" class="kr-link press" data-dim>${icon('eye', 18)}<span>Dim mode<small>${esc(dimSummary())}</small></span>${icon('chev', 16)}</button>
    <button type="button" class="kr-reset press" data-reset>${icon('restart', 16)}Reset to Signboard</button>`
  );
}
const BODY = { font: fontTab, layout: layoutTab, page: pageTab, colours: coloursTab, help: helpTab };

let lastTab = 'font';
const panelHTML = (tab) =>
  `<div class="kr-tabs" role="tablist" aria-label="Reading settings">${TABS.map(([k, l]) => `<button type="button" class="press" role="tab" id="krt-${k}" aria-selected="${tab === k}" aria-controls="krBody" data-tab="${k}">${l}</button>`).join('')}</div>
  <div class="kr-body" id="krBody" role="tabpanel" aria-labelledby="krt-${tab}" tabindex="-1">${BODY[tab](textPrefs())}</div>`;

// Wire a panel inside `box`. after(key) runs after every change (the page refreshes its preview).
function bindPanel(box, after = () => {}) {
  let tab = lastTab;
  const body = () => box.querySelector('.kr-body');
  // Texture swatches carry data URLs, so they're painted from here rather than in the markup.
  const paintSwatches = () =>
    box.querySelectorAll('[data-sw]').forEach((el) => {
      const x = TEXTURES[el.dataset.sw];
      if (!x.svg) return;
      el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><g opacity='.7'>${x.svg()}</g></svg>`)}")`;
      el.style.backgroundSize = `${x.size || 256}px`;
    });
  const redraw = (focusSel) => {
    const y = body().scrollTop;
    body().innerHTML = BODY[tab](textPrefs());
    body().scrollTop = y;
    paintSwatches();
    if (focusSel) body().querySelector(focusSel)?.focus();
  };
  paintSwatches();
  const change = async (k, v, focusSel) => {
    await setPref(k, v);
    redraw();
    // Focus goes back to the control just used (or the slider, if a stepper hit its end).
    (body().querySelector(focusSel || '#none') || body().querySelector(`[data-rng="${k}"]`) || body())?.focus();
    after(k);
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !box.contains(b)) return;
    const d = b.dataset;
    if (d.tab) {
      tab = lastTab = d.tab;
      box.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
      body().setAttribute('aria-labelledby', b.id);
      body().innerHTML = BODY[tab](textPrefs());
      body().scrollTop = 0;
      return paintSwatches();
    }
    if (d.set) {
      const [k, v] = d.set.split(/:(.*)/);
      return change(k, v, `[data-set="${CSS.escape(d.set)}"]`);
    }
    if (d.step) {
      const [k, n] = d.step.split(':');
      const [a, z] = RANGES[k];
      const v = Math.max(a, Math.min(z, textPrefs()[k] + +n));
      return change(k, v, `[data-step="${d.step}"]:not(:disabled)`);
    }
    if (d.tog?.startsWith('mk:')) {
      const k = d.tog.slice(3);
      const mk = textPrefs().mk;
      return change('mk', { ...mk, [k]: { ...mk[k], on: !mk[k].on } }, `[data-tog="${d.tog}"]`);
    }
    if (d.mkc) {
      const [k, c] = d.mkc.split(':');
      const mk = textPrefs().mk;
      return change('mk', { ...mk, [k]: { ...mk[k], c } }, `[data-mkc="${d.mkc}"]`);
    }
    if (d.mkk) {
      const [k, n] = d.mkk.split(':');
      const mk = textPrefs().mk;
      return change('mk', { ...mk, [k]: { ...mk[k], k: Math.max(1, Math.min(5, mk[k].k + +n)) } }, `[data-mkk="${d.mkk}"]:not(:disabled)`);
    }
    if (d.tog) return change(d.tog, !textPrefs()[d.tog], `[data-tog="${d.tog}"]`);
    if (d.dim != null) return dimSheet({ onChange: () => (redraw(), setTimeout(() => body().querySelector('[data-dim]')?.focus(), 350)) });
    if (d.reset != null) {
      S.settings.text = { ...DEFAULT_TEXT };
      applyText();
      await saveSettings();
      redraw();
      body().querySelector('[data-reset]')?.focus();
      after('reset');
    }
  });
  // Dragging the slider updates the text live; the panel redraws when you let go.
  box.addEventListener('input', (e) => {
    const r = e.target.closest('[data-rng]');
    if (!r) return;
    S.settings.text = { ...textPrefs(), [r.dataset.rng]: +r.value };
    // Texture strength redraws its paper only when you let go; the rest follows the finger.
    if (r.dataset.rng !== 'str') applyText();
    r.closest('.kr-track').querySelector('.kr-fill').style.width = ((r.value - r.min) / (r.max - r.min)) * 100 + '%';
    r.setAttribute('aria-valuetext', spoken(r.dataset.rng, +r.value));
    const big = r.closest('.kr-rng').previousElementSibling.querySelector('b');
    if (big) big.textContent = r.value;
  });
  // Tabs: left and right arrows move between them.
  box.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const all = [...box.querySelectorAll('[data-tab]')];
    const next = all[(all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
    next.focus();
    next.click();
  });
  box.addEventListener('change', (e) => {
    const r = e.target.closest('[data-rng]');
    if (r) change(r.dataset.rng, +r.value, `[data-rng="${r.dataset.rng}"]`);
  });
}

// ---------- Depot › Reading text ----------
export function textView() {
  const t = textPrefs();
  const html = `<div class="screen no-tab kr-screen">
    ${topbar({ back: '#/settings', title: 'Reading text' })}
    <div class="tx-prev" aria-label="Preview" data-layout="${t.layout}">
      <p class="tx-cap tx-cap-scene"><span class="cap-all">All chats</span><span class="cap-group">Group chats</span></p>
      <div class="tx-prev-scene scn"><p class="scn-narr">${formatMessage(SAMPLE_SCENE)}</p>
        <div class="scn-b" style="--c:#B8ACFE;--ink:#0A0A0A"><span class="scn-tag">Lumi</span><div class="scn-t">${formatMessage('“They’ll search me first. Hide this.”')}</div></div></div>
      <p class="tx-cap tx-cap-bubble">One-on-one chats</p>
      <div class="msg ai tx-prev-bubble" style="--accent:#2EAA67"><div class="bubble">${formatMessage(SAMPLE_BUBBLE)}</div></div>
      <div class="msg user tx-prev-me"><div class="bubble">${formatMessage('*sits down* “Same seat, please.”')}</div></div>
    </div>
    <div class="kr-panel kr-page">${panelHTML(lastTab)}</div>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      bindPanel(root.querySelector('.kr-panel'), () => (root.querySelector('.tx-prev').dataset.layout = textPrefs().layout));
    },
  };
}

// ---------- the chat's ⋯ › Text: the same panel as a sheet over the chat ----------
export function textSheet() {
  const chatLayout = textPrefs().layout;
  openSheet({
    label: 'Reading settings',
    // A value mid-drag when the sheet closes is kept.
    onClose: () => saveSettings(),
    html: `<div class="kr-panel kr-in-sheet">${panelHTML(lastTab)}</div><a class="kr-more press" href="#/text" data-close>${icon('sliders', 16)}Open as a page, with a preview</a>`,
    onMount(s, close) {
      // A clear backdrop: the story above stays readable, so every change shows on it as you make it.
      s.closest('.ov')?.classList.add('kr-ov');
      // Switching layout redraws the chat underneath.
      bindPanel(s.querySelector('.kr-panel'), (k) => {
        if ((k === 'layout' || k === 'reset') && location.hash.startsWith('#/chat/') && textPrefs().layout !== chatLayout) close(), dispatchEvent(new HashChangeEvent('hashchange'));
      });
      s.querySelector('[data-close]').addEventListener('click', () => close());
    },
  });
}
