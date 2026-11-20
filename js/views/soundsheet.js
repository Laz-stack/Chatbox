// Sound sheet: ⋯ › Sound in a chat (everything), Depot › Sound (the device-wide parts).
// Now playing, then Ambience (on/off, volume, Auto or a fixed sound for this chat), Music (the
// character's own file, this chat on/off, volume), Signal sounds and vibration.
import { S, saveSettings, saveChat, saveCharacter } from '../store.js';
import { soundPrefs, applyVolumes, ambienceFor, AMB_PRESETS, chatSound, ambienceNow, musicPlaying, musicFor, saveMusic, removeMusic, preview, silence } from '../sound.js';
import { esc } from '../util.js';
import { openSheet, toggleRow, bindSwitch, sw, icon, toast } from '../ui.js';

const savePrefs = (patch) => {
  S.settings.sound = { ...soundPrefs(), ...patch };
  applyVolumes();
  return saveSettings();
};
const canBuzz = typeof navigator.vibrate === 'function';

// ctx: { chat, ch, ix, onChange } in a chat; null from Depot.
export function soundSheet(ctx = null) {
  const { chat, ch, ix } = ctx || {};
  const bars = `<span class="snd-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
  const owner = ch && !ix ? ch : null;
  const nowHTML = () => {
    const amb = ambienceNow();
    const m = chat ? musicFor(chat, ch) : null;
    if (!amb && !(m && musicPlaying())) return '';
    return `<div class="snd-now"><span class="snd-eq">${bars}</span><span><b>${esc(amb || m.name)}</b><small>${amb ? (chat?.amb && chat.amb !== 'auto' ? 'Ambience · set for this chat' : 'Ambience · follows the story') : 'Music'}${amb && m && musicPlaying() ? ` · ${esc(m.name)}` : ''}</small></span></div>`;
  };
  const slider = (id, label, v) => `<div class="snd-sl"><label for="${id}" class="snd-vl">${label}</label><input type="range" id="${id}" min="0" max="1" step="0.05" value="${v}" aria-valuetext="${Math.round(v * 100)} percent"></div>`;
  const chipsHTML = () => {
    const cur = chat?.amb || 'auto';
    return `<div class="snd-chips" role="radiogroup" aria-label="Ambience for this chat">${[['auto', 'Auto'], ...Object.entries(AMB_PRESETS).map(([k, x]) => [k, x.label])].map(([k, l]) => `<button type="button" class="press${cur === k ? ' on' : ''}" role="radio" aria-checked="${cur === k}" data-amb="${k}">${l}</button>`).join('')}</div>`;
  };
  const musicHTML = () => {
    if (!chat) return '';
    const m = owner?.music;
    const own = ix ? chat.music : m;
    return `<h3 class="snd-hd">Music</h3>
      <div class="snd-row"><span class="t"><b>${own?.name ? esc(own.name) : 'No music yet'}</b><small>${own?.name ? (ix ? 'Plays in this chat' : `${esc(owner.name)}’s music · plays in all ${esc(owner.name)}’s chats`) : `An audio file from your phone. It stays on this device.`}</small></span>
        <label class="pill press snd-pick">${own?.name ? 'Change' : `${icon('plus', 15)}Add`}<input type="file" accept="audio/*" class="vh" id="sndFile"></label>${own?.name ? `<button type="button" class="snd-x press" id="sndRm" aria-label="Remove music">${icon('x', 16)}</button>` : ''}</div>
      ${!ix && m?.name ? toggleRow('sndHere', 'Play it in this chat', 'Turn off to keep this chat quiet', !chat.music?.off) : ''}`;
  };
  const html = (p = soundPrefs()) => `<h2 class="sheet-title">Sound</h2>
    <div id="sndNow">${nowHTML()}</div>
    ${toggleRow('sndAmb', 'Ambience', 'Rain, cafés, streets, the sea: from the weather and where the story is', p.amb)}
    ${slider('sndAmbV', 'Ambience volume', p.ambVol)}
    ${chat ? chipsHTML() : ''}
    ${musicHTML()}
    ${chat ? '' : `<h3 class="snd-hd">Music</h3>`}
    ${chat ? '' : toggleRow('sndMus', 'Play music', 'Music you add to a character or a chat', p.music)}
    ${slider('sndMusV', 'Music volume', p.musVol)}
    <h3 class="snd-hd">Signals</h3>
    <div class="snd-row"><span class="t"><b>Signal sounds</b><small>A click when a reply lands, a chime for a new station or chapter</small></span><button type="button" class="pill press" id="sndPlay" aria-label="Play the station chime">${icon('speaker', 15)}Play</button>${sw('sndSfx', p.sfx, 'Signal sounds')}</div>
    ${canBuzz ? toggleRow('sndBuzz', 'Vibrate', 'A short buzz with each signal', p.haptics) : ''}`;

  openSheet({
    label: 'Sound',
    html: `<div id="sndBody">${html()}</div>`,
    onMount(s) {
      const body = s.querySelector('#sndBody');
      const refresh = () => {
        ctx?.onChange?.();
        setTimeout(() => (body.querySelector('#sndNow').innerHTML = nowHTML()), 60);
      };
      const bind = () => {
        bindSwitch(body.querySelector('#sndAmb'), async (on) => {
          await savePrefs({ amb: on });
          if (chat) chatSound(chat, ch);
          else if (!on) silence();
          refresh();
        });
        if (body.querySelector('#sndMus')) bindSwitch(body.querySelector('#sndMus'), async (on) => {
          await savePrefs({ music: on });
          if (chat) chatSound(chat, ch);
          refresh();
        });
        bindSwitch(body.querySelector('#sndSfx'), async (on) => {
          await savePrefs({ sfx: on });
          if (on) preview('station');
        });
        const buzz = body.querySelector('#sndBuzz');
        if (buzz) bindSwitch(buzz, (on) => savePrefs({ haptics: on }).then(() => on && navigator.vibrate?.([18, 60, 18])));
        const here = body.querySelector('#sndHere');
        if (here)
          bindSwitch(here, async (on) => {
            chat.music = on ? null : { off: true };
            await saveChat(chat, false);
            chatSound(chat, ch);
            refresh();
          });
        for (const [id, k] of [['#sndAmbV', 'ambVol'], ['#sndMusV', 'musVol']]) {
          const el = body.querySelector(id);
          el.addEventListener('input', () => {
            S.settings.sound = { ...soundPrefs(), [k]: +el.value };
            el.setAttribute('aria-valuetext', `${Math.round(el.value * 100)} percent`);
            applyVolumes();
          });
          el.addEventListener('change', () => saveSettings());
        }
        body.querySelector('#sndFile')?.addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const m = await saveMusic(f);
            const target = ix ? chat : owner;
            const old = target.music?.key;
            target.music = m;
            if (ix) await saveChat(chat, false);
            else {
              await saveCharacter(owner);
              if (chat.music?.off) (chat.music = null), await saveChat(chat, false);
            }
            if (old) removeMusic(old);
            if (!soundPrefs().music) await savePrefs({ music: true });
            chatSound(chat, ch);
            redraw();
            toast(`Playing ${m.name}`);
          } catch (err) {
            toast(err.message, { kind: 'err' });
          }
        });
        body.querySelector('#sndRm')?.addEventListener('click', async () => {
          const target = ix ? chat : owner;
          removeMusic(target.music?.key);
          target.music = null;
          ix ? await saveChat(chat, false) : await saveCharacter(owner);
          chatSound(chat, ch);
          redraw();
        });
      };
      const redraw = () => {
        body.innerHTML = html();
        bind();
        refresh();
      };
      bind();
      body.addEventListener('click', async (e) => {
        if (e.target.closest('#sndPlay')) {
          preview('station');
          if (!soundPrefs().sfx) toast('That’s the station chime. Turn on Signal sounds to hear it in chats.');
          return;
        }
        const a = e.target.closest('[data-amb]');
        if (!a || !chat) return;
        chat.amb = a.dataset.amb;
        await saveChat(chat, false);
        body.querySelectorAll('[data-amb]').forEach((b) => (b.classList.toggle('on', b === a), b.setAttribute('aria-checked', b === a)));
        if (!soundPrefs().amb) {
          await savePrefs({ amb: true });
          body.querySelector('#sndAmb')?.setAttribute('aria-checked', 'true');
          body.querySelector('#sndAmb')?.classList.add('on');
        }
        chatSound(chat, ch);
        refresh();
      });
    },
  });
}
export { ambienceFor };
