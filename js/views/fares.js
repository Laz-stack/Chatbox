// Fares: what your own API keys cost this month, printed as receipts stacked like paper:
// Replies (chat replies), Scenes (painted pictures) and Helper (background jobs).
// Swipe the top receipt away (or tap a chip) to bring the next one up.
// Tokens are estimates (about four characters each); dollars use the prices set on each connection,
// or what OpenRouter reported for a picture.
import { S, saveSettings, monthKey, costOf, character, connection, interchange } from '../store.js';
import { picPrefs } from '../pictures.js';
import { JOBS } from '../helper.js';
import { esc, fmtNum, inkOn, reducedMotion, EASE_OUT, flyFrames, takeOver, snapBack } from '../util.js';
import { title2, tabbar, avatarBullet, icon, openSheet, toast, groupAvatar } from '../ui.js';

const money = (v) => (v == null ? '—' : '$' + (v > 0 && v < 0.001 ? v.toFixed(4) : v > 0 && v < 0.01 ? v.toFixed(3) : v.toFixed(2)));
const PAPERS = [
  ['replies', 'Replies'],
  ['scenes', 'Scenes'],
  ['helper', 'Helper'],
];
let lastTop = 0; // the paper on top, kept while you move around the app

export function faresView() {
  const now = new Date();
  const mo = S.fares.months[monthKey(now)] || { conns: {}, lines: {} };
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft = Math.max(1, Math.ceil((lastDay - now) / 864e5) + 1);
  const monthName = now.toLocaleDateString([], { month: 'short' });

  // ---------- Replies ----------
  // What OpenRouter reported it billed, plus tokens it didn't report priced at the connection's
  // typed prices (marked est.).
  const priced = ([id, c]) => ({ id, ...c, tok: c.in + c.out, ...costOf(c, id) });
  const conns = Object.entries(mo.conns).map(priced);
  conns.sort((a, b) => b.tok - a.tok);
  const repliesTotal = conns.filter((c) => c.cost != null).reduce((a, c) => a + c.cost, 0);
  const repliesUnpriced = conns.some((c) => c.unpriced);

  // ---------- Scenes ----------
  // Reported by the provider, plus your price per picture as it was when each was painted.
  const picCost = (p) => (p.cost || 0) + (p.est || 0);
  const picOpen = (p) => p.n - (p.known || 0) - (p.estN || 0); // pictures with no cost known yet
  const pics = Object.entries(mo.pics?.conns || {}).map(([k, p]) => ({ k, ...p, total: picCost(p), open: picOpen(p), est: (p.estN || 0) > 0 }));
  pics.sort((a, b) => b.n - a.n);
  const scenesTotal = pics.reduce((a, p) => a + p.total, 0);
  const scenesUnpriced = pics.some((p) => p.open > 0);

  // ---------- Helper ----------
  const helpers = Object.entries(mo.helper?.conns || {}).map(priced);
  helpers.sort((a, b) => b.tok - a.tok);
  const helperTotal = helpers.filter((c) => c.cost != null).reduce((a, c) => a + c.cost, 0);
  const helperUnpriced = helpers.some((c) => c.unpriced);

  const all = repliesTotal + scenesTotal + helperTotal;
  const budget = S.settings.budget;
  const left = budget != null ? budget - all : null;
  const frac = budget ? Math.max(0, Math.min(1, left / budget)) : 0;

  // OpenRouter connections have no price boxes (it reports what it bills), so nothing to set there.
  const setPrice = (id) => (connection(id) && connection(id).provider !== 'openrouter' ? `<a class="rc-set" href="#/connection/${esc(id)}">Set price</a>` : '—');
  // The footnote says only what applies to the connections you have.
  const provs = new Set(S.connections.map((c) => c.provider));
  const footnote = [
    provs.has('openrouter') ? 'With OpenRouter, each cost is what OpenRouter actually charged.' : '',
    [...provs].some((p) => p !== 'openrouter' && p !== 'demo') ? `For ${provs.has('openrouter') ? 'other' : 'your'} connections it’s worked out from the prices you set in the connection’s More options, so treat it as an estimate.` : '',
    pics.length ? 'Pictures use your price per picture.' : '',
  ].filter(Boolean).join(' ');
  const tag = (c) => (c.est ? ' · est.' : '') + (c.unpriced && c.cost != null ? ' · some unpriced' : '');
  const val = (c) => (c.cost == null ? setPrice(c.id) : money(c.cost));
  const srcNote = (rows) =>
    (rows.some((c) => c.reported) ? `<div class="rc-note rc-src">Costs as reported by OpenRouter for each request${rows.some((c) => c.est) ? '; est. is worked out from the prices typed on a connection' : ''}.</div>` : rows.some((c) => c.est) ? `<div class="rc-note rc-src">Worked out from the prices typed on each connection.</div>` : '');
  const head = (kind) => `<div class="rc-h"><b>CHATBOX FARES${kind ? ' · ' + kind : ''}</b><span class="num">1–${now.getDate()} ${monthName}</span></div>`;
  const budgetBlock =
    budget != null
      ? `<div class="rc-r"><span>Monthly budget</span><button type="button" class="rc-edit num" data-budget>$${budget.toFixed(2)}</button></div>
         <div class="rc-r big"><span>Left to ride</span><span class="num">${left < 0 ? '−$' + Math.abs(left).toFixed(2) : '$' + left.toFixed(2)}</span></div>
         <div class="rc-meter${frac < 0.2 ? ' low' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.max(0, left).toFixed(2)}" aria-label="Budget left"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
         <div class="rc-note">${left < 0 ? 'Over budget. ' : ''}Resets in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</div>`
      : `<button type="button" class="rc-budget press" data-budget>${icon('plus', 18)}Set a monthly budget</button>`;
  const totals = (total, unpriced, note) =>
    `<div class="rc-r tot"><span>Total${unpriced ? `<small>${note}</small>` : ''}</span><span class="num">${money(total)}</span></div>
     <div class="rc-r"><span>All papers<small>Replies, scenes and helper together</small></span><span class="num">${money(all)}</span></div>`;

  const paper = {
    replies: () =>
      head('') +
      (conns.length
        ? conns.map((c) => `<div class="rc-r"><span>${esc(c.name)}<small>${esc(c.model || '')} · ${fmtNum(c.tok)} tokens · ${c.rides} ${c.rides === 1 ? 'reply' : 'replies'}${tag(c)}</small></span><span class="num">${val(c)}</span></div>`).join('')
        : `<div class="rc-r rc-none"><span>No journeys yet this month.<small>Every reply you get is added here.</small></span></div>`) +
      totals(repliesTotal, repliesUnpriced, 'Tokens without a price are not counted') +
      srcNote(conns) +
      budgetBlock,
    scenes: () =>
      head('SCENES') +
      (pics.length
        ? pics.map((p) => `<div class="rc-r"><span>${esc(p.model || 'Pictures')}<small>${esc(p.name)} · ${p.n} ${p.n === 1 ? 'picture' : 'pictures'}${p.est ? ' · est.' : ''}${p.open > 0 ? ` · ${p.open} unpriced` : ''}</small></span><span class="num">${p.open > 0 && !p.total ? '<a class="rc-set" href="#/connections/pictures">Set price</a>' : money(p.total)}</span></div>`).join('')
        : `<div class="rc-r rc-none"><span>No pictures this month.<small>Painted scenes are added here.</small></span></div>`) +
      totals(scenesTotal, scenesUnpriced, 'Some pictures have no price: set one in Connections › Pictures') +
      (pics.some((p) => p.known) ? `<div class="rc-note rc-src">Costs as reported by OpenRouter. With your own provider key there, it may show only OpenRouter’s fee.</div>` : '') +
      budgetBlock,
    helper: () =>
      head('HELPER') +
      (helpers.length
        ? helpers
            .map((c) => {
              const top = Object.entries(c.jobs || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([j, n]) => `${JOBS[j] || j} ×${n}`).join(', ');
              return `<div class="rc-r"><span>${esc(c.name)}<small>${esc(c.model || '')} · ${fmtNum(c.tok)} tokens · ${c.calls} ${c.calls === 1 ? 'job' : 'jobs'}${top ? ` · ${esc(top)}` : ''}${tag(c)}</small></span><span class="num">${val(c)}</span></div>`;
            })
            .join('')
        : `<div class="rc-r rc-none"><span>The helper hasn’t run this month.<small>Story tracking, summaries and other background jobs are added here.</small></span></div>`) +
      totals(helperTotal, helperUnpriced, 'Tokens without a price are not counted') +
      srcNote(helpers) +
      budgetBlock,
  };

  // ---------- Busiest lines: follows the paper on top ----------
  const lineOf = (id) => character(id) || interchange(id);
  const busy = {
    replies: () => {
      const rows = Object.entries(mo.lines)
        .map(([id, l]) => {
          const c = character(id);
          if (!c) return null;
          let cost = 0;
          let est = false;
          for (const [cid, t] of Object.entries(l.byConn || {})) {
            const v = costOf(t, cid);
            est ||= v.est;
            if (v.cost == null || v.unpriced) cost = null;
            else if (cost != null) cost += v.cost;
          }
          return { c, val: l.in + l.out, label: cost == null ? fmtNum(l.in + l.out) + ' tok' : money(cost) + (est ? ' est.' : '') };
        })
        .filter(Boolean);
      return { title: 'Busiest lines', rows };
    },
    scenes: () => {
      const rows = Object.entries(mo.pics?.lines || {})
        .map(([id, l]) => {
          const c = lineOf(id);
          if (!c) return null;
          const v = picCost(l);
          return { c, val: l.n, label: `${l.n} pic${l.n === 1 ? '' : 's'}${v ? ' · ' + money(v) + (l.estN ? ' est.' : '') : ''}` };
        })
        .filter(Boolean);
      return { title: 'Most painted', rows };
    },
    helper: () => {
      const jobs = {};
      for (const c of helpers) for (const [j, n] of Object.entries(c.jobs || {})) jobs[j] = (jobs[j] || 0) + n;
      return { title: 'Busiest jobs', jobs: Object.entries(jobs).sort((a, b) => b[1] - a[1]) };
    },
  };
  const busyHTML = (k) => {
    const b = busy[k]();
    if (b.jobs) {
      if (!b.jobs.length) return '';
      const max = Math.max(1, ...b.jobs.map((x) => x[1]));
      return `<div class="blk"><div class="hrow"><h2 class="h">${b.title}</h2><span class="small">${monthName}</span></div>${b.jobs
        .map(([j, n]) => `<div class="bl bl-job"><span class="bl-ic" aria-hidden="true">${esc((JOBS[j] || j)[0])}</span><b>${esc(JOBS[j] || j)}</b><span class="bl-bar"><i style="width:${((n / max) * 100).toFixed(1)}%"></i></span><span class="num">${n}</span></div>`)
        .join('')}</div>`;
    }
    const rows = b.rows.sort((x, y) => y.val - x.val).slice(0, 5);
    if (!rows.length) return '';
    const max = Math.max(1, ...rows.map((r) => r.val));
    return `<div class="blk"><div class="hrow"><h2 class="h">${b.title}</h2><span class="small">${monthName}</span></div>${rows
      .map(({ c, val, label }) => {
        const ix = !!c.members;
        const col = ix ? '#ECECEC' : c.line?.color || '#2EAA67';
        return `<a class="bl press" href="#/chat/${c.id}" style="--c:${col};--ink:${inkOn(col)}">${ix ? groupAvatar(c, 30) : avatarBullet(c, 30)}<b>${esc(c.title || c.name)}</b><span class="bl-bar"><i style="width:${((val / max) * 100).toFixed(1)}%"></i></span><span class="num">${label}</span></a>`;
      })
      .join('')}</div>`;
  };

  const order = (top) => [0, 1, 2].map((k) => PAPERS[(top + k) % 3]);
  const hint = (top) => `Swipe the receipt for ${PAPERS[(top + 1) % 3][1]}`;
  const stackHTML = (top) => {
    const [a, b, c] = order(top);
    // The paper right under the top one already holds the next receipt, so a drag reveals it.
    return `<div class="rc-peek p2" aria-hidden="true" inert><span class="rc-pl">${c[1].toUpperCase()}</span></div><div class="rc-peek p1" aria-hidden="true" inert><div class="rc-under">${paper[b[0]]()}</div><span class="rc-pl">${b[1].toUpperCase()}</span></div>
      <div class="receipt rc-top" id="rcTop" role="tabpanel" aria-labelledby="rcTab-${a[0]}" tabindex="0">${paper[a[0]]()}</div>`;
  };
  const chips = (top) => PAPERS.map(([k, l], i) => `<button type="button" role="tab" class="press" id="rcTab-${k}" aria-controls="rcTop" aria-selected="${i === top}" tabindex="${i === top ? 0 : -1}" data-p="${i}">${l}</button>`).join('');

  const html = `<div class="screen">
    ${title2('Fares', 'Your receipt')}
    <div class="rc-chips" role="tablist" aria-label="Receipts">${chips(lastTop)}</div>
    <div class="rc-wrap"><div class="rc-stack" id="rcStack">${stackHTML(lastTop)}</div></div>
    <p class="rc-hint" id="rcHint">${hint(lastTop)}</p>
    <div id="rcBusy">${busyHTML(PAPERS[lastTop][0])}</div>
    ${footnote ? `<p class="fhint" style="margin-top:18px">${footnote}</p>` : ''}
  </div>${tabbar('fares')}`;

  return {
    html,
    depth: 0,
    mount(root) {
      const stack = root.querySelector('#rcStack');
      const tabs = root.querySelector('.rc-chips');
      let top = lastTop;

      // Bring paper `to` up. dir: 1 = the top paper leaves to the left (next), -1 = to the right (back).
      async function show(to, dir = 1, fromX = 0, v = 0) {
        if (to === top) return;
        // A tap or swipe mid-flight isn't dropped: the stack redraws at once and the flights overlap.
        // Earlier flights still in the air skip ahead to their way round the back.
        stack.parentElement.querySelectorAll('.rc-fly').forEach((f) =>
          f.getAnimations().forEach((a) => {
            const d = a.effect.getTiming().duration;
            if (a.currentTime < d * 0.601) a.currentTime = d * 0.601;
          })
        );
        const old = stack.querySelector('#rcTop');
        const quiet = reducedMotion();
        if (!quiet) {
          // The top paper flies off and tucks behind the stack…
          const fly = old.cloneNode(true);
          fly.removeAttribute('id');
          fly.removeAttribute('role');
          fly.classList.add('rc-fly');
          fly.setAttribute('aria-hidden', 'true');
          fly.style.top = old.offsetTop + 'px';
          // Outside the stack, so redrawing the stack doesn't take it away mid-flight.
          stack.parentElement.appendChild(fly);
          const dur = Math.max(220, Math.min(380, 380 - v * 120)); // a faster flick flies faster
          fly.animate(flyFrames(fromX, stack.offsetWidth, dir), { duration: dur, easing: 'linear' }).finished.then(() => fly.remove(), () => fly.remove());
        }
        top = to;
        lastTop = to;
        stack.classList.add('moved');
        stack.innerHTML = stackHTML(to);
        const neu = stack.querySelector('#rcTop');
        // …and the next one rises out of its peek.
        neu.animate(quiet ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: 'translateY(12px) scaleX(.96)', filter: 'brightness(.88)' }, { transform: 'none', filter: 'none' }], { duration: quiet ? 150 : 320, easing: EASE_OUT });
        tabs.innerHTML = chips(to);
        root.querySelector('#rcBusy').innerHTML = busyHTML(PAPERS[to][0]);
        root.querySelector('#rcHint').textContent = hint(to);
        bindDrag();
      }

      // Drag the top paper sideways; let go past 30% (or with a flick) to send it to the back.
      function bindDrag() {
        const el = stack.querySelector('#rcTop');
        let x0 = null;
        let y0 = 0;
        let t0 = 0;
        let dx = 0;
        let horiz = null;
        let base = 0;
        el.addEventListener('pointerdown', (e) => {
          if (e.target.closest('a, button')) return;
          // Grabbing it mid-animation takes over from where it is, instead of jumping when that ends.
          base = takeOver(el);
          x0 = e.clientX;
          y0 = e.clientY;
          t0 = performance.now();
          dx = 0;
          horiz = null;
        });
        el.addEventListener('pointermove', (e) => {
          if (x0 == null) return;
          dx = e.clientX - x0;
          if (horiz == null && (Math.abs(dx) > 8 || Math.abs(e.clientY - y0) > 8)) {
            horiz = Math.abs(dx) > Math.abs(e.clientY - y0);
            if (horiz) el.setPointerCapture(e.pointerId);
          }
          const x = base + dx;
          if (horiz) el.style.transform = `translateX(${x}px) rotate(${Math.max(-4, Math.min(4, (x / el.offsetWidth) * 4))}deg)`;
        });
        const end = () => {
          if (x0 == null) return;
          const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
          const x = base + dx;
          const go = horiz && (Math.abs(x) > el.offsetWidth * 0.3 || v > 0.5);
          x0 = null;
          // Either way you swipe, the paper you can see underneath comes up next.
          if (go) show((top + 1) % 3, x < 0 ? 1 : -1, x, v);
          else snapBack(el); // a short drag, a scroll, or a tap that caught it mid-move
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
      }
      bindDrag();

      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-p]');
        if (!b) return;
        const to = +b.dataset.p;
        show(to, to > top ? 1 : -1);
      });
      tabs.addEventListener('keydown', (e) => {
        const map = { ArrowRight: (top + 1) % 3, ArrowLeft: (top + 2) % 3, Home: 0, End: 2 };
        if (!(e.key in map)) return;
        e.preventDefault();
        const to = map[e.key];
        show(to, e.key === 'ArrowLeft' || (e.key === 'Home' && to < top) ? -1 : 1);
        setTimeout(() => tabs.querySelector(`[data-p="${to}"]`)?.focus(), 0);
      });

      root.querySelector('.screen').addEventListener('click', (e) => {
        if (!e.target.closest('[data-budget]')) return;
        const budget = S.settings.budget;
        openSheet({
          label: 'Monthly budget',
          html: `<h2 class="sheet-title">Monthly budget</h2><p class="sheet-p">How much you want to spend on AI each month: replies, pictures and helper jobs together. Fares shows what's left.</p>
            <div class="fwrap"><input class="input" id="bIn" type="number" min="0" step="0.5" inputmode="decimal" placeholder="e.g. 10" value="${budget ?? ''}" data-autofocus aria-label="Budget in dollars"></div>
            <div style="height:14px"></div><div class="sheet-actions"><button type="button" class="btn-primary plate press" data-x><span>${budget != null ? 'Remove budget' : 'Cancel'}</span></button><button type="button" class="btn-primary press" data-ok><span>Save</span></button></div>`,
          onMount(s, close) {
            s.querySelector('[data-x]').onclick = async () => {
              if (budget != null) {
                S.settings.budget = null;
                await saveSettings();
                toast('Budget removed');
                dispatchEvent(new HashChangeEvent('hashchange'));
              }
              close();
            };
            s.querySelector('[data-ok]').onclick = async () => {
              const v = parseFloat(s.querySelector('#bIn').value);
              if (!(v > 0)) return toast('Enter an amount above zero.');
              S.settings.budget = Math.round(v * 100) / 100;
              await saveSettings();
              close();
              dispatchEvent(new HashChangeEvent('hashchange'));
            };
          },
        });
      });
    },
  };
}
