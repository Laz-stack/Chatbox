// Lorebook: world info (places, factions, items, history) that joins the prompt only when its
// keywords come up in the chat, so long stories stay consistent without a giant prompt.
import { S, newLore, loreEntry, saveLoreEntry, deleteLoreEntry, character, interchange, activeConnection } from '../store.js';
import { enhanceLore } from '../loregen.js';
import { esc, inkOn } from '../util.js';
import { topbar, title2, ibtn, field, toggleRow, bindSwitch, avatarBullet, icon, arrow, toast, confirmSheet, sw } from '../ui.js';

const scopeText = (e) => {
  if (e.scope !== 'lines' || !e.lines.length) return 'All lines';
  const names = e.lines.map((id) => character(id)?.name || interchange(id)?.title).filter(Boolean);
  return names.length ? names.join(', ') : 'No lines chosen';
};

export function loreListView() {
  const row = (e) => `<div class="lore-row${e.on ? '' : ' off'}">
      <a class="lore-main press" href="#/lore/${e.id}">
        <span class="lore-t">${esc(e.title || e.keys[0] || 'Untitled entry')}</span>
        <span class="lore-keys">${e.always ? '<span class="kchip always">Always</span>' : ''}${e.keys.slice(0, 5).map((k) => `<span class="kchip">${esc(k)}</span>`).join('')}${e.keys.length > 5 ? `<span class="kchip more">+${e.keys.length - 5}</span>` : ''}</span>
        <span class="lore-s">${e.scope === 'lines' ? esc(scopeText(e)) + ' · ' : ''}${esc((e.text || '').replace(/\s+/g, ' ').slice(0, 70))}</span>
      </a>
      ${sw('on-' + e.id, e.on, `Use ${e.title || 'this entry'}`).replace('class="switch"', `class="switch" data-on="${e.id}"`)}
    </div>`;
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/settings', right: ibtn('plus', 'New lore entry', { href: '#/lore/new', cls: 'yellow' }) })}
    ${title2('Lorebook', 'World info')}
    <p class="lore-intro">Places, people and rules of your world. An entry is sent only when one of its keywords comes up in the chat, so the prompt stays short.</p>
    <div class="lore-list">${S.lore.length ? S.lore.map(row).join('') : `<div class="lore-empty">${icon('book', 22)}<span><b>No entries yet.</b> Try one for a place your characters keep visiting, e.g. <i>Kita Station</i> with the keywords <i>Kita, the station</i>.</span></div>`}</div>
    <a class="dashed press" href="#/lore/new" style="margin-top:12px">${icon('plus', 20)}New entry</a>
  </div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      root.querySelectorAll('[data-on]').forEach((b) =>
        bindSwitch(b, async (v) => {
          const e = loreEntry(b.dataset.on);
          e.on = v;
          b.closest('.lore-row').classList.toggle('off', !v);
          await saveLoreEntry(e);
        })
      );
    },
  };
}

