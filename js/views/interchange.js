// Create or edit an Interchange: pick 2–3 lines to meet in one chat, set the scene.
import { S as store, interchange, saveInterchange, deleteInterchange, getChat, saveChat, newChat } from '../store.js';
import { uid, esc, inkOn } from '../util.js';
import { topbar, avatarBullet, field, area, icon, arrow, toast, confirmSheet } from '../ui.js';

export function interchangeView(id) {
  const isNew = id === 'new';
  const existing = isNew ? null : interchange(id);
  if (!isNew && !existing) return null;
  const d = existing
    ? { id: existing.id, name: existing.name || '', members: existing.people.map((p) => p.id), scene: existing.scene || '' }
    : { id: 'ix-' + uid(), name: '', members: [], scene: '' };

  const pick = (c) => {
    const on = d.members.includes(c.id);
    const col = c.line?.color || '#2EAA67';
    return `<button type="button" class="ixp press${on ? ' on' : ''}" data-id="${c.id}" aria-pressed="${on}" style="--c:${col};--ink:${inkOn(col)}">${avatarBullet(c, 56)}<b>${esc(c.name)}</b>${on ? `<span class="ixp-k">${icon('check', 14)}</span>` : ''}</button>`;
  };

  const html = `<div class="screen no-tab">
    ${topbar({ back: existing ? `#/chat/${existing.id}` : '#/', backIcon: 'x', backLabel: 'Close', title: isNew ? 'New interchange' : 'Interchange', right: existing ? `<button type="button" class="ibtn press" id="delIx" aria-label="Delete interchange">${icon('trash')}</button>` : '' })}
    <div class="stack" style="gap:18px">
      <div><div class="hrow"><h2 class="h">Who meets?</h2><span class="small" id="cnt">${d.members.length} of 3</span></div>
        <div class="ixgrid" id="grid">${store.characters.map(pick).join('')}</div>
        <p class="fhint">Pick 2 or 3 lines. They'll take turns, and you choose who answers next.</p></div>
      ${field('ixName', 'Name', d.name, { ph: 'e.g. Late shift at the cafe', attrs: 'maxlength="60" autocomplete="off"', right: '<span class="small">Optional</span>' })}
      ${area('ixScene', 'The scene', d.scene, { rows: 4, ph: 'Where are they, and what is happening? e.g. A signal failure strands Ren at Mika\'s cafe after closing.', right: '<span class="small">Optional</span>' })}
    </div>
    <div class="sticky-cta"><button type="button" class="btn-primary press" id="saveIx"><span>${isNew ? 'Open the interchange' : 'Save interchange'}</span>${arrow(30)}</button></div>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      $('#grid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        const i = d.members.indexOf(b.dataset.id);
        if (i >= 0) d.members.splice(i, 1);
        else if (d.members.length >= 3) return toast('Three lines at most in one interchange.');
        else d.members.push(b.dataset.id);
        $('#grid').innerHTML = store.characters.map(pick).join('');
        $('#cnt').textContent = `${d.members.length} of 3`;
      });
      $('#ixName').addEventListener('input', (e) => (d.name = e.target.value));
      $('#ixScene').addEventListener('input', (e) => (d.scene = e.target.value));
      $('#saveIx').addEventListener('click', async () => {
        if (d.members.length < 2) return toast('Pick at least two lines to meet.');
        await saveInterchange({ id: d.id, name: d.name.trim(), members: d.members, scene: d.scene.trim(), createdAt: existing?.createdAt || Date.now() });
        if (isNew) await saveChat(newChat(d.id), false);
        else await getChat(d.id);
        location.hash = `#/chat/${d.id}`;
      });
      $('#delIx')?.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Delete this interchange?', body: 'This removes the group chat. The characters themselves stay.', ok: 'Delete', danger: true }))) return;
        await deleteInterchange(d.id);
        toast('Interchange deleted');
        location.hash = '#/lines';
      });
    },
  };
}
