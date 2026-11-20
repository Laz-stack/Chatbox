// ⋯ › Adventure: the Adventure mode switch for this chat, and its Quests and You carry boards.
import { getChat, saveChat, character, interchange, isInterchangeId } from '../store.js';
import { advOn } from '../adventure.js';
import { esc, uid } from '../util.js';
import { topbar, icon, toggleRow, bindSwitch, openSheet, confirmSheet } from '../ui.js';

const STATES = [['open', 'Open'], ['done', 'Done'], ['failed', 'Failed']];

export async function adventureView(id) {
  const chat = await getChat(id);
  if (!chat) return null;
  const title = isInterchangeId(chat.characterId) ? interchange(chat.characterId)?.title : character(chat.characterId)?.name;
  chat.quests ||= [];
  chat.items ||= [];

  const qRow = (q) => `<button type="button" class="ad-r press${q.state !== 'open' ? ' closed' : ''}" data-q="${esc(q.id)}"><span class="ad-t"><b>${esc(q.title)}</b>${q.note ? `<small>${esc(q.note)}</small>` : ''}</span>${q.state !== 'open' ? `<span class="ad-s">${q.state === 'done' ? 'Done' : 'Failed'}</span>` : ''}</button>`;
  const iRow = (it) => `<button type="button" class="ad-r press" data-i="${esc(it.id)}"><span class="ad-t"><b>${esc(it.name)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}</span><em class="num">${it.qty > 1 ? '×' + it.qty : ''}</em></button>`;
  const boards = () => {
    const open = chat.quests.filter((q) => q.state === 'open');
    const closed = chat.quests.filter((q) => q.state !== 'open');
    return `<section class="ad-board" aria-labelledby="adQ"><h2 class="ad-h" id="adQ"><span>Quests</span><span>${open.length} open</span></h2>
        ${open.length ? open.map(qRow).join('') : `<p class="ad-none">${closed.length ? 'No open quests.' : 'No quests yet. They appear as the story sets them.'}</p>`}
        ${closed.length ? `<h3 class="ad-sub">Closed</h3>${closed.map(qRow).join('')}` : ''}
        <button type="button" class="ad-add press" data-add="q">${icon('plus', 17)}Add a quest</button></section>
      <section class="ad-board" aria-labelledby="adI"><h2 class="ad-h" id="adI"><span>You carry</span><span>${chat.items.length} thing${chat.items.length === 1 ? '' : 's'}</span></h2>
        ${chat.items.length ? chat.items.map(iRow).join('') : `<p class="ad-none">Nothing yet. Things you pick up show here.</p>`}
        <button type="button" class="ad-add press" data-add="i">${icon('plus', 17)}Add an item</button></section>`;
  };

  const html = `<div class="screen no-tab cr-screen">
    ${topbar({ back: `#/chat/${encodeURIComponent(chat.id)}`, title: 'Quests and items' })}
    <p class="cr-sub">${esc(title || '')}</p>
    <div class="ad-tog">${toggleRow('adOn', 'Adventure mode', 'Three suggested moves after each reply and a d20 for risky actions. Uses one short extra AI call per reply.', advOn(chat))}</div>
    <div id="adBoards">${boards()}</div>
    <p class="fhint">While Adventure mode is on, the story adds quests and items as you play (checked every couple of replies). Anything you edit stays the way you set it.</p>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const box = root.querySelector('#adBoards');
      const redraw = () => {
        box.classList.add('still');
        box.innerHTML = boards();
      };
      bindSwitch(root.querySelector('#adOn'), async (on) => {
        chat.adv = { ...(chat.adv || {}), on };
        await saveChat(chat);
      });
      box.addEventListener('click', (e) => {
        const q = e.target.closest('[data-q]');
        const it = e.target.closest('[data-i]');
        const add = e.target.closest('[data-add]');
        if (q) questSheet(chat, chat.quests.find((x) => x.id === q.dataset.q), redraw);
        else if (it) itemSheet(chat, chat.items.find((x) => x.id === it.dataset.i), redraw);
        else if (add) (add.dataset.add === 'q' ? questSheet : itemSheet)(chat, null, redraw);
      });
    },
  };
}

