// ⋯ › World map: "You are here", the places as stations on a line (3-column serpentine grid, so
// nothing overlaps), a card for the chosen place with Travel here, and an edit mode (rename,
// scene, remove, add).
import { S, getChat, saveChat, character, interchange, isInterchangeId, connectionFor, personaFor } from '../store.js';
import { MAX_PLACES, MAP_SCENES, mapOn, hereOf, loreFor, makeMap, findHere, addPlace, removePlace, travel, normName } from '../worldmap.js';
import { soundsLikeName } from '../scenepicker.js';
import { esc, inkOn, agoLong } from '../util.js';
import { readLine } from '../chronicle.js';
import { topbar, icon, toast, openSheet } from '../ui.js';

const sceneName = (k) => (k ? soundsLikeName(k) : 'Like the character’s');

export async function worldMapView(id) {
  const chat = await getChat(id);
  if (!chat) return null;
  const ix = isInterchangeId(chat.characterId) ? interchange(chat.characterId) : null;
  const ch = ix ? null : character(chat.characterId);
  if (!ix && !ch) return null;
  const cast = ix ? ix.people : [ch];
  const ids = ix ? [...ix.people.map((p) => p.id), ix.id] : [ch.id];
  const room = ix ? { ...ix.people[0], id: ix.id, connectionId: null } : ch;
  const you = personaFor(chat)?.name?.trim() || 'You';
  let picked = hereOf(chat)?.id || null;
  let editing = false;
  let busy = false;

  const here = () => hereOf(chat);
  const plate = () => {
    const h = here();
    return h
      ? `<div class="wm-here"><small>You are here</small><b>${esc(h.name)}</b>${h.note ? `<p>${esc(h.note)}</p>` : ''}</div>`
      : mapOn(chat)
      ? `<div class="wm-here none"><small>You are here</small><b>Not settled yet</b><p>Travel to a place, or keep playing: the story will place you.</p></div>`
      : '';
  };

  // ---- the line ----
  const map = () => {
    const places = chat.map?.places || [];
    if (!places.length) return '';
    const W = 328;
    const cw = (W - 32) / 3;
    const RH = 92;
    const pos = places.map((p, k) => {
      const r = Math.floor(k / 3);
      const c = r % 2 ? 2 - (k % 3) : k % 3;
      return { p, x: 16 + c * cw + cw / 2, y: 26 + r * RH };
    });
    const H = 26 + (Math.ceil(places.length / 3) - 1) * RH + 56;
    const segs = pos.slice(1).map((b, k) => {
      const a = pos[k];
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="wm-seg${b.p.visited && a.p.visited ? '' : ' faint'}"/>`;
    });
    const h = here();
    const stations = pos
      .map(({ p, x, y }, k) => {
        const cur = h?.id === p.id;
        const usual = p.usual.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
        const label = `${p.name}, ${cur ? 'you are here' : p.visited ? 'visited' : 'not visited yet'}${usual.length ? `, usually ${usual.join(' and ')}` : ''}`;
        return `<button type="button" class="wm-st press${cur ? ' here' : ''}${p.visited ? ' seen' : ''}${picked === p.id ? ' picked' : ''}" style="left:${x}px;top:${y}px;width:${cw}px;animation-delay:${k * 40}ms" data-p="${p.id}" aria-label="${esc(label)}" ${cur ? 'aria-current="location"' : ''} aria-pressed="${picked === p.id}"><i aria-hidden="true"></i><span>${esc(p.name)}</span></button>`;
      })
      .join('');
    return `<div class="wm-map" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${segs.join('')}</svg>${stations}</div>`;
  };

  const card = () => {
    const p = (chat.map?.places || []).find((x) => x.id === picked);
    if (!p) return '';
    const cur = here()?.id === p.id;
    const usual = p.usual.map((id) => cast.find((c) => c.id === id)).filter(Boolean);
    return `<div class="wm-card"><b>${esc(p.name)}</b>${p.note ? `<p>${esc(p.note)}</p>` : ''}
      <div class="wm-meta">${usual.length ? `<span class="wm-k">Usually</span>${usual.map((c) => `<span class="wm-who"><i style="background:${c.line?.color || '#2EAA67'}"></i>${esc(c.name.split(' ')[0])}</span>`).join('')}` : ''}<span class="wm-k">Sounds like</span><span class="wm-tag">${esc(sceneName(p.scene))}</span></div>
      <p class="wm-from">From ${p.from === 'lore' ? 'the lorebook' : p.from === 'story' ? 'the story' : 'you'}</p>
      ${cur ? `<p class="wm-at">You are here</p>` : `<button type="button" class="wm-go press" data-go="${p.id}">${icon('route', 17)}Travel here</button>`}</div>`;
  };

  // The helper reads the recent chat and puts where you are on the map.
  const findBtn = () => `<button type="button" class="wm-make press" id="wmFind">${icon('route', 17)}<span>Find where we are</span></button>`;
  const empty = () => {
    const lore = loreFor(ids).length;
    return `<div class="wm-empty"><b>No map yet</b><p>${lore ? `Chatbox can pick the places out of this story’s lorebook (${lore} entr${lore === 1 ? 'y' : 'ies'}).` : 'Places will appear as the story moves around. You can also add them yourself.'}</p>
      ${chat.messages.length > 1 ? findBtn() : ''}
      ${lore ? `<button type="button" class="wm-make press" id="wmMake">${icon('spark', 17)}Make the map from the lorebook</button>` : ''}
      <button type="button" class="ad-add press" data-addp>${icon('plus', 17)}Add a place</button></div>`;
  };

  const editRows = () =>
    `<section class="ad-board"><h2 class="ad-h"><span>Places</span><span>${chat.map.places.length} of ${MAX_PLACES}</span></h2>
      ${chat.map.places
        .map((p) => `<div class="wm-er"><input class="input" value="${esc(p.name)}" maxlength="40" aria-label="Name of ${esc(p.name)}" data-rename="${p.id}"><button type="button" class="wm-sc press" data-scene="${p.id}" aria-label="What ${esc(p.name)} sounds like: ${esc(sceneName(p.scene))}">${esc(sceneName(p.scene))}</button><button type="button" class="ibtn ghost press" data-rm="${p.id}" aria-label="Remove ${esc(p.name)}">${icon('trash', 18)}</button></div>`)
        .join('')}
      <button type="button" class="ad-add press" data-addp ${chat.map.places.length >= MAX_PLACES ? `disabled aria-describedby="wmFull"` : ''}>${icon('plus', 17)}Add a place</button>
      ${chat.map.places.length >= MAX_PLACES ? `<p class="ad-none" id="wmFull">The map holds ${MAX_PLACES} places. Remove one to add another.${chat.map.suggest?.length ? ` The story also found: ${esc(chat.map.suggest.join(', '))}.` : ''}</p>` : ''}</section>`;

  const body = () => (editing && mapOn(chat) ? editRows() : mapOn(chat) ? `${plate()}${map()}<div id="wmCard">${card()}</div><div class="wm-find">${findBtn()}</div>` : empty());
  const editBtn = () => (mapOn(chat) ? `<button type="button" class="wm-edit press" id="wmEdit" aria-pressed="${editing}">${editing ? 'Done' : 'Edit'}</button>` : '<span class="ibtn-spacer"></span>');

  const html = `<div class="screen no-tab cr-screen">
    ${topbar({ back: `#/chat/${encodeURIComponent(chat.id)}`, right: `<span id="wmEditSlot">${editBtn()}</span>` })}
    <h1 class="t2 cr-t2"><span>World map</span><span class="sub" id="wmSub">${esc(ix ? ix.title : ch.name)}${mapOn(chat) ? ` · ${chat.map.places.length} place${chat.map.places.length === 1 ? '' : 's'}` : ''}</span></h1>
    ${mapOn(chat) ? `<p class="cr-read">${esc(readLine(chat, S.settings, agoLong))}</p>` : ''}
    <div id="wmBody">${body()}</div>
    <p class="vh" aria-live="polite" id="wmSay"></p>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const sub = () => `${ix ? ix.title : ch.name}${mapOn(chat) ? ` · ${chat.map.places.length} place${chat.map.places.length === 1 ? '' : 's'}` : ''}`;
      const redraw = () => {
        $('#wmBody').innerHTML = body();
        $('#wmEditSlot').innerHTML = editBtn();
        root.querySelector('#wmSub').textContent = sub();
      };
      // Listen on this page only (the app container is shared with other screens).
      const page = root.querySelector('.screen');
      page.addEventListener('click', async (e) => {
        const st = e.target.closest('[data-p]');
        const go = e.target.closest('[data-go]');
        const rm = e.target.closest('[data-rm]');
        const sc = e.target.closest('[data-scene]');
        if (e.target.closest('#wmEdit')) return (editing = !editing), redraw();
        if (st) {
          picked = st.dataset.p;
          page.querySelectorAll('[data-p]').forEach((x) => (x.classList.toggle('picked', x === st), x.setAttribute('aria-pressed', x === st)));
          $('#wmCard').innerHTML = card();
          return;
        }
        if (go) {
          const p = chat.map.places.find((x) => x.id === go.dataset.go);
          const m = travel(chat, p, { you, cast });
          chat.messages.push(m);
          await saveChat(chat);
          $('#wmSay').textContent = `Travelling to ${p.name}`;
          location.hash = `#/chat/${encodeURIComponent(chat.id)}`;
          return;
        }
        if (rm) {
          const at = chat.map.places.findIndex((x) => x.id === rm.dataset.rm);
          const wasHere = chat.map.here === rm.dataset.rm;
          const p = removePlace(chat, rm.dataset.rm);
          await saveChat(chat);
          redraw();
          toast(`Removed ${p.name}`, {
            action: 'Undo',
            onAction: async () => {
              chat.map.removed = chat.map.removed.filter((n) => n !== normName(p.name));
              chat.map.places.splice(at, 0, p);
              if (wasHere) chat.map.here = p.id;
              await saveChat(chat);
              redraw();
            },
          });
          return;
        }
        if (sc) return sceneSheet(chat.map.places.find((x) => x.id === sc.dataset.scene));
        if (e.target.closest('[data-addp]')) return addSheet();
        if (e.target.closest('#wmFind')) {
          if (busy) return;
          busy = true;
          const b = $('#wmFind');
          b.classList.add('busy');
          b.disabled = true;
          b.querySelector('span').textContent = 'Reading the chat…';
          try {
            const r = await findHere({ chat, cast, persona: personaFor(chat), conn: connectionFor(room) });
            await saveChat(chat);
            picked = r.here?.id || picked;
            toast(r.here ? `You’re at ${r.here.name}${r.added > 1 ? ` · ${r.added} places added` : ''}` : r.added ? `${r.added} place${r.added === 1 ? '' : 's'} added; where you are now isn’t clear yet.` : 'The chat doesn’t say where you are yet. Add the place yourself, or try again later.');
            dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (err) {
            toast(err.message || 'Could not read the chat.', { kind: 'err' });
            b.classList.remove('busy');
            b.disabled = false;
            b.querySelector('span').textContent = 'Find where we are';
          }
          busy = false;
          return;
        }
        if (e.target.closest('#wmMake')) {
          if (busy) return;
          busy = true;
          const b = $('#wmMake');
          b.classList.add('busy');
          b.disabled = true;
          b.lastChild.textContent = 'Reading the lorebook…';
          try {
            const n = await makeMap({ chat, cast, ids, conn: connectionFor(room) });
            await saveChat(chat);
            picked = hereOf(chat)?.id || chat.map?.places?.[0]?.id || null;
            toast(n ? `${n} places on the map` : 'No places found in the lorebook. Add them yourself, or let the story find them.');
            dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (err) {
            toast(err.message || 'Could not make the map.', { kind: 'err' });
            b.classList.remove('busy');
            b.disabled = false;
            b.lastChild.textContent = 'Make the map from the lorebook';
          }
          busy = false;
        }
      });
      page.addEventListener('change', async (e) => {
        const r = e.target.closest('[data-rename]');
        if (!r || !r.value.trim()) return;
        const p = chat.map.places.find((x) => x.id === r.dataset.rename);
        const name = r.value.trim().slice(0, 40);
        const clash = chat.map.places.find((x) => x !== p && normName(x.name) === normName(name));
        if (!name || clash) {
          r.value = p.name;
          return toast(clash ? `${clash.name} is already on the map.` : 'A place needs a name.');
        }
        // Remember the old name, so the story still finds this place by it.
        if (normName(p.name) !== normName(name)) p.aka = [...new Set([...(p.aka || []), normName(p.name)])];
        p.name = name;
        await saveChat(chat);
      });

      function sceneSheet(p) {
        openSheet({
          label: 'Background',
          html: `<h2 class="sheet-title">What ${esc(p.name)} sounds like</h2><p class="sheet-p">The ambience here when Sound is on Auto.</p><div class="ad-states" role="radiogroup" aria-label="Sounds like" style="flex-wrap:wrap">${['', ...MAP_SCENES].map((k) => `<button type="button" class="press" role="radio" aria-checked="${(p.scene || '') === k}" data-k="${k}">${esc(sceneName(k))}</button>`).join('')}</div>`,
          onMount(s, close) {
            s.addEventListener('click', async (e) => {
              const b = e.target.closest('[data-k]');
              if (!b) return;
              p.scene = b.dataset.k;
              await saveChat(chat);
              close();
              redraw();
            });
          },
        });
      }
      function addSheet() {
        openSheet({
          label: 'Add a place',
          html: `<h2 class="sheet-title">New place</h2>
            <div class="field"><div class="flabel"><label for="wmN">Name</label></div><input class="input" id="wmN" maxlength="40" placeholder="e.g. The archive" autocomplete="off"></div>
            <div class="field" style="margin-top:12px"><div class="flabel"><label for="wmD">What it’s like</label></div><input class="input" id="wmD" maxlength="140" placeholder="One short line" autocomplete="off"></div>
            <button type="button" class="btn-primary press" id="wmAdd" style="margin-top:16px;justify-content:center"><span>Add to the map</span></button>`,
          onMount(s, close) {
            s.querySelector('#wmAdd').addEventListener('click', async () => {
              const name = s.querySelector('#wmN').value.trim();
              if (!name) return s.querySelector('#wmN').focus();
              const p = addPlace(chat, { name, note: s.querySelector('#wmD').value.trim() });
              if (!p) return toast('That place is already on the map, or the map is full.');
              picked = p.id;
              await saveChat(chat);
              close();
              redraw();
            });
          },
        });
      }
    },
  };
}
