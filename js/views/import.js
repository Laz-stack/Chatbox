// Import review: after a ZIP, card or lorebook is dropped, show what was found and how it will come in.
import { S, activeConnection, saveSettings } from '../store.js';
import { readFiles, applyPlan, applyLooseLore, resolveUnsure, nextColors } from '../importer.js';
import { esc, inkOn, estimateTokens } from '../util.js';
import { topbar, icon, arrow, toast, confirmSheet } from '../ui.js';

let pending = null; // { cards, lore, errors }
let pendingFiles = []; // the files being reviewed (Browse Datacat keeps its cards until they're saved)

// Read files, then open the review screen (or report what failed).
export async function startImport(files) {
  files = [...(files || [])];
  if (!files.length) return;
  pendingFiles = files;
  const t = toast(`Reading ${files.length === 1 ? files[0].name : files.length + ' files'}…`, { ms: 60000 });
  try {
    pending = await readFiles(files);
  } catch (e) {
    pending = null;
    return toast(e.message || 'Could not read that file.', { kind: 'err' });
  } finally {
    t?.remove?.();
  }
  if (!pending.cards.length && !pending.lore.length) {
    toast(pending.errors[0] || 'Nothing to import in that file.', { kind: 'err', ms: 6000 });
    pending = null;
    return;
  }
  pending.cards.forEach((c) => (c.choice = c.names.length >= 2 ? (c.kind === 'unsure' ? 'narrator' : 'story') : 'narrator'));
  location.hash = '#/import';
}

const kNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const WARN = /dead ?dove|violence|gore|torture|abuse|non-?con|drug|self-?harm|suicide|nsfw|explicit|smut/i;

// What one card will add, for the line above the Import button.
const summary = (c) => {
  const lines = c.choice === 'story' ? c.cast.length || c.names.length : 1;
  return [`Adds ${lines} line${lines === 1 ? '' : 's'}`, c.lore.length && `${c.lore.length} lore entries`].filter(Boolean).join(', ') + (c.openings.length > 1 ? ` · starts at Opening 1 of ${c.openings.length}` : '');
};
const ctaLabel = () => {
  if (pending.cards.length !== 1) return pending.cards.length ? `Import ${pending.cards.length} cards` : 'Import lorebook';
  const c = pending.cards[0];
  return c.names.length < 2 ? 'Import character' : c.choice === 'story' ? 'Import as story' : 'Import with narrator';
};