function questSheet(chat, q, after) {
  const d = q ? { ...q } : { id: uid(), title: '', note: '', state: 'open' };
  openSheet({
    label: q ? 'Edit quest' : 'Add a quest',
    html: `<h2 class="sheet-title">${q ? 'Quest' : 'New quest'}</h2>
      <div class="field"><div class="flabel"><label for="adT">Goal</label></div><input class="input" id="adT" maxlength="70" value="${esc(d.title)}" placeholder="e.g. Get into the archive" autocomplete="off"></div>
      <div class="field" style="margin-top:12px"><div class="flabel"><label for="adN">Where it stands</label></div><input class="input" id="adN" maxlength="140" value="${esc(d.note)}" placeholder="One short line" autocomplete="off"></div>
      <p class="tx-lbl">State</p><div class="ad-states" role="radiogroup" aria-label="State">${STATES.map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${d.state === k}" data-st="${k}">${l}</button>`).join('')}</div>
      <div class="ad-acts">${q ? `<button type="button" class="btn-text danger press" id="adDel">${icon('trash', 16)}Delete</button>` : '<span></span>'}<button type="button" class="btn-primary press" id="adSave"><span>Save</span></button></div>`,
    onMount(s, close) {
      s.querySelector('.ad-states').addEventListener('click', (e) => {
        const b = e.target.closest('[data-st]');
        if (!b) return;
        d.state = b.dataset.st;
        s.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-checked', x === b));
      });
      s.querySelector('#adSave').addEventListener('click', async () => {
        d.title = s.querySelector('#adT').value.trim();
        d.note = s.querySelector('#adN').value.trim();
        if (!d.title) return s.querySelector('#adT').focus();
        d.set = true;
        d.at = Date.now();
        if (q) Object.assign(q, d);
        else chat.quests.push(d);
        await saveChat(chat);
        close();
        after();
      });
      s.querySelector('#adDel')?.addEventListener('click', async () => {
        close();
        if (!(await confirmSheet({ title: 'Delete this quest?', ok: 'Delete', danger: true }))) return;
        chat.quests = chat.quests.filter((x) => x !== q);
        await saveChat(chat);
        after();
      });
    },
  });
}

function itemSheet(chat, it, after) {
  const d = it ? { ...it } : { id: uid(), name: '', note: '', qty: 1 };
  openSheet({
    label: it ? 'Edit item' : 'Add an item',
    html: `<h2 class="sheet-title">${it ? 'Item' : 'New item'}</h2>
      <div class="field"><div class="flabel"><label for="adT">Name</label></div><input class="input" id="adT" maxlength="40" value="${esc(d.name)}" placeholder="e.g. Lockpicks" autocomplete="off"></div>
      <div class="field" style="margin-top:12px"><div class="flabel"><label for="adN">Note</label></div><input class="input" id="adN" maxlength="80" value="${esc(d.note)}" placeholder="Optional" autocomplete="off"></div>
      <p class="tx-lbl">How many</p><div class="ck-step"><button type="button" class="press" data-q="-1" aria-label="One less">−</button><b class="num" id="adQty">${d.qty}</b><button type="button" class="press" data-q="1" aria-label="One more">+</button></div>
      <div class="ad-acts">${it ? `<button type="button" class="btn-text danger press" id="adDel">${icon('trash', 16)}Remove</button>` : '<span></span>'}<button type="button" class="btn-primary press" id="adSave"><span>Save</span></button></div>`,
    onMount(s, close) {
      s.querySelector('.ck-step').addEventListener('click', (e) => {
        const b = e.target.closest('[data-q]');
        if (!b) return;
        d.qty = Math.max(1, d.qty + Number(b.dataset.q));
        s.querySelector('#adQty').textContent = d.qty;
      });
      s.querySelector('#adSave').addEventListener('click', async () => {
        d.name = s.querySelector('#adT').value.trim();
        d.note = s.querySelector('#adN').value.trim();
        if (!d.name) return s.querySelector('#adT').focus();
        d.set = true;
        if (it) Object.assign(it, d);
        else chat.items.push(d);
        await saveChat(chat);
        close();
        after();
      });
      s.querySelector('#adDel')?.addEventListener('click', async () => {
        chat.items = chat.items.filter((x) => x !== it);
        await saveChat(chat);
        close();
        after();
      });
    },
  });
}
