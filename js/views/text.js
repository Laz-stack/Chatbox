// Depot › Reading text: size, font and colours for chat messages, with live previews of both layouts.
import { S, saveSettings } from '../store.js';
import { SIZES, FONTS, DIALOGUE, NARRATION, LAYOUTS, DEFAULT_TEXT, textPrefs, applyText } from '../textstyle.js';
import { esc, formatMessage } from '../util.js';
import { topbar, title2, icon, openSheet } from '../ui.js';

const SAMPLE_SCENE = '*The first corpse coughs when Lumi Quill opens its chest.* “Remember what it looks like.” *She holds the vial out to you.*';
const SAMPLE_BUBBLE = '*looks up from the counter* “Oh! You came back. Same window seat?”';

async function setPref(k, v) {
  S.settings.text = { ...textPrefs(), [k]: v };
  applyText();
  await saveSettings();
}

const layoutRow = (t) =>
  `<div class="tx-layout" role="radiogroup" aria-label="Chat layout">${Object.entries(LAYOUTS)
    .map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${t.layout === k}" data-layout="${k}"><span class="tx-lay-pic ${k}" aria-hidden="true"><i></i><i></i><i></i></span><b>${l.label}</b><small>${l.note}</small></button>`)
    .join('')}</div>`;
const sizeRow = (t) =>
  `<div class="tx-sizes" role="radiogroup" aria-label="Text size">${Object.entries(SIZES)
    .map(([k, s], i) => `<button type="button" class="press" role="radio" aria-checked="${t.size === k}" data-size="${k}" aria-label="${s.label}" style="font-size:${14 + i * 3}px">A</button>`)
    .join('')}</div>`;
const fontGrid = (t) =>
  `<div class="tx-fonts" role="radiogroup" aria-label="Font">${Object.entries(FONTS)
    .map(([k, f]) => `<button type="button" class="press" role="radio" aria-checked="${t.font === k}" data-font="${k}" style="font-family:${esc(f.css)}">Aa ${esc(f.short || f.name)}<small>${esc(f.note)}</small></button>`)
    .join('')}</div>`;
const swatches = (name, list, cur) =>
  `<div class="tx-sw" role="radiogroup" aria-label="${name} colour">${Object.entries(list)
    .map(([k, c]) => `<button type="button" class="press${k === 'line' ? ' line' : ''}" role="radio" aria-checked="${cur === k}" data-${name}="${k}" aria-label="${esc(c.label)}" title="${esc(c.label)}" style="--c:${c.dark}"><i></i><span>${esc(c.label)}</span></button>`)
    .join('')}</div>`;

// Mark the chosen option in a group (the page and the quick sheet both use this).
function bindPrefs(root, after = () => {}) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-size],[data-font],[data-dialogue],[data-narration],[data-layout]');
    if (!b) return;
    const k = ['size', 'font', 'dialogue', 'narration', 'layout'].find((x) => b.dataset[x] != null);
    await setPref(k, b.dataset[k]);
    b.parentElement.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', x === b));
    after();
  });
}

export function textView() {
  const t = textPrefs();
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/settings', title: 'Reading text' })}
    <div class="tx-prev" aria-label="Preview" data-layout="${t.layout}">
      <p class="tx-cap tx-cap-scene"><span class="cap-all">All chats</span><span class="cap-group">Group chats</span></p>
      <div class="tx-prev-scene scn"><p class="scn-narr">${formatMessage(SAMPLE_SCENE)}</p>
        <div class="scn-b" style="--c:#B8ACFE;--ink:#0A0A0A"><span class="scn-tag">Lumi</span><div class="scn-t">${formatMessage('“They’ll search me first. Hide this.”')}</div></div></div>
      <p class="tx-cap tx-cap-bubble">One-on-one chats</p>
      <div class="msg ai tx-prev-bubble" style="--accent:#2EAA67"><div class="bubble">${formatMessage(SAMPLE_BUBBLE)}</div></div>
    </div>
    <p class="tx-lbl">Chat layout <span>one-on-one chats; group chats are always Story</span></p>${layoutRow(t)}
    <p class="tx-lbl">Size</p>${sizeRow(t)}
    <p class="tx-lbl">Font</p>${fontGrid(t)}
    <p class="tx-lbl">Speech colour</p>${swatches('dialogue', DIALOGUE, t.dialogue)}
    <p class="tx-lbl">Narration colour <span>on black; cream bubbles keep dark text</span></p>${swatches('narration', NARRATION, t.narration)}
    <button type="button" class="tx-reset press" id="txReset">${icon('restart', 16)}Reset to Signboard</button>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      bindPrefs(root.querySelector('.screen') || root, () => (root.querySelector('.tx-prev').dataset.layout = textPrefs().layout));
      root.querySelector('#txReset').addEventListener('click', async () => {
        S.settings.text = { ...DEFAULT_TEXT };
        applyText();
        await saveSettings();
        dispatchEvent(new HashChangeEvent('hashchange'));
      });
    },
  };
}

// The quick sheet from a chat's ⋯ menu: size and font, with a link to the full page.
export function textSheet() {
  const t = textPrefs();
  openSheet({
    label: 'Text size',
    html: `<h2 class="sheet-title">Text</h2><p class="tx-lbl" style="margin-top:0">Chat layout</p>${layoutRow(t)}<p class="tx-lbl">Size</p>${sizeRow(t)}<p class="tx-lbl">Font</p>${fontGrid(t)}
      <a class="dashed press" href="#/text" data-close style="margin-top:14px">${icon('sliders', 20)}More text options</a>`,
    onMount(s, close) {
      // Switching layout redraws the chat underneath.
      bindPrefs(s, () => location.hash.startsWith('#/chat/') && s.querySelector('[data-layout][aria-checked="true"]')?.dataset.layout !== chatLayout && (close(), dispatchEvent(new HashChangeEvent('hashchange'))));
      const chatLayout = textPrefs().layout;
      s.querySelector('[data-close]').addEventListener('click', () => close());
    },
  });
}