export function loreEditView(id) {
  const isNew = id === 'new';
  const src = isNew ? newLore() : loreEntry(id);
  if (!src) return null;
  const d = structuredClone(src);
  const chips = () => d.keys.map((k, i) => `<button type="button" class="kchip edit press" data-k="${i}" aria-label="Remove keyword ${esc(k)}">${esc(k)}${icon('x', 13)}</button>`).join('');
  const pick = (c) => {
    const on = d.lines.includes(c.id);
    const col = c.line?.color || '#2EAA67';
    return `<button type="button" class="ixp press${on ? ' on' : ''}" data-id="${c.id}" aria-pressed="${on}" style="--c:${col};--ink:${inkOn(col)}">${avatarBullet(c, 48)}<b>${esc(c.name)}</b>${on ? `<span class="ixp-k">${icon('check', 14)}</span>` : ''}</button>`;
  };
  // Interchanges and Carriages can be chosen too: the entry then joins that group chat only.
  const groups = () => S.interchanges.map((x) => interchange(x.id)).filter(Boolean);
  const pickIx = (ix) => {
    const on = d.lines.includes(ix.id);
    return `<button type="button" class="lore-ixrow press${on ? ' on' : ''}" data-id="${ix.id}" aria-pressed="${on}"><span class="meet">${ix.people.map((p, i) => avatarBullet(p, 34, i ? 'margin-left:-10px' : '')).join('')}</span><span class="lix-tx"><b>${esc(ix.title)}</b><small>${ix.mode === 'scene' ? 'Carriage' : 'Interchange'} · ${esc(ix.people.map((p) => p.name).join(', '))}</small></span>${on ? icon('check', 18) : ''}</button>`;
  };
  const linesHTML = () =>
    `<div class="ixgrid">${S.characters.map(pick).join('')}</div>` +
    (groups().length ? `<p class="lore-sub">Interchanges and carriages</p><div class="lore-ixlist">${groups().map(pickIx).join('')}</div>` : '');
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/lore', backIcon: 'x', backLabel: 'Close', title: isNew ? 'New entry' : 'Lore entry', right: isNew ? '' : ibtn('trash', 'Delete entry', { id: 'delLore' }) })}
    <div class="stack" style="gap:18px">
      ${field('loTitle', 'Title', d.title, { ph: 'e.g. Kita Station', attrs: 'maxlength="80" autocomplete="off"' })}
      <div class="field"><div class="flabel"><label for="loKey">Keywords</label><span class="small">${d.always ? 'Not needed: always on' : 'Any one of them brings it in'}</span></div>
        <div class="kbox" id="kbox"><span id="kchips">${chips()}</span><input id="loKey" placeholder="${d.keys.length ? 'Add another' : 'e.g. Kita, the station'}" autocomplete="off" enterkeyhint="done" aria-label="Add a keyword"></div>
        <p class="fhint">Tap Done or type a comma after each one. Matching ignores case and works on whole words.</p></div>
      <div class="field"><div class="flabel"><label for="loText">What the characters know</label><span class="counter" id="loCount"></span></div>
        <textarea class="input area" id="loText" rows="5" placeholder="Kita Station is the last stop on the green line. Its clock has been five minutes slow for years. Use {{char}} and {{user}} if you like.">${esc(d.text)}</textarea>
        <div class="bp-btns one lore-enh"><button type="button" class="bp-enh press" id="loEnh">${icon('spark', 20)}<span>Enhance</span></button></div>
        <p class="fhint">Enhance expands the text and suggests keywords. It keeps what you wrote.</p>
        <div class="bp-result" id="loResult" role="status" hidden></div></div>
      <div class="field"><div class="flabel"><span>Applies to</span></div>
        <div class="seg two" role="group" aria-label="Applies to"><button type="button" class="press" data-scope="all" aria-pressed="${d.scope !== 'lines'}"><b>All lines</b><span>Every chat</span></button><button type="button" class="press" data-scope="lines" aria-pressed="${d.scope === 'lines'}"><b>Chosen</b><span>Lines or group chats</span></button></div>
        <div class="lore-lines" id="loLines" ${d.scope === 'lines' ? '' : 'hidden'}>${linesHTML()}</div></div>
      <div>${toggleRow('loAlways', 'Always include', 'Sent in every reply, no keyword needed. Use sparingly.', d.always)}${toggleRow('loOn', 'Use this entry', 'Off keeps it saved but out of your chats.', d.on)}</div>
    </div>
    <div class="sticky-cta"><button type="button" class="btn-primary press" id="saveLore"><span>${isNew ? 'Add to Lorebook' : 'Save entry'}</span>${arrow(30)}</button></div>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const pristine = JSON.stringify(d);
      const count = () => ($('#loCount').textContent = `${d.text.length.toLocaleString()} / 3,000`);
      count();
      const addKeys = (raw) => {
        for (const k of raw.split(',').map((x) => x.trim()).filter(Boolean)) if (!d.keys.some((x) => x.toLowerCase() === k.toLowerCase())) d.keys.push(k.slice(0, 40));
        $('#kchips').innerHTML = chips();
        if (d.keys.length) $('#kbox').removeAttribute('aria-invalid');
        $('#loKey').placeholder = d.keys.length ? 'Add another' : 'e.g. Kita, the station';
      };
      const key = $('#loKey');
      key.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addKeys(key.value);
          key.value = '';
        } else if (e.key === 'Backspace' && !key.value && d.keys.length) {
          d.keys.pop();
          $('#kchips').innerHTML = chips();
        }
      });
      key.addEventListener('input', () => {
        if (key.value.includes(',')) {
          addKeys(key.value);
          key.value = '';
        }
      });
      key.addEventListener('blur', () => {
        if (key.value.trim()) addKeys(key.value), (key.value = '');
      });
      $('#kbox').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (b) {
          d.keys.splice(+b.dataset.k, 1);
          $('#kchips').innerHTML = chips();
        } else key.focus();
      });
      $('#loTitle').addEventListener('input', (e) => (d.title = e.target.value));
      $('#loText').addEventListener('input', (e) => ((d.text = e.target.value.slice(0, 3000)), e.target.removeAttribute('aria-invalid'), count()));
      root.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-scope]');
        if (!b) return;
        d.scope = b.dataset.scope;
        root.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        $('#loLines').hidden = d.scope !== 'lines';
      });
      $('#loLines').addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        const i = d.lines.indexOf(b.dataset.id);
        i >= 0 ? d.lines.splice(i, 1) : d.lines.push(b.dataset.id);
        $('#loLines').innerHTML = linesHTML();
      });
      bindSwitch($('#loAlways'), (v) => {
        d.always = v;
        root.querySelector('.field .flabel .small').textContent = v ? 'Not needed: always on' : 'Any one of them brings it in';
      });
      bindSwitch($('#loOn'), (v) => (d.on = v));
      // ---------- Enhance ----------
      let ctl = null;
      const result = (html, kind = '') => {
        const r = $('#loResult');
        r.hidden = !html;
        r.className = 'bp-result ' + kind;
        r.innerHTML = html ? `<span class="bp-msg">${html}</span>` : '';
      };
      const enhBtn = $('#loEnh');
      const busy = (on) => {
        enhBtn.classList.toggle('busy', on);
        enhBtn.querySelector('span').textContent = on ? 'Writing… Stop' : 'Enhance';
      };
      const fillUI = () => {
        $('#loTitle').value = d.title;
        $('#loText').value = d.text;
        $('#loText').dispatchEvent(new Event('input', { bubbles: true }));
        $('#kchips').innerHTML = chips();
        key.placeholder = d.keys.length ? 'Add another' : 'e.g. Kita, the station';
        if (d.keys.length) $('#kbox').removeAttribute('aria-invalid');
      };
      enhBtn.addEventListener('click', async () => {
        if (ctl) return ctl.abort();
        if (key.value.trim()) addKeys(key.value), (key.value = '');
        if (!d.title.trim() && !d.text.trim() && !d.keys.length) {
          $('#loTitle').focus();
          return toast('Write a title or a few words first, then Enhance.');
        }
        const before = { title: d.title, keys: [...d.keys], text: d.text };
        const context = d.scope === 'lines'
          ? d.lines.map((id) => { const c = character(id); if (c) return `${c.name}${c.tagline ? ` (${c.tagline})` : ''}`; const ix = interchange(id); return ix ? `${ix.title}: ${ix.people.map((p) => p.name).join(', ')}` : ''; }).filter(Boolean)
          : S.characters.slice(0, 8).map((c) => c.name);
        ctl = new AbortController();
        busy(true);
        result('');
        try {
          const out = await enhanceLore({ conn: activeConnection(), entry: before, context, signal: ctl.signal });
          if (!d.title.trim() && out.title) d.title = out.title;
          const had = d.keys.length;
          for (const k of out.keys) if (d.keys.length < 10 && !d.keys.some((x) => x.toLowerCase() === k.toLowerCase())) d.keys.push(k.slice(0, 40));
          if (out.text) d.text = out.text;
          fillUI();
          const added = d.keys.length - had;
          result(`Enhanced the text${added ? ` and added ${added} keyword${added === 1 ? '' : 's'}` : ''}.`);
          $('#loResult').insertAdjacentHTML('beforeend', `<button type="button" class="bp-undo press">Undo</button>${out.demo ? '<small>Demo mode uses a built-in example. Add your AI key for real writing.</small>' : ''}`);
          $('#loResult').classList.toggle('two', !!out.demo);
          $('#loResult .bp-undo').addEventListener('click', () => {
            Object.assign(d, { title: before.title, keys: [...before.keys], text: before.text });
            fillUI();
            result('Undone. The entry is back as it was.');
          });
        } catch (e) {
          if (e.name !== 'AbortError') result(esc(e.message || 'Enhance failed. Nothing changed.'), 'err');
        }
        ctl = null;
        busy(false);
      });

      let leaving = false;
      root.querySelector('.topbar a').addEventListener('click', async (e) => {
        if (leaving || JSON.stringify(d) === pristine) return;
        e.preventDefault();
        if (!(await confirmSheet({ title: 'Discard your changes?', body: 'This entry has unsaved edits.', ok: 'Discard', danger: true }))) return;
        leaving = true;
        location.hash = '#/lore';
      });
      $('#saveLore').addEventListener('click', async () => {
        if (key.value.trim()) addKeys(key.value), (key.value = '');
        if (!d.text.trim()) {
          $('#loText').setAttribute('aria-invalid', 'true');
          $('#loText').focus();
          return toast('Write what the characters should know.', { kind: 'err' });
        }
        if (!d.always && !d.keys.length) {
          $('#kbox').setAttribute('aria-invalid', 'true');
          key.focus();
          return toast('Add at least one keyword, or turn on Always include.', { kind: 'err' });
        }
        if (d.scope === 'lines' && !d.lines.length) return toast('Choose at least one line or group chat, or pick All lines.', { kind: 'err' });
        d.title = d.title.trim();
        await saveLoreEntry(d);
        leaving = true;
        toast(isNew ? 'Added to the Lorebook' : 'Entry saved');
        location.hash = '#/lore';
      });
      $('#delLore')?.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Delete this entry?', body: 'It stops joining your chats. This cannot be undone.', ok: 'Delete', danger: true }))) return;
        await deleteLoreEntry(d.id);
        leaving = true;
        toast('Entry deleted');
        location.hash = '#/lore';
      });
    },
  };
}
