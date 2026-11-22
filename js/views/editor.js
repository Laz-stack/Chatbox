import { S, character, blankCharacter, takeDraft, saveCharacter, deleteCharacter, setHidden, getChat, connection, LINE_COLORS, newChat, saveChat } from '../store.js';
import { ttsSupported, voices } from '../tts.js';
import { voiceSheet } from './voicesheet.js';
import { esc, resizeImage, download, slug, motion } from '../util.js';
import { avatarTile, avatarSVG, PRESETS, PRESET_KEYS, EXPRESSIONS } from '../avatar.js';
import { windowSheet, soundsLikeName } from '../scenepicker.js';
import { exportCardPng, exportCardJson } from '../cards.js';
import { blueprintHTML, bindBlueprint } from './blueprint-ui.js';
import { topbar, ibtn, field, area, group, row, toggleRow, bindSwitch, bullet, icon, arrow, openSheet, openMenu, toast, confirmSheet } from '../ui.js';

const winLabel = (d) => `${d.win === 'sign' ? 'Sign only' : 'Card picture'} · sounds like ${soundsLikeName(d.scene).toLowerCase()}`;

const COLOR_NAMES = { '#2EAA67': 'Green', '#FB4DAA': 'Pink', '#FE6500': 'Orange', '#B8ACFE': 'Lilac', '#065BFE': 'Blue', '#12A5A5': 'Teal', '#5BC2F2': 'Sky', '#8A5530': 'Brown', '#ECECEC': 'Silver' };

