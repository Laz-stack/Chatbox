import { S, activeConnection, saveSettings, savePersona, personaById, newPersona, savePersonaEntry, setDefaultPersona, deletePersona, snapshot, restore, saveCharacter, newChat, saveChat, isPersistent } from '../store.js';
import { readCardFile, exportAllCardsJson } from '../cards.js';
import { esc, download, resizeImage } from '../util.js';
import { avatarTile, avatarSVG, PRESETS, PRESET_KEYS } from '../avatar.js';
import { ttsSupported, voices, speak } from '../tts.js';
import { title2, topbar, group, row, sw, bindSwitch, field, area, toggleRow, bullet, icon, arrow, tabbar, openSheet, openMenu, toast, confirmSheet } from '../ui.js';

// Import character cards (PNG or JSON) from a file input; used on Home and on Backup.
export async function importCardFiles(input) {
  const added = [];
  for (const f of input.files) {
    try {
      const r = await readCardFile(f);
      for (const ch of [].concat(r)) {
        await saveCharacter(ch);
        await saveChat(newChat(ch.id));
        added.push(ch);
      }
    } catch (err) {
      toast(`${f.name}: ${err.message}`, { kind: 'err', ms: 5000 });
    }
  }
  input.value = '';
  if (added.length === 1) {
    toast(`${added[0].name} imported`);
    location.hash = `#/edit/${added[0].id}`;
  } else if (added.length) {
    toast(`${added.length} characters imported`);
    if (location.hash === '#/' || !location.hash) dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

const LENGTHS = { short: 'Short', normal: 'Normal', long: 'Long' };
const styleSummary = () => {
  const rs = S.settings.replyStyle || {};
  return `${LENGTHS[rs.length] || 'Normal'} length · ${rs.person === 'first' ? 'first person' : rs.person === 'third' ? 'third person' : 'point of view as written'}`;
};
// How characters write: length and point of view. "Normal" leaves it to your prompts.
function replyStyleSheet(onDone) {
  const rs = { length: 'normal', person: 'written', ...(S.settings.replyStyle || {}) };
  const seg = (name, opts) =>
    `<div class="seg ${opts.length === 3 ? 'three' : 'two'}" role="group" aria-label="${name}">${opts
      .map(([k, b, sub]) => `<button type="button" class="press" data-${name}="${k}" aria-pressed="${rs[name] === k}"><b>${b}</b><span>${sub}</span></button>`)
      .join('')}</div>`;
  openSheet({
    label: 'Reply style',
    html: `<h2 class="sheet-title">Reply style</h2><p class="sheet-p">Applies to every chat. Normal and As written leave it to your prompts and characters.</p>
      <div class="field"><div class="flabel"><span>Length</span></div>${seg('length', [['short', 'Short', 'A few sentences'], ['normal', 'Normal', 'As prompted'], ['long', 'Long', 'Rich, detailed']])}</div>
      <div class="field" style="margin-top:16px"><div class="flabel"><span>Point of view</span></div>${seg('person', [['written', 'As written', 'Follow the character'], ['third', 'Third', '“She smiles.”'], ['first', 'First', '“I smile.”']])}</div>
      <p class="fhint" style="margin-top:10px">Carriage scenes always use a narrator, so point of view applies to one-on-one chats and turns.</p>`,
    onMount(sh) {
      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-length],[data-person]');
        if (!b) return;
        const key = b.dataset.length ? 'length' : 'person';
        rs[key] = b.dataset[key];
        sh.querySelectorAll(`[data-${key}]`).forEach((x) => x.setAttribute('aria-pressed', x === b));
        S.settings.replyStyle = { ...rs };
        saveSettings();
        onDone?.();
      });
    },
  });
}

const matureSub = () => (S.settings.mature ? 'On · explicit scenes allowed, adults only' : 'Off · stories fade to black');

