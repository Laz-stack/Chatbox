// Depot › Reading text: size, font and colours for chat messages, with live previews of both layouts.
import { S, saveSettings } from '../store.js';
import { PAGES, SIZES, FONTS, WEIGHTS, DIALOGUE, NARRATION, BUBBLES, MY_BUBBLES, LAYOUTS, WIDTHS, ALIGNS, TRACKS, PARAS, SIDES, DEFAULT_TEXT, textPrefs, applyText } from '../textstyle.js';
import { esc, formatMessage } from '../util.js';
import { topbar, title2, icon, openSheet, toggleRow, bindSwitch } from '../ui.js';

const SAMPLE_SCENE = '*The first corpse coughs when Lumi Quill opens its chest.* “Remember what it looks like.” *She holds the vial out to you.*';
const SAMPLE_BUBBLE = '*looks up from the counter* “Oh! You came back. Same window seat?”\n\n*slides a menu across before you can answer* “The soup is still warm, if you want it.”';

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

// Page colour: a chip of each page with "Aa" in its text colour, and a line about the chosen one.
const pages = (t) => {
  const cur = PAGES[t.page] ? t.page : 'original';
  return `<p class="tx-lbl">Page colour <span>behind the story</span></p><div class="tx-page" role="radiogroup" aria-label="Page colour">${Object.entries(PAGES)
    .map(([k, p]) => `<button type="button" class="press" role="radio" aria-checked="${cur === k}" data-page="${k}"><i aria-hidden="true" style="--c:${p.pg};--t:${p.body || '#ECECEC'}">Aa</i>${esc(p.label)}</button>`)
    .join('')}</div><p class="tx-page-note" aria-live="polite">${esc(PAGES[cur].note)}</p>`;
};

// Bubble colours: each swatch is a small bubble in that colour, with an "Aa" in its text colour.
const bubbles = (name, list, cur, label) =>
  `<div class="tx-bub" role="radiogroup" aria-label="${label}">${Object.entries(list)
    .map(([k, c]) => `<button type="button" class="press${c.bg === 'line' ? ' line' : ''}${c.dark ? ' dark' : ''}" role="radio" aria-checked="${cur === k}" data-${name}="${k}" aria-label="${esc(c.label)}" title="${esc(c.label)}"${c.bg === 'line' ? '' : ` style="--b:${c.bg}"`}><i aria-hidden="true">Aa</i><span>${esc(c.label)}</span></button>`)
    .join('')}</div>`;
const bubbleRows = (t) =>
  `<p class="tx-lbl">Character’s bubble <span>Bubbles layout</span></p>${bubbles('bubble', BUBBLES, t.bubble, 'Character’s bubble colour')}
    <p class="tx-lbl">Your bubble</p>${bubbles('me', MY_BUBBLES, t.me, 'Your bubble colour')}`;

// Three-option rows for the character's text, each with a small drawn picture of the choice.
const PICS = {
  width: (k) => `<span class="tx-pic w ${k}" aria-hidden="true"><i></i><i></i><i></i></span>`,
  align: (k) => `<span class="tx-pic a ${k}" aria-hidden="true"><i></i><i></i><i></i></span>`,
  track: (k) => `<span class="tx-pic t" aria-hidden="true" style="letter-spacing:${{ tight: '-0.07em', normal: '0', wide: '0.22em' }[k]}">Aa</span>`,
  weight: (k) => `<span class="tx-pic t" aria-hidden="true" style="font-weight:${WEIGHTS[k].b + 100}">Aa</span>`,
  para: (k) => `<span class="tx-pic p ${k}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`,
  side: (k) => `<span class="tx-pic s ${k}" aria-hidden="true"><i></i><i></i><i></i></span>`,
};
const seg = (name, label, list, cur) =>
  `<div class="tx-seg" role="radiogroup" aria-label="${label}">${Object.entries(list)
    .map(([k, o]) => `<button type="button" class="press" role="radio" aria-checked="${cur === k}" data-${name}="${k}">${PICS[name](k)}<b>${o.label}</b></button>`)
    .join('')}</div>`;