export function editorView(id) {
  const isNew = id === 'new';
  const fromDraft = isNew ? takeDraft() : null;
  const src = isNew ? fromDraft || blankCharacter() : character(id);
  if (!src) return null;
  const d = structuredClone(src);
  let autoLetter = !d.line.letter || d.line.letter === (d.name?.[0] || '').toUpperCase();

  const exprRow = () =>
    d.avatarImage
      ? `<p class="fhint" style="margin:0">Expressions work with the drawn avatars. Uploaded pictures stay the same in every mood.</p>`
      : `<div style="display:flex;justify-content:space-between">${EXPRESSIONS.map(
          (x, i) => `<span style="display:flex;flex-direction:column;align-items:center;gap:8px;animation:popIn .4s var(--out) ${0.04 * i}s both">${avatarTile(d, 74, { expr: x, radius: 20 })}<span class="small" style="text-transform:capitalize">${x}</span></span>`
        ).join('')}</div>`;

  const voiceLabel = () => {
    const v = d.voice;
    const name = v?.uri ? voices().find((x) => x.voiceURI === v.uri)?.name || (voices().length ? 'Not on this device (default used)' : 'Saved voice') : 'Default (narrator)';
    return v && (v.pitch !== 1 || v.rate !== 1) ? `${name} · pitch ${(+v.pitch).toFixed(1)} · speed ${(+v.rate).toFixed(1)}` : name;
  };
  const connLabel = () => {
    const c = d.connectionId && connection(d.connectionId);
    return c ? `${esc(c.name || c.provider)} · ${esc(c.model)}` : 'Use the active connection';
  };

  const html = `<div class="screen no-tab">
    ${topbar({
      back: isNew ? '#/' : `#/chat/${d.id}`,
      backIcon: 'x',
      backLabel: 'Close without saving',
      title: isNew ? 'New character' : 'Character card',
      right: isNew ? '' : ibtn('download', 'Export this card', { id: 'exportBtn' }),
    })}
    <div class="stack" style="gap:16px">
      <div style="display:flex;gap:16px;align-items:center">
        <div style="position:relative;flex:none">
          <button type="button" class="avbtn press" id="avBtn" aria-label="Change picture"><span id="heroAv">${avatarTile(d, 112, { radius: 30, rot: -3 })}</span><span class="cam">${icon('cam', 19)}</span></button>
          <span id="heroBullet" style="position:absolute;left:-8px;top:-8px;pointer-events:none">${bullet(esc(d.line.letter || '?'), d.line.color, null, 40, 'box-shadow:0 0 0 4px var(--bg)')}</span>
        </div>
        <div class="stack" style="flex:1;min-width:0;gap:10px">
          ${field('fName', 'Name', d.name, { ph: 'Their name', attrs: 'maxlength="60" autocomplete="off"' })}
          ${field('fTag', 'Tagline', d.tagline, { ph: 'A few words about them', attrs: 'maxlength="80" autocomplete="off"' })}
        </div>
      </div>
      <div class="field"><div class="flabel"><span>Line</span><span class="small">The letter and colour on the bullet</span></div>
        <div style="display:flex;gap:12px;align-items:center">
          <input class="input" id="fLetter" value="${esc(d.line.letter)}" maxlength="2" aria-label="Line letter" style="width:64px;text-align:center;font-weight:800;font-size:20px;flex:none">
          <div class="swatches" id="swatches" role="group" aria-label="Line colour">${LINE_COLORS.map((c) => `<button type="button" class="swatch press" data-c="${c}" aria-label="${COLOR_NAMES[c] || c}" title="${COLOR_NAMES[c] || c}" aria-pressed="${c === d.line.color}">${bullet('', c, null, 32)}</button>`).join('')}</div>
        </div>
      </div>
      ${blueprintHTML(d)}
      ${area('fFirst', 'First message', d.firstMessage, { rows: 3, ph: 'How they open the chat. *Actions* go in asterisks.' })}
      ${d.greetings?.length ? `<p class="fhint">Plus ${d.greetings.length} more opening${d.greetings.length === 1 ? '' : 's'} from the imported card. In a new chat, swipe the first message to pick one.</p>` : ''}
      <div id="exprSec"${d.avatarImage ? ' hidden' : ''}><div class="hrow"><h2 class="h">Expressions</h2><span class="small">Swap with the reply's mood</span></div><div id="exprRow">${exprRow()}</div></div>
      <div class="hrow"><h2 class="h">In chat</h2><span class="small">Window, connection and voice</span></div>
      ${group(
        row({ id: 'sceneRow', lead: `<span class="row-ic" style="overflow:hidden;background:var(--plate2)" id="sceneThumb">${icon('image', 19)}</span>`, title: 'Window', sub: `<span id="sceneName">${winLabel(d)}</span>` }),
        row({ id: 'connRow', ic: 'link', bc: 'var(--plate2)', fc: 'var(--cream)', title: 'Connection', sub: `<span id="connName">${connLabel()}</span>` }),
        ...(ttsSupported ? [row({ id: 'voiceRowE', ic: 'speaker', bc: 'var(--plate2)', fc: 'var(--cream)', title: 'Voice', sub: `<span id="voiceNameE">${esc(voiceLabel())}</span>` })] : [])
      )}
      <div>${toggleRow('tGlobal', 'Use global prompt', 'Turn off to send only this card', d.useGlobal !== false)}${toggleRow('tStream', 'Stream replies', 'Words appear as they are written', d.stream !== false)}</div>
      ${isNew ? '' : `<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap"><button type="button" class="btn-text press" id="hideBtn">${icon(d.hidden ? 'eye' : 'eyeoff', 18)}${d.hidden ? 'Show on Lines' : 'Hide character'}</button><button type="button" class="btn-text danger press" id="delBtn">${icon('trash', 18)}Delete character</button></div>`}
    </div>
    <div class="sticky-cta">${`<button type="button" class="btn-primary press" id="saveBtn"><span>${isNew ? 'Create character' : 'Save character'}</span>${arrow(30)}</button>`}</div>
  </div>`;

  // Voice: which of the phone's voices reads this character, at what pitch and speed.
  function $voiceHook(root) {
    root.querySelector('#voiceRowE')?.addEventListener('click', () =>
      voiceSheet(d, {
        onSave: (v) => {
          d.voice = v;
          root.querySelector('#voiceNameE').textContent = voiceLabel();
        },
      })
    );
  }
  function mount(root) {
    $voiceHook(root);
    // Arriving with a character written from a picture: start at the name.
    if (fromDraft) setTimeout(() => root.querySelector('#fName')?.focus(), 350);
    const $ = (s) => root.querySelector(s);
    // A character written from a picture isn't saved yet: leaving asks first.
    const pristine = fromDraft ? '' : JSON.stringify(d);
    let leaving = false;
    root.querySelector('.topbar a').addEventListener('click', async (e) => {
      if (leaving || JSON.stringify(d) === pristine) return;
      e.preventDefault();
      const href = e.currentTarget.getAttribute('href');
      if (!(await confirmSheet({ title: 'Discard your changes?', body: isNew ? 'This character has not been created yet.' : `Your edits to ${esc(d.name || 'this character')} have not been saved.`, ok: 'Discard', danger: true }))) return;
      leaving = true;
      location.hash = href;
    });
    const paintBullet = () => ($('#heroBullet').innerHTML = bullet(esc(d.line.letter || (d.name?.[0] || '?').toUpperCase()), d.line.color, null, 40, 'box-shadow:0 0 0 4px var(--bg)'));
    const paintAv = () => {
      $('#heroAv').innerHTML = avatarTile(d, 112, { radius: 30, rot: -3 });
      motion($('#heroAv').firstElementChild, [{ transform: 'scale(.9) rotate(-8deg)', opacity: 0.6 }, { transform: 'rotate(-3deg)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
      $('#exprRow').innerHTML = exprRow();
      $('#exprSec').hidden = !!d.avatarImage;
    };
    const count = () => {
      const n = $('#fPersona').value.length;
      const c = $('#cPersona');
      c.textContent = `${n.toLocaleString()} / 6,000`;
      c.classList.toggle('over', n > 6000);
    };
    count();

    $('#fName').addEventListener('input', (e) => {
      d.name = e.target.value;
      if (autoLetter) {
        d.line.letter = (d.name.trim()[0] || '').toUpperCase();
        $('#fLetter').value = d.line.letter;
      }
      paintBullet();
    });
    $('#fLetter').addEventListener('input', (e) => {
      d.line.letter = e.target.value.toUpperCase();
      e.target.value = d.line.letter;
      autoLetter = !d.line.letter;
      paintBullet();
    });
    $('#fTag').addEventListener('input', (e) => (d.tagline = e.target.value));
    $('#fPersona').addEventListener('input', (e) => ((d.persona = e.target.value), count()));
    bindBlueprint(root, d, {
      onName(n) {
        d.name = n || '';
        $('#fName').value = d.name;
        if (autoLetter) {
          d.line.letter = (d.name.trim()[0] || '').toUpperCase();
          $('#fLetter').value = d.line.letter;
        }
        paintBullet();
      },
    });
    $('#fFirst').addEventListener('input', (e) => (d.firstMessage = e.target.value));
    $('#swatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      d.line.color = b.dataset.c;
      root.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', x === b));
      motion(b.firstElementChild, [{ transform: 'scale(.85)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' });
      paintBullet();
      paintAv();
    });
    bindSwitch($('#tGlobal'), (v) => (d.useGlobal = v));
    bindSwitch($('#tStream'), (v) => (d.stream = v));

    $('#avBtn').addEventListener('click', () =>
      openSheet({
        label: 'Picture',
        html: `<h2 class="sheet-title">Picture</h2><p class="sheet-p">Pick a drawn avatar (it changes expression with the mood) or upload your own image.</p>
        <div class="grid3" id="pgrid">${PRESET_KEYS.map((k) => `<button type="button" class="pick press" data-p="${k}" aria-pressed="${!d.avatarImage && d.preset === k}"><span class="thumb">${avatarSVG(k, 120, 'happy', d.line.color)}<span class="check"><span class="bullet" style="width:24px;height:24px;background:var(--yellow);color:var(--bg)">${icon('check', 13)}</span></span></span><span class="nm">${PRESETS[k].name}</span></button>`).join('')}</div>
        <div class="stack" style="margin-top:18px;gap:10px"><label class="btn-primary plate press" style="cursor:pointer"><span>Upload an image</span>${icon('upload', 22)}<input type="file" accept="image/*" id="upl" class="vh"></label>${d.avatarImage ? `<button type="button" class="btn-text danger press" id="rmImg" style="align-self:center">${icon('trash', 18)}Remove uploaded image</button>` : ''}</div>`,
        onMount(s, close) {
          s.querySelector('#pgrid').addEventListener('click', (e) => {
            const b = e.target.closest('[data-p]');
            if (!b) return;
            d.preset = b.dataset.p;
            d.avatarImage = null;
            paintAv();
            close();
          });
          s.querySelector('#upl').addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            try {
              d.avatarImage = await resizeImage(f, 1024, { area: true });
              paintAv();
              close();
            } catch {
              toast('That image could not be read.', { kind: 'err' });
            }
          });
          s.querySelector('#rmImg')?.addEventListener('click', () => {
            d.avatarImage = null;
            paintAv();
            close();
          });
        },
      })
    );

    $('#sceneRow').addEventListener('click', () =>
      windowSheet({
        value: { win: d.win, scene: d.scene },
        pic: d.avatarImage,
        name: d.name || 'this character',
        letter: d.line?.letter,
        color: d.line?.color || '#0A0A0A',
        onSave(v) {
          Object.assign(d, { win: v.win, scene: v.scene });
          $('#sceneName').textContent = winLabel(d);
        },
      })
    );


    $('#connRow').addEventListener('click', (e) =>
      openMenu(e.currentTarget, [
        { icon: 'check', label: 'Use the active connection', on: () => ((d.connectionId = null), ($('#connName').innerHTML = connLabel())) },
        ...S.connections.map((c) => ({ icon: 'link', label: `${c.name || c.provider} · ${c.model}`, on: () => ((d.connectionId = c.id), ($('#connName').innerHTML = connLabel())) })),
      ])
    );

    $('#exportBtn')?.addEventListener('click', (e) =>
      openMenu(e.currentTarget, [
        { icon: 'image', label: 'Export as PNG card', on: async () => download(await exportCardPng(d), slug(d.name) + '.card.png') },
        { icon: 'file', label: 'Export as JSON', on: () => download(exportCardJson(d), slug(d.name) + '.card.json') },
      ])
    );

    // Hide: off Platform and Lines with all their chats; Lines › All › Hidden brings them back.
    $('#hideBtn')?.addEventListener('click', async () => {
      const on = !character(d.id)?.hidden;
      await setHidden('char', d.id, on);
      d.hidden = on || undefined;
      toast(on ? `${d.name} hidden · find them under Lines › All › Hidden` : `${d.name} is back on Lines`);
      location.hash = '#/lines/all';
    });

    $('#delBtn')?.addEventListener('click', async () => {
      if (!(await confirmSheet({ title: `Delete ${esc(d.name)}?`, body: 'This removes the character and the whole chat. It cannot be undone.', ok: 'Delete', danger: true }))) return;
      await deleteCharacter(d.id);
      toast(`${d.name} deleted`);
      location.hash = '#/';
    });

    $('#saveBtn').addEventListener('click', async () => {
      d.name = d.name.trim();
      if (!d.name) {
        $('#fName').focus();
        motion($('#fName'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
        return toast('Give your character a name.');
      }
      if (!d.line.letter) d.line.letter = d.name[0].toUpperCase();
      d.tagline = d.tagline.trim();
      await saveCharacter(d);
      if (isNew) await saveChat(newChat(d.id));
      else {
        // If the chat has not started, refresh its opening line.
        const chat = await getChat(d.id);
        if (!chat.messages.some((m) => m.role === 'user')) {
          const fresh = newChat(d.id, chat.id);
          fresh.notes = chat.notes;
          await saveChat(fresh, false);
        }
      }
      location.hash = `#/chat/${d.id}`;
    });
  }

  return { html, depth: isNew ? 1 : 2, mount };
}