export function settingsView() {
  const conn = activeConnection();
  const v = ttsSupported ? voices().find((x) => x.voiceURI === S.settings.voiceURI) : null;
  const html = `<div class="screen">
    ${title2('Depot', 'Your setup')}
    <a class="rider press" href="#/persona" style="margin-top:16px">${avatarTile(S.persona, 62, { radius: 18, rot: -3 })}<span class="nm">${esc(S.persona.name || 'You')}<small>${S.personas.length > 1 ? `Default · ${S.personas.length} personas` : 'Your persona in every chat'}</small></span>${bullet(arrow(20, '#ECECEC'), '#0A0A0A', '#ECECEC', 44)}</a>
    <h2 class="sec">AI</h2>
    ${group(
      row({ href: '#/connections', ic: 'link', title: 'Connections', sub: conn ? `${esc(conn.name)} · ${esc(conn.provider === 'demo' ? 'demo replies' : conn.model)}` : 'None yet' }),
      row({ href: '#/lore', ic: 'book', bc: 'var(--orange)', fc: '#0A0A0A', title: 'Lorebook', sub: !S.lore.length ? 'World info for your chats' : S.lore.length === 1 ? `1 entry · ${S.lore[0].on ? 'on' : 'off'}` : `${S.lore.filter((e) => e.on).length} of ${S.lore.length} entries on` }),
      row({ href: '#/prompts', ic: 'file', bc: 'var(--red)', fc: '#fff', title: 'Prompts', sub: `Global ${S.settings.globalOn ? 'on' : 'off'} · ${S.connections.filter((c) => c.prompt?.trim()).length} connection prompt${S.connections.filter((c) => c.prompt?.trim()).length === 1 ? '' : 's'}` })
    )}
    <h2 class="sec">Chat</h2>
    ${group(
      row({ id: 'styleRow', ic: 'sliders', bc: 'var(--pink)', fc: '#0A0A0A', title: 'Reply style', sub: `<span id="styleSub">${styleSummary()}</span>` }),
      `<div class="row">${'<span class="row-ic" style="background:var(--green2);color:#0A0A0A">' + icon('spark', 19) + '</span>'}<span class="row-tx"><span class="row-t">Auto-summary</span><span class="row-s">Condense long chats so they keep fitting</span></span>${sw('tAuto', S.settings.autoSummary, 'Auto-summary')}</div>`,
      `<div class="row"><span class="row-ic" style="background:var(--lilac);color:#0A0A0A">${icon('layers', 19)}</span><span class="row-tx"><span class="row-t">Token counter</span><span class="row-s">Show the estimate in the chat header</span></span>${sw('tCounter', S.settings.showCounter, 'Token counter')}</div>`,
      ttsSupported
        ? `<div class="row"><span class="row-ic" style="background:var(--pink);color:#0A0A0A">${icon('speaker', 19)}</span><span class="row-tx"><span class="row-t">Read replies aloud</span><span class="row-s">Uses your browser’s voices</span></span>${sw('tRead', S.settings.readAloud, 'Read replies aloud')}</div>` +
            row({ id: 'voiceRow', ic: 'user', bc: 'var(--plate2)', fc: 'var(--cream)', title: 'Voice', sub: `<span id="voiceName">${esc(v?.name || 'Browser default')}</span>` })
        : ''
    )}
    <h2 class="sec">Content</h2>
    ${group(
      `<div class="row"><span class="row-ic" style="background:var(--plate2);color:var(--cream)">${icon('shield', 19)}</span><span class="row-tx"><span class="row-t">18+ content</span><span class="row-s" id="matureSub">${matureSub()}</span></span>${sw('tAdult', S.settings.mature, '18+ content')}</div>`
    )}
    <h2 class="sec">Data</h2>
    ${group(row({ href: '#/backup', ic: 'box', bc: 'var(--blue)', fc: '#fff', title: 'Backup and cards', sub: S.settings.lastBackup ? `Last backup ${new Date(S.settings.lastBackup).toLocaleDateString()}` : 'No backup yet' }))}
    <div class="note" style="margin-top:18px">${icon('shield', 18)}<span>${isPersistent() ? 'Everything is saved in this browser only. Nothing goes to a server of ours.' : 'This browser is blocking storage (private mode?), so changes will be lost when you close the tab.'}</span></div>
  </div>${tabbar('settings')}`;
  return {
    html,
    depth: 0,
    mount(root) {
      root.querySelector('#styleRow')?.addEventListener('click', () => replyStyleSheet(() => (root.querySelector('#styleSub').textContent = styleSummary())));
      const tAdult = root.querySelector('#tAdult');
      bindSwitch(tAdult, async (on) => {
        if (on) {
          const ok = await confirmSheet({
            title: 'Are you 18 or older?',
            body: 'Turning this on lets characters write explicit adult scenes, if your AI provider allows them, and unlocks Mature details in the Character Builder. Characters are always adults. You can turn it off any time.',
            ok: 'I’m 18 or older, turn it on',
          });
          if (!ok) return tAdult.setAttribute('aria-checked', 'false');
          S.settings.ageConfirmedAt = Date.now();
        }
        S.settings.mature = on;
        await saveSettings();
        root.querySelector('#matureSub').textContent = matureSub();
        toast(on ? '18+ content is on' : '18+ content is off. Stories fade to black.');
      });
      bindSwitch(root.querySelector('#tAuto'), (x) => ((S.settings.autoSummary = x), saveSettings()));
      bindSwitch(root.querySelector('#tCounter'), (x) => ((S.settings.showCounter = x), saveSettings()));
      bindSwitch(root.querySelector('#tRead'), (x) => ((S.settings.readAloud = x), saveSettings()));
      root.querySelector('#voiceRow')?.addEventListener('click', (e) => {
        const list = voices().filter((x) => /^en|^id/i.test(x.lang)).slice(0, 14);
        const all = list.length ? list : voices().slice(0, 14);
        openMenu(e.currentTarget, [
          { icon: 'check', label: 'Browser default', on: () => pick(null) },
          ...all.map((x) => ({ icon: 'speaker', label: `${x.name} (${x.lang})`, on: () => pick(x) })),
        ]);
        function pick(x) {
          S.settings.voiceURI = x?.voiceURI || '';
          saveSettings();
          root.querySelector('#voiceName').textContent = x?.name || 'Browser default';
          speak('Hello! This is how I sound.');
        }
      });
    },
  };
}