const shapeRows = (t, all = true) =>
  `<p class="tx-lbl">Weight <span>character and narrator only</span></p>${seg('weight', 'Text weight', WEIGHTS, t.weight)}
    <p class="tx-lbl">Width <span>character and narrator only</span></p>${seg('width', 'Text width', WIDTHS, t.width)}
    <p class="tx-lbl">Alignment <span>character and narrator only</span></p>${seg('align', 'Text alignment', ALIGNS, t.align)}` +
  (all ? `<p class="tx-lbl">Letter spacing <span>character and narrator only</span></p>${seg('track', 'Letter spacing', TRACKS, t.track)}
    <p class="tx-lbl">Paragraph spacing <span>character and narrator only</span></p>${seg('para', 'Paragraph spacing', PARAS, t.para)}` : '');

// Mark the chosen option in a group (the page and the quick sheet both use this).
function bindPrefs(root, after = () => {}) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-page],[data-size],[data-font],[data-dialogue],[data-narration],[data-bubble],[data-me],[data-weight],[data-layout],[data-width],[data-align],[data-track],[data-para],[data-side]');
    if (!b) return;
    const k = ['page', 'size', 'font', 'dialogue', 'narration', 'bubble', 'me', 'weight', 'layout', 'width', 'align', 'track', 'para', 'side'].find((x) => b.dataset[x] != null);
    await setPref(k, b.dataset[k]);
    b.parentElement.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', x === b));
    if (k === 'page') b.parentElement.nextElementSibling.textContent = PAGES[b.dataset.page]?.note || '';
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
      <div class="msg user tx-prev-me"><div class="bubble">${formatMessage('*sits down* “Same seat, please.”')}</div></div>
    </div>
    <p class="tx-lbl">Chat layout <span>one-on-one chats; group chats are always Story</span></p>${layoutRow(t)}
    <p class="tx-lbl">Size</p>${sizeRow(t)}
    ${pages(t)}
    <p class="tx-lbl">Font</p>${fontGrid(t)}
    ${shapeRows(t)}
    ${bubbleRows(t)}
    <p class="tx-lbl">Side margins <span>space at the left and right of the chat</span></p>${seg('side', 'Side margins', SIDES, t.side)}
    <h2 class="sec tx-sec">Help with reading</h2>
    <div class="group tx-help">${toggleRow('txChoices', 'Choices as cards', 'Numbered options at the end of a reply become cards. Tap one to pick it, then Send.', t.choices)}${toggleRow('txNames', 'Names in colour', 'The first time a character is named in a paragraph, the name wears their line colour.', t.names)}${toggleRow('txMarker', 'Place marker', 'Tap a paragraph of a reply to mark your place. Tap it again to clear it.', t.marker)}</div>
    <p class="tx-lbl">Speech colour</p>${swatches('dialogue', DIALOGUE, t.dialogue)}
    <p class="tx-lbl">Narration colour <span>on black; cream bubbles keep dark text</span></p>${swatches('narration', NARRATION, t.narration)}
    <button type="button" class="tx-reset press" id="txReset">${icon('restart', 16)}Reset to Signboard</button>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      bindPrefs(root.querySelector('.screen') || root, () => (root.querySelector('.tx-prev').dataset.layout = textPrefs().layout));
      for (const [id, k] of [['txChoices', 'choices'], ['txNames', 'names'], ['txMarker', 'marker']]) bindSwitch(root.querySelector('#' + id), (on) => setPref(k, on));
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
    html: `<h2 class="sheet-title">Text</h2>${pages(t).replace('class="tx-lbl"', 'class="tx-lbl" style="margin-top:0"')}<p class="tx-lbl">Chat layout</p>${layoutRow(t)}<p class="tx-lbl">Size</p>${sizeRow(t)}<p class="tx-lbl">Font</p>${fontGrid(t)}${bubbleRows(t)}<p class="tx-lbl">Speech colour</p>${swatches('dialogue', DIALOGUE, t.dialogue)}${shapeRows(t, false)}
      <a class="dashed press" href="#/text" data-close style="margin-top:14px">${icon('sliders', 20)}More text options</a>`,
    onMount(s, close) {
      // Switching layout redraws the chat underneath.
      bindPrefs(s, () => location.hash.startsWith('#/chat/') && s.querySelector('[data-layout][aria-checked="true"]')?.dataset.layout !== chatLayout && (close(), dispatchEvent(new HashChangeEvent('hashchange'))));
      const chatLayout = textPrefs().layout;
      s.querySelector('[data-close]').addEventListener('click', () => close());
    },
  });
}
