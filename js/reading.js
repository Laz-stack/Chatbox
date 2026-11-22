// Reading helpers for replies (Reading text › Help with reading):
// - Choices as cards: a reply that ends with numbered options ("1. Do this. (Aftermath: …)") shows each
//   option as a card, the choice in bold and what happens after in smaller text. On the newest reply,
//   tap a card to pick it, then Send. Text whose options can't be read cleanly is left as it is.
// - Names in colour: the first time a cast member is named in a paragraph, the name wears their line
//   colour (lighter on dark grounds, darker on light bubbles).
// - Place marker: paragraphs are wrapped so one can be marked with a tap (see chat.js).
import { esc, formatMessage, shade, luminance } from './util.js';

// Contrast between two #rrggbb colours.
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const HEX = /^#[0-9a-f]{6}$/i;

const ITEM = /^\s*[*_]*\s*(\d{1,2})[.)]\s+([\s\S]+?)\s*[*_]*\s*$/;

// Split the trailing numbered list off a reply. Returns { body, items } or null.
export function parseChoices(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n/);
  const items = [];
  let i = blocks.length - 1;
  while (i >= 0 && !blocks[i].trim()) i--;
  // Walk up from the end collecting numbered lines (blank lines between them are fine).
  for (; i >= 0; i--) {
    const line = blocks[i];
    if (!line.trim()) continue;
    const m = line.match(ITEM);
    if (!m) break;
    items.unshift({ n: +m[1], raw: m[2] });
  }
  if (items.length < 2 || items.length > 8) return null;
  if (!items.every((it, k) => it.n === items[0].n + k) || items[0].n !== 1) return null;
  const body = blocks.slice(0, i + 1).join('\n').replace(/\s+$/, '');
  // Only a real choice: the line before the list asks (ends in ? or :) or an option says what happens after.
  const lead = body.split('\n').filter((l) => l.trim()).pop() || '';
  const hasAfter = items.some(({ raw }) => /\([^()]{12,}\)\s*[*_]*\s*\.?\s*$/.test(raw));
  if (!/[?:][*_"”’)\s]*$/.test(lead) && !hasAfter) return null;
  return {
    body,
    items: items.map(({ n, raw }) => {
      // Bold and italic marks are dropped: the card sets its own weights.
      const t = raw.replace(/\*\*|__|(^|\s)[*_]+|[*_]+(?=\s|$|[.,;:!?)])/g, '$1').trim();
      // A trailing "(Aftermath: …)" or "(…)" is what happens after.
      const m = t.match(/^([\s\S]*?)\s*\((?:aftermath|result|outcome|consequence)s?\s*:\s*([\s\S]+)\)\s*\.?$/i) || t.match(/^([\s\S]+?[.!?])\s*\(([\s\S]{12,})\)\s*\.?$/);
      return { n, text: (m ? m[1] : t).trim(), after: m ? m[2].trim() : '' };
    }),
  };
}

// The cards. live: the newest reply, whose cards can be picked and sent.
export function choicesHTML(items, live) {
  return `<div class="choices${live ? ' live' : ''}" role="${live ? 'group' : 'list'}" aria-label="Choices">${items
    .map(
      (it, k) =>
        `<${live ? 'button type="button"' : 'div'} class="choice${live ? ' press' : ''}" ${live ? `aria-pressed="false" data-choice="${k}"` : 'role="listitem"'}><span class="c-n" aria-hidden="true">${it.n}</span><span class="c-t">${formatMessage(it.text)}</span>${it.after ? `<span class="c-a">Then: ${formatMessage(it.after)}</span>` : ''}</${live ? 'button' : 'div'}>`
    )
    .join('')}</div>`;
}

// Colour the first mention of each cast name in every paragraph of formatted HTML.
export function colourNames(html, people) {
  const cast = (people || []).filter((p) => p?.name?.trim().length > 1);
  if (!cast.length) return html;
  const by = new Map(cast.map((p) => [p.name.trim().split(/\s+/)[0].toLowerCase(), p]));
  const re = new RegExp(`\\b(${cast.map((p) => p.name.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  let seen = new Set();
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/class="pg"|class="choice|<p\b/.test(part)) seen = new Set();
        return part;
      }
      return part.replace(re, (w) => {
        const p = by.get(w.toLowerCase());
        if (!p || seen.has(p)) return w;
        seen.add(p);
        const c = HEX.test(p.line?.color || '') ? p.line.color : '#2EAA67';
        // Lighter until it reads on the darkest ground, darker until it reads on the lightest bubble.
        let light = c;
        for (let k = 0; ratio(light, '#17233A') < 4.5 && k < 12; k++) light = shade(c, 0.1 * (k + 1));
        let dark = c;
        for (let k = 0; ratio(dark, '#FFFFFF') < 4.5 && k < 12; k++) dark = shade(c, -0.08 * (k + 1));
        return `<span class="who" style="--nl:${light};--nd:${dark}">${w}</span>`;
      });
    })
    .join('');
}

// Wrap each paragraph of formatted HTML so one can be marked.
export const wrapParas = (html) => `<span class="para" data-p="0">${html.split('<span class="pg" aria-hidden="true"></span>').map((seg, k) => (k ? `<span class="pg" aria-hidden="true"></span><span class="para" data-p="${k}">${seg}` : seg)).join('</span>')}</span>`;
export { esc };
