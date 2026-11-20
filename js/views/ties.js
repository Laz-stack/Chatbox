// Bonds › Between them (group chats): a small overview map of the cast (3+), then one plate per pair
// with each side's view: the viewer's dot and name, a word, and a warmth bar in the viewer's colour.
import { saveChat } from '../store.js';
import { WORDS, pairs, tieOf, setTie, signed } from '../ties.js';
import { esc, inkOn } from '../util.js';
import { avatarBullet, openSheet, icon } from '../ui.js';

const colorOf = (p) => p?.line?.color || '#2EAA67';
const firstName = (p) => p.name.trim().split(/\s+/)[0];

// Map lines: solid when both see each other warmly, dashed when either is cold, dotted until both are read.
const lineKind = (t1, t2) => (!t1 || !t2 ? 'none' : t1.warmth < 0 || t2.warmth < 0 ? 'cold' : 'warm');

export function tiesPanel(chat, cast) {
  let filter = null; // a character id, or "a|b" for one pair
  const open = new Set();
  const seen = new Set(Object.entries(chat.ties || {}).filter(([, t]) => !t.fresh).map(([k]) => k));

  const strength = ([a, b]) => Math.max(Math.abs(tieOf(chat, a.id, b.id)?.warmth || 0), Math.abs(tieOf(chat, b.id, a.id)?.warmth || 0));
  const recent = ([a, b]) => Math.max(tieOf(chat, a.id, b.id)?.at || 0, tieOf(chat, b.id, a.id)?.at || 0);
  const sorted = () =>
    pairs(cast)
      .filter(([a, b]) => !filter || (filter.includes('|') ? filter === `${a.id}|${b.id}` : a.id === filter || b.id === filter))
      .sort((x, y) => recent(y) - recent(x) || strength(y) - strength(x));

  // ---- overview map (3 to 5 characters) ----
  const map = () => {
    if (cast.length < 3) return '';
    const n = cast.length;
    const W = 328;
    const H = 176;
    const R = n === 3 ? 64 : 70;
    const pos = cast.map((p, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 4 ? Math.PI / 4 : 0);
      return { p, x: W / 2 + R * 1.6 * Math.cos(a), y: H / 2 + 4 + R * Math.sin(a) };
    });
    const edges = pairs(cast).map(([a, b]) => {
      const A = pos.find((x) => x.p === a);
      const B = pos.find((x) => x.p === b);
      const t1 = tieOf(chat, a.id, b.id);
      const t2 = tieOf(chat, b.id, a.id);
      const sel = filter === `${a.id}|${b.id}`;
      const kind = lineKind(t1, t2);
      return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="tw-e ${kind}${sel ? ' sel' : ''}"/><line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="tw-hit" data-pair="${a.id}|${b.id}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="Show ${esc(firstName(a))} and ${esc(firstName(b))}"/>`;
    });
    const stations = pos
      .map(({ p, x, y }) => `<g class="tw-st${filter === p.id ? ' sel' : ''}" data-who="${esc(p.id)}" role="button" tabindex="0" aria-pressed="${filter === p.id}" aria-label="Show ${esc(firstName(p))}’s pairs" transform="translate(${x} ${y})"><circle r="17" fill="${colorOf(p)}"/><text y="5" text-anchor="middle" fill="${inkOn(colorOf(p))}">${esc(p.name.trim()[0] || '?')}</text><text y="34" text-anchor="middle" class="tw-n">${esc(firstName(p))}</text></g>`)
      .join('');
    const kinds = pairs(cast).map(([a, b]) => lineKind(tieOf(chat, a.id, b.id), tieOf(chat, b.id, a.id)));
    const warm = kinds.filter((k) => k === 'warm').length;
    const coldN = kinds.filter((k) => k === 'cold').length;
    return `<div class="tw-map"><svg viewBox="0 0 ${W} ${H + 20}" role="group" aria-label="Map of ${cast.length} characters: ${warm} pair${warm === 1 ? '' : 's'} warm both ways, ${coldN} with tension. Tap a name or a line to show only those pairs.">${edges.join('')}${stations}</svg>
      ${filter ? `<button type="button" class="tw-clear press" data-clear>${icon('x', 14)}Show all pairs</button>` : `<p class="tw-key"><span class="solid"></span>warm both ways <span class="dash"></span>tension <span class="dot"></span>no read yet</p>`}</div>`;
  };

  // ---- pair plates ----
  const row = (from, to) => {
    const t = tieOf(chat, from.id, to.id);
    const w = t?.warmth ?? 0;
    const fresh = t?.fresh && !seen.has(`${from.id}>${to.id}`);
    if (!t) return `<div class="tw-row" style="--c:${colorOf(from)}"><span class="tw-who"><i aria-hidden="true"></i>${esc(firstName(from))} <span aria-hidden="true">→</span> <span class="tw-nr">No read yet</span></span></div>`;
    return `<div class="tw-row" style="--c:${colorOf(from)}"><span class="tw-who"><i aria-hidden="true"></i>${esc(firstName(from))} <span aria-hidden="true">→</span> <b class="${fresh ? 'fresh' : ''}">${t ? esc(t.word) : '—'}</b></span>
      <span class="tw-bar" role="meter" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${w}" aria-label="${esc(from.name)} about ${esc(to.name)}: warmth ${w}"><span class="mid"></span>${t ? `<i style="${w >= 0 ? `left:50%;width:${w / 2}%` : `right:50%;width:${-w / 2}%`}"></i>` : ''}</span>
      <em class="num">${t ? signed(w) : ''}</em></div>`;
  };
  const detail = (from, to) => {
    const t = tieOf(chat, from.id, to.id);
    const l = t?.log?.[0];
    const n = l?.msgId ? chat.messages.findIndex((m) => m.id === l.msgId) + 1 : 0;
    const last = l ? `${l.first ? 'First read' : `${esc(l.word || t.word)} ${l.d ? signed(l.d) : ''}`}${n ? ` · message ${n}` : ''}` : '';
    return `<p class="tw-why"><b>${esc(firstName(from))}:</b> ${t ? esc(t.why || 'No reason noted.') : 'No read yet.'}${t?.set ? ' <span class="tw-set">set by you</span>' : ''}${last ? `<small>Last change: ${last}</small>` : ''}</p>`;
  };
  const plate = ([a, b], k) => {
    const key = `${a.id}|${b.id}`;
    const t1 = tieOf(chat, a.id, b.id);
    const t2 = tieOf(chat, b.id, a.id);
    const isOpen = open.has(key);
    const label = `${a.name} about ${b.name}: ${t1 ? `${t1.word}, ${signed(t1.warmth)}` : 'no read yet'}; ${b.name} about ${a.name}: ${t2 ? `${t2.word}, ${signed(t2.warmth)}` : 'no read yet'}`;
    return `<section class="tw-pair${isOpen ? ' open' : ''}" style="animation-delay:${Math.min(k, 6) * 40}ms">
      <button type="button" class="tw-hd press" data-open="${key}" aria-expanded="${isOpen}" aria-label="${esc(label)}">${tag(a)}${tag(b)}</button>
      ${t1 || t2 ? row(a, b) + row(b, a) : `<p class="tw-none">No read yet. They’ll form views as you chat.</p>`}
      ${isOpen ? `<div class="tw-more">${detail(a, b)}${detail(b, a)}<button type="button" class="tw-edit press" data-edit="${key}">${icon('edit', 15)}Edit</button></div>` : ''}
    </section>`;
  };
  const tag = (p) => `<span class="cr-tag" style="--c:${colorOf(p)};--ink:${inkOn(colorOf(p))}">${avatarBullet(p, 20)}${esc(p.name)}</span>`;
  const html = () => `${map()}<div class="tw-list">${sorted().map(plate).join('')}</div>`;

  function editSheet([a, b], after) {
    let dir = [a, b];
    const t = () => tieOf(chat, dir[0].id, dir[1].id);
    const form = () => {
      const cur = t();
      return `<div class="tw-dir" role="group" aria-label="Direction">${[[a, b], [b, a]].map(([x, y], i) => `<button type="button" class="press" aria-pressed="${dir[0] === x}" data-tdir="${i}">${esc(firstName(x))} about ${esc(firstName(y))}</button>`).join('')}</div>
        <p class="tx-lbl">Word</p><div class="tw-words">${WORDS.map((w) => `<button type="button" class="press" aria-pressed="${cur?.word === w}" data-word="${w}">${w}</button>`).join('')}</div>
        <p class="tx-lbl">Warmth <span id="twVal" class="num">${signed(cur?.warmth ?? 0)}</span></p>
        <input type="range" id="twW" min="-100" max="100" step="5" value="${cur?.warmth ?? 0}" aria-label="Warmth, hostile to close" class="tw-range" style="--c:${colorOf(dir[0])}">
        <div class="tw-ends"><span>hostile</span><span>close</span></div>
        <div class="field" style="margin-top:12px"><div class="flabel"><label for="twWhy">Why</label></div><input class="input" id="twWhy" maxlength="80" value="${esc(cur?.why || '')}" placeholder="e.g. she covered for him once"></div>`;
    };
    openSheet({
      label: 'Edit relationship',
      html: `<h2 class="sheet-title">How they see each other</h2><div id="twForm">${form()}</div><button type="button" class="btn-primary press tw-save" id="twSave"><span>Save</span></button>`,
      onMount(s, close) {
        let word = t()?.word || '';
        const bind = () => {
          s.querySelector('#twW').addEventListener('input', (e) => (s.querySelector('#twVal').textContent = signed(Number(e.target.value))));
        };
        bind();
        s.addEventListener('click', async (e) => {
          const d = e.target.closest('[data-tdir]');
          const w = e.target.closest('[data-word]');
          if (d) {
            dir = d.dataset.tdir === '0' ? [a, b] : [b, a];
            word = t()?.word || '';
            s.querySelector('#twForm').innerHTML = form();
            bind();
          } else if (w) {
            word = w.dataset.word;
            s.querySelectorAll('[data-word]').forEach((x) => x.setAttribute('aria-pressed', x === w));
          } else if (e.target.closest('#twSave')) {
            setTie(chat, dir[0].id, dir[1].id, { warmth: Number(s.querySelector('#twW').value), word: word || 'neutral', why: s.querySelector('#twWhy').value.trim() }, chat.messages[chat.messages.length - 1]?.id);
            await saveChat(chat);
            close();
            after();
          }
        });
      },
    });
  }

  return {
    html,
    mount(el) {
      const redraw = () => (el.innerHTML = html());
      redraw();
      // The words seen now aren't "new" next time.
      for (const t of Object.values(chat.ties || {})) delete t.fresh;
      saveChat(chat, false);
      el.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-who],[data-pair]')) (e.preventDefault(), e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      });
      el.addEventListener('click', (e) => {
        const o = e.target.closest('[data-open]');
        const who = e.target.closest('[data-who]');
        const pr = e.target.closest('[data-pair]');
        const ed = e.target.closest('[data-edit]');
        if (o) open.has(o.dataset.open) ? open.delete(o.dataset.open) : open.add(o.dataset.open);
        else if (who) filter = filter === who.dataset.who ? null : who.dataset.who;
        else if (pr) filter = filter === pr.dataset.pair ? null : pr.dataset.pair;
        else if (e.target.closest('[data-clear]')) filter = null;
        else if (ed) {
          const [x, y] = ed.dataset.edit.split('|');
          return editSheet([cast.find((p) => p.id === x), cast.find((p) => p.id === y)], redraw);
        } else return;
        el.classList.add('still');
        redraw();
      });
    },
  };
}
