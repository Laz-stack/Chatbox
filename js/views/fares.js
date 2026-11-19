// Fares: what your own API keys cost this month, printed as a receipt.
// Tokens are estimates (about four characters each); dollars use the prices set on each connection.
import { S, saveSettings, monthKey, fareCost, character, connection } from '../store.js';
import { esc, fmtNum, inkOn } from '../util.js';
import { title2, tabbar, avatarBullet, icon, openSheet, toast } from '../ui.js';

const money = (v) => (v == null ? '—' : '$' + (v < 0.01 && v > 0 ? v.toFixed(3) : v.toFixed(2)));

export function faresView() {
  const now = new Date();
  const mo = S.fares.months[monthKey(now)] || { conns: {}, lines: {} };
  const conns = Object.entries(mo.conns).map(([id, c]) => ({ id, ...c, tok: c.in + c.out, cost: fareCost(id, c.in, c.out) }));
  conns.sort((a, b) => b.tok - a.tok);
  const priced = conns.filter((c) => c.cost != null);
  const total = priced.reduce((a, c) => a + c.cost, 0);
  const unpriced = conns.filter((c) => c.cost == null);
  const budget = S.settings.budget;
  const left = budget != null ? budget - total : null;
  const frac = budget ? Math.max(0, Math.min(1, left / budget)) : 0;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft = Math.max(1, Math.ceil((lastDay - now) / 864e5) + 1);
  const monthName = now.toLocaleDateString([], { month: 'short' });

  // Busiest lines: by cost when every connection they used has prices, otherwise by tokens.
  const lines = Object.entries(mo.lines)
    .map(([id, l]) => {
      const c = character(id);
      if (!c) return null;
      let cost = 0;
      for (const [cid, t] of Object.entries(l.byConn || {})) {
        const v = fareCost(cid, t.in, t.out);
        if (v == null) cost = null;
        else if (cost != null) cost += v;
      }
      return { c, tok: l.in + l.out, cost };
    })
    .filter(Boolean)
    .sort((a, b) => b.tok - a.tok)
    .slice(0, 5);
  const maxTok = Math.max(1, ...lines.map((l) => l.tok));

  const rows = conns.length
    ? conns
        .map((c) => {
          const live = connection(c.id);
          return `<div class="rc-r"><span>${esc(c.name)}<small>${esc(c.model || '')} · ${fmtNum(c.tok)} tokens · ${c.rides} ${c.rides === 1 ? 'reply' : 'replies'}</small></span><span class="num">${c.cost == null ? (live ? `<a class="rc-set" href="#/connection/${esc(c.id)}">Set price</a>` : '—') : money(c.cost)}</span></div>`;
        })
        .join('')
    : `<div class="rc-r rc-none"><span>No journeys yet this month.<small>Every reply you get is added here.</small></span></div>`;

  const leftBlock =
    budget != null
      ? `<div class="rc-r"><span>Monthly budget</span><button type="button" class="rc-edit num" id="setBudget">$${budget.toFixed(2)}</button></div>
         <div class="rc-r big"><span>Left to ride</span><span class="num">${left < 0 ? '−$' + Math.abs(left).toFixed(2) : '$' + left.toFixed(2)}</span></div>
         <div class="rc-meter${frac < 0.2 ? ' low' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.max(0, left).toFixed(2)}" aria-label="Budget left"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
         <div class="rc-note">${left < 0 ? 'Over budget. ' : ''}Resets in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</div>`
      : `<button type="button" class="rc-budget press" id="setBudget">${icon('plus', 18)}Set a monthly budget</button>`;

  const html = `<div class="screen">
    ${title2('Fares', 'Your receipt')}
    <div class="receipt"><div class="rc-h"><b>CHATBOX FARES</b><span class="num">1–${now.getDate()} ${monthName}</span></div>
      ${rows}
      <div class="rc-r tot"><span>Total${unpriced.length ? '<small>Connections without prices are not counted</small>' : ''}</span><span class="num">${money(total)}</span></div>
      ${leftBlock}
    </div>
    ${
      lines.length
        ? `<div class="blk"><div class="hrow"><h2 class="h">Busiest lines</h2><span class="small">${monthName}</span></div>${lines
            .map(
              ({ c, tok, cost }) =>
                `<a class="bl press" href="#/chat/${c.id}" style="--c:${c.line?.color || '#2EAA67'};--ink:${inkOn(c.line?.color || '#2EAA67')}">${avatarBullet(c, 30)}<b>${esc(c.name)}</b><span class="bl-bar"><i style="width:${((tok / maxTok) * 100).toFixed(1)}%"></i></span><span class="num">${cost == null ? fmtNum(tok) + ' tok' : money(cost)}</span></a>`
            )
            .join('')}</div>`
        : ''
    }
    <p class="fhint" style="margin-top:18px">Token counts are estimates (about four characters each). Prices come from each connection's More options.</p>
  </div>${tabbar('fares')}`;

  return {
    html,
    depth: 0,
    mount(root) {
      root.querySelector('#setBudget')?.addEventListener('click', () =>
        openSheet({
          label: 'Monthly budget',
          html: `<h2 class="sheet-title">Monthly budget</h2><p class="sheet-p">How much you want to spend on AI replies each month. Fares shows what's left.</p>
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
        })
      );
    },
  };
}