export function importView() {
  if (!pending) return null;
  const conn = activeConnection();
  const aiOK = conn && conn.provider !== 'demo';
  const row = (lead, title, sub, extra = '') => `<div class="bd-row imp-row${extra}"><span class="imp-n num">${lead}</span><span class="bd-tx"><b>${title}</b><span>${sub}</span></span></div>`;
  const card = (c, i) => {
    const multi = c.names.length >= 2;
    const names = c.cast.length ? c.cast.map((x) => x.name) : c.names;
    // The same line colours the characters will get when they're saved.
    const cols = nextColors(names.length);
    const chips = names.map((n, k) => `<span class="imp-chip" style="--c:${cols[k]};--ink:${inkOn(cols[k])}">${esc(n.split(' ')[0])}</span>`).join('');
    const worldTok = estimateTokens((c.world || '') + (c.card.scenario || ''));
    const warn = c.tags.filter((t) => WARN.test(t)).map((t) => t.replace(/^#/, ''));
    const genre = c.tags.filter((t) => !WARN.test(t)).map((t) => t.replace(/^#/, ''));
    const kinds = [...new Set(c.lore.map((e) => (e.title.split(/\s+[—–-]\s+/)[1] ? e.title.split(/\s+[—–-]\s+/)[0] : '')).filter(Boolean))];
    const rows = [
      multi ? row(names.length, 'Characters', `<span class="imp-chips">${chips}</span>`, ' chips') : row(1, 'Character', esc(c.card.name)),
      c.lore.length ? row(c.lore.length, 'Lorebook entries', esc(kinds.length ? kinds.slice(0, 6).join(', ') : 'World info that joins when its keywords come up')) : '',
      row(c.openings.length || 0, c.openings.length === 1 ? 'Opening' : 'Openings', c.openings.length > 1 ? 'Swipe the first message to pick where it starts' : c.openings.length ? 'The first message' : 'None: you write the first line'),
      worldTok > 40 ? row(kNum(worldTok), 'World info', 'Tokens of setting and rules, sent with every reply') : '',
      warn.length ? row(warn.length, 'Content warnings', esc(warn.join(' · '))) : '',
    ].join('');
    const head = c.lore.length ? 'Card + lorebook' : 'Character card';
    const board = `<div class="board imp-board"><div class="bd-head"><span>Arriving</span><span>${pending.cards.length > 1 ? `Card ${i + 1} of ${pending.cards.length}` : head}</span></div>
      <div class="imp-top">${c.image ? `<img class="imp-cover" src="${c.image}" alt="">` : `<span class="imp-cover none">${icon('box', 26)}</span>`}<span class="imp-ttl"><b>${esc(c.title)}</b>${c.creator ? `<span>by ${esc(c.creator)}</span>` : ''}</span></div>
      ${c.blurb ? `<p class="imp-blurb">${esc(c.blurb)}</p>` : ''}${rows}</div>`;
    const tags = genre.length ? `<div class="imp-tags">${genre.slice(0, 10).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '';
    const adult = c.nsfw && !S.settings.mature
      ? `<div class="imp-note">${icon('shield', 18)}<span><b>Marked 18+.</b> It stays non-explicit while 18+ is off.</span><button type="button" class="imp-adult press" data-adult>Turn on 18+</button></div>`
      : '';
    const dots = (dc) => `<span class="imp-dots${dc.length === 1 ? ' one' : ''}" aria-hidden="true">${dc.map((col, k) => `${k ? '<em></em>' : ''}<i style="--c:${col}"></i>`).join('')}</span>`;
    const opt = (key, title, sub, dc, off = false) =>
      `<button type="button" class="imp-opt press" role="radio" aria-checked="${c.choice === key}" data-i="${i}" data-choice="${key}" ${off ? 'disabled' : ''}>${dots(dc)}<span><b>${title}</b><span>${sub}</span></span></button>`;
    const choice = multi
      ? `<div class="imp-choice" role="radiogroup" aria-label="Bring it in as"><p class="imp-label">Bring it in as</p>
          ${opt('story', 'Story', c.kind === 'unsure' ? (aiOK ? `The AI finds the ${names.length} characters, then they share one scene` : 'Needs an AI connection to find the characters') : `${names.length} characters, each in their own colour, one shared scene`, cols, c.kind === 'unsure' && !aiOK)}
          ${opt('narrator', 'One narrator', `One voice plays all ${names.length} characters, like JanitorAI`, ['#ECECEC'])}</div>`
      : '';
    return `<section class="imp-card">${board}${tags}${adult}${choice}</section>`;
  };
  const loose = pending.lore.length ? `<div class="board imp-board"><div class="bd-head"><span>Arriving</span><span>Lorebook</span></div>${row(pending.lore.length, 'Lorebook entries', 'For every chat')}</div>` : '';
  const errs = pending.errors.length ? `<p class="fhint imp-errs">${pending.errors.map(esc).join('<br>')}</p>` : '';
  const html = `<div class="screen no-tab imp-screen">
    ${topbar({ back: '#/', backIcon: 'x', backLabel: 'Cancel import', title: 'Import' })}
    <div class="stack" style="gap:22px" id="impList">${pending.cards.map(card).join('')}${loose}${errs}</div>
    <div class="sticky-cta"><p class="imp-sum" id="impSum">${pending.cards.length === 1 ? summary(pending.cards[0]) : ''}</p><button type="button" class="btn-primary press" id="doImport"><span>${ctaLabel()}</span>${arrow(30)}</button></div>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      const redraw = () => {
        root.querySelector('#impList').innerHTML = pending.cards.map(card).join('') + loose + errs;
        root.querySelector('#doImport span').textContent = ctaLabel();
        root.querySelector('#impSum').textContent = pending.cards.length === 1 ? summary(pending.cards[0]) : '';
      };
      root.querySelector('#impList').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-choice]');
        if (b && !b.disabled) {
          pending.cards[+b.dataset.i].choice = b.dataset.choice;
          return redraw();
        }
        if (e.target.closest('[data-adult]')) {
          const ok = await confirmSheet({ title: 'Are you 18 or older?', body: 'Turning this on lets characters write explicit adult scenes, if your AI provider allows them, and unlocks Mature details. Characters are always adults. You can turn it off in Depot any time.', ok: 'I’m 18 or older, turn it on' });
          if (!ok) return;
          S.settings.mature = true;
          S.settings.ageConfirmedAt = Date.now();
          await saveSettings();
          toast('18+ content is on');
          redraw();
        }
      });
      const btn = root.querySelector('#doImport');
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Importing…';
        let open = null;
        let lore = 0;
        const imgFail = [];
        try {
          for (const c of pending.cards) {
            if (c.choice === 'story' && c.kind === 'unsure') {
              btn.querySelector('span').textContent = 'Finding the characters…';
              if (!(await resolveUnsure(c, activeConnection()))) c.choice = 'narrator', toast(`Couldn’t find separate characters in ${c.title}; it came in as one narrator.`);
            }
            btn.querySelector('span').textContent = 'Saving pictures and lore…';
            const r = await applyPlan(c, c.choice);
            open ||= r.open;
            lore += r.lore;
            if (r.images.failed) imgFail.push(r.images.failed);
          }
          if (pending.lore.length) lore += await applyLooseLore(pending.lore);
        } catch (e) {
          btn.disabled = false;
          btn.querySelector('span').textContent = ctaLabel();
          return toast(e.message || 'Import failed.', { kind: 'err' });
        }
        const n = pending.cards.length;
        pending = null;
        dispatchEvent(new CustomEvent('chatbox:imported', { detail: { files: pendingFiles } }));
        pendingFiles = [];
        location.hash = open || '#/lore';
        setTimeout(() => toast(`${n ? `Imported ${n === 1 ? 'the card' : n + ' cards'}` : 'Imported'}${lore ? ` and ${lore} lore entries` : ''}.${imgFail.length ? ' Some pictures couldn’t be saved and will load from the web.' : ''}`, { ms: 6000 }), 450);
      });
    },
  };
}