// Everyone you can play. The default is used in every chat that hasn't picked someone else.
export function personasView() {
  const used = (id) => [...S.chats.values()].filter((c) => c.personaId === id).length;
  const card = (p) => {
    const def = p.id === S.persona.id;
    const n = used(p.id);
    const about = p.about?.trim().slice(0, 60);
    const sub = def ? about || 'Used in every chat' : [n ? `In ${n} chat${n === 1 ? '' : 's'}` : 'Not in any chat yet', about].filter(Boolean).join(' · ');
    return `<a class="rider prow press" href="#/persona/${p.id}">${avatarTile(p, 56, { radius: 16, rot: -3 })}<span class="nm">${esc(p.name || 'You')}<small>${esc(sub)}</small></span>${def ? '<span class="def-chip">Default</span>' : ''}${icon('chev', 20)}</a>`;
  };
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/settings', right: `<a class="ibtn yellow press" href="#/persona/new" aria-label="New persona">${icon('plus')}</a>` })}
    ${title2('Riders', 'Your personas')}
    <p class="lore-intro">Each chat uses your default persona unless you pick another from the chat's menu.</p>
    <div class="plist">${S.personas.map(card).join('')}</div>
    <a class="dashed press" href="#/persona/new" style="margin-top:12px">${icon('plus', 20)}New persona</a>
  </div>`;
  return { html, depth: 1 };
}

export function personaView(id = S.persona.id) {
  const isNew = id === 'new';
  const src = isNew ? newPersona() : personaById(id);
  if (!src) return null;
  const d = structuredClone(src);
  const wasDefault = !isNew && d.id === S.persona.id;
  let makeDefault = wasDefault;
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/persona', title: isNew ? 'New persona' : 'Persona', right: !isNew && S.personas.length > 1 ? `<button type="button" class="ibtn press" id="delP" aria-label="Delete persona">${icon('trash')}</button>` : '' })}
    <div class="stack" style="gap:16px">
      <div class="pcard">
        <span class="deco">${arrow(170, '#0A0A0A', 90)}</span>
        <div class="top"><button type="button" class="avbtn press" id="avBtn" aria-label="Change picture"><span id="pAv">${avatarTile(d, 96, { radius: 26, rot: -3 })}</span><span class="cam">${icon('cam', 18)}</span></button><span id="pBullet">${bullet(esc((d.name || 'Y')[0].toUpperCase()), d.color || '#065BFE', null, 44)}</span></div>
        <div class="who"><span id="pName">${esc(d.name || 'You')}</span><small>How characters see you</small></div>
      </div>
      ${field('pNameIn', 'Name', d.name, { ph: 'What characters call you', attrs: 'maxlength="40" autocomplete="off"' })}
      ${area('pAbout', 'About you', d.about, { rows: 4, ph: 'A quiet student who studies at the cafe by the window…', right: '<span class="counter" id="pCount"></span>' })}
      <div class="${wasDefault ? 'locked-row' : ''}">${toggleRow('tDefault', 'Default persona', wasDefault ? 'This is your default. To change it, open another persona and make it the default.' : 'Make this who you are in every chat that hasn’t picked someone else.', makeDefault)}</div><div>
      ${toggleRow('tEvery', 'Tell characters about me', 'Send your name and description with each reply.', d.useEverywhere)}</div>
    </div>
    <div class="sticky-cta"><button type="button" class="btn-primary press" id="saveBtn"><span>${isNew ? 'Add persona' : 'Save persona'}</span>${arrow(30)}</button></div>
  </div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const cnt = () => ($('#pCount').textContent = `${$('#pAbout').value.length.toLocaleString()} / 1,000`);
      cnt();
      $('#pNameIn').addEventListener('input', (e) => {
        d.name = e.target.value;
        $('#pName').textContent = d.name || 'You';
        $('#pBullet').innerHTML = bullet(esc((d.name || 'Y')[0].toUpperCase()), d.color || '#065BFE', null, 44);
      });
      $('#pAbout').addEventListener('input', (e) => ((d.about = e.target.value), cnt()));
      bindSwitch($('#tEvery'), (v) => (d.useEverywhere = v));
      // The default can't be switched off here; another persona takes over by becoming the default.
      if (wasDefault) $('#tDefault').setAttribute('aria-disabled', 'true');
      else bindSwitch($('#tDefault'), (v) => (makeDefault = v));
      $('#delP')?.addEventListener('click', async () => {
        if (wasDefault) return toast('This is your default. Make another persona the default first.', { kind: 'err' });
        const n = [...S.chats.values()].filter((c) => c.personaId === d.id).length;
        if (!(await confirmSheet({ title: `Delete ${esc(d.name || 'this persona')}?`, body: n ? `${n} chat${n === 1 ? '' : 's'} will switch to your default persona.` : 'No chats use this persona.', ok: 'Delete', danger: true }))) return;
        await deletePersona(d.id);
        toast('Persona deleted');
        location.hash = '#/persona';
      });
      $('#avBtn').addEventListener('click', () =>
        openSheet({
          label: 'Picture',
          html: `<h2 class="sheet-title">Your picture</h2><div class="grid3" id="pg">${PRESET_KEYS.map((k) => `<button type="button" class="pick press" data-p="${k}" aria-pressed="${!d.avatarImage && d.preset === k}"><span class="thumb">${avatarSVG(k, 120, 'happy', d.color || '#065BFE')}</span><span class="nm">${PRESETS[k].name}</span></button>`).join('')}</div><label class="btn-primary plate press" style="margin-top:16px;cursor:pointer"><span>Upload an image</span>${icon('upload', 22)}<input type="file" accept="image/*" id="upl" class="vh"></label>`,
          onMount(s, close) {
            s.querySelector('#pg').addEventListener('click', (e) => {
              const b = e.target.closest('[data-p]');
              if (!b) return;
              d.preset = b.dataset.p;
              d.avatarImage = null;
              $('#pAv').innerHTML = avatarTile(d, 96, { radius: 26, rot: -3 });
              close();
            });
            s.querySelector('#upl').addEventListener('change', async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              d.avatarImage = await resizeImage(f, 512);
              $('#pAv').innerHTML = avatarTile(d, 96, { radius: 26, rot: -3 });
              close();
            });
          },
        })
      );
      $('#saveBtn').addEventListener('click', async () => {
        d.name = d.name.trim();
        if (!d.name && S.personas.length > (isNew ? 0 : 1)) return toast('Give this persona a name so you can tell them apart.', { kind: 'err' });
        await savePersonaEntry(d);
        if (makeDefault && !wasDefault) await setDefaultPersona(d.id);
        toast(isNew ? 'Persona added' : 'Persona saved');
        location.hash = '#/persona';
      });
    },
  };
}

export function backupView() {
  const kb = Math.max(1, Math.round(new Blob([JSON.stringify(snapshot())]).size / 1024));
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/settings', title: 'Backup and cards' })}
    <div class="stack">
      <button type="button" class="exitsign press" id="exportAll"><span class="big">Export<span>everything</span></span>${arrow(78, '#FFFFFF', 135)}<span class="sz num">${kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'}</span></button>
      <div style="display:flex;justify-content:space-between;padding:0 4px" class="small"><span>${S.settings.lastBackup ? 'Last backup ' + new Date(S.settings.lastBackup).toLocaleString() : 'No backup yet'}</span><span>Chats, cards, settings</span></div>
      ${toggleRow('tKeys', 'Include API keys', 'Off by default. Turn on only for a copy you keep to yourself.', S.settings.includeKeysInBackup)}
      <div class="note">${icon('shield', 18)}<span>Everything lives only in this browser. Clearing site data erases it, so export a backup now and then.</span></div>
      <div><div class="hrow"><h2 class="h">Restore</h2></div>
        <label class="drop" id="drop">${bullet(arrow(18, '#0A0A0A', -45), '#FDCD15', '#0A0A0A', 40)}<b>Drop a backup file here</b><span class="pill">Choose file</span><input type="file" accept=".json,application/json" id="restoreIn" class="vh"></label></div>
      <div><div class="hrow"><h2 class="h">Character cards</h2></div>
        ${group(
          `<label class="row press" style="cursor:pointer"><span class="row-ic" style="background:var(--yellow);color:#0A0A0A">${icon('upload', 19)}</span><span class="row-tx"><span class="row-t">Import a card</span><span class="row-s">PNG or JSON from other sites</span></span><span class="row-chev">${icon('chev', 18)}</span><input type="file" accept=".png,.json,image/png,application/json" id="cardIn" class="vh" multiple></label>`,
          row({ id: 'exportCards', ic: 'download', bc: 'var(--cream)', title: 'Export all cards', sub: 'Every character in one JSON file' })
        )}
        <p class="fhint">To export one character as a PNG card, open it and use the export button.</p>
      </div>
      ${toggleRow('tRemind', 'Remind me weekly', 'A small banner on Home when a backup is due', S.settings.remindBackup)}
    </div>
  </div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      bindSwitch($('#tKeys'), (v) => ((S.settings.includeKeysInBackup = v), saveSettings()));
      bindSwitch($('#tRemind'), (v) => ((S.settings.remindBackup = v), saveSettings()));
      $('#exportAll').addEventListener('click', async () => {
        const data = snapshot({ includeKeys: S.settings.includeKeysInBackup });
        download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `chatbox-backup-${new Date().toISOString().slice(0, 10)}.json`);
        S.settings.lastBackup = Date.now();
        await saveSettings();
        toast(S.settings.includeKeysInBackup ? 'Backup downloaded, with API keys' : 'Backup downloaded (API keys left out)');
      });
      $('#exportCards').addEventListener('click', () => download(exportAllCardsJson(), 'chatbox-cards.json'));

      async function doRestore(file) {
        let data;
        try {
          data = JSON.parse(await file.text());
        } catch {
          return toast('That file is not valid JSON.', { kind: 'err' });
        }
        if (data?.app !== 'chatbox') return toast('That is not a Chatbox backup. To add a character, use Import a card.', { kind: 'err' });
        const n = (data.characters || []).length;
        if (!(await confirmSheet({ title: 'Replace everything?', body: `This backup has ${n} character${n === 1 ? '' : 's'}. Restoring replaces all chats, characters and settings in this browser.`, ok: 'Restore', danger: true }))) return;
        try {
          await restore(data);
          toast('Backup restored');
          location.hash = '#/';
        } catch (e) {
          toast(e.message, { kind: 'err' });
        }
      }
      $('#restoreIn').addEventListener('change', (e) => e.target.files[0] && doRestore(e.target.files[0]));
      const drop = $('#drop');
      ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => (e.preventDefault(), drop.classList.add('over'))));
      ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) doRestore(f);
      });

      $('#cardIn').addEventListener('change', (e) => importCardFiles(e.target));
    },
  };
}
