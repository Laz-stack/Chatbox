// Route map, Bonds and Diary screens for one chat (see js/chronicle.js for how they are filled).
import { S, getChat, saveChat, saveSettings, character, interchange, isInterchangeId, connectionFor, personaFor, branchChat } from '../store.js';
import { KINDS, BOND_KEYS, chronicle, writeDiary, changeText, unread, trackingOn, sortRoute } from '../chronicle.js';
import { esc, inkOn, agoLong as ago } from '../util.js';
import { topbar, icon, avatarBullet, primary, toggleRow, bindSwitch, toast, confirmSheet } from '../ui.js';

const CREAM = '#ECECEC';

// Everything a screen needs about a chat: its cast, the room for the connection, and your persona.
async function load(id) {
  const chat = await getChat(id);
  if (!chat) return null;
  const ix = isInterchangeId(chat.characterId) ? interchange(chat.characterId) : null;
  const ch = ix ? null : character(chat.characterId);
  if (!ix && !ch) return null;
  const cast = ix ? ix.people : [ch];
  const room = ix ? { ...ix.people[0], id: ix.id, name: ix.title, connectionId: null } : ch;
  return { chat, ix, ch, cast, room, conn: connectionFor(room), persona: personaFor(chat), title: ix ? ix.title : ch.name };
}
const colorOf = (p) => p?.line?.color || '#2EAA67';
const tag = (p, s = 22) => `<span class="cr-tag" style="--c:${colorOf(p)};--ink:${inkOn(colorOf(p))}">${avatarBullet(p, s)}${esc(p.name)}</span>`;
const msgNo = (chat, msgId) => chat.messages.findIndex((m) => m.id === msgId) + 1;
const failText = (e) => (e?.name === 'AbortError' ? '' : e?.message || 'Something went wrong.');

// ================= Route map =================
export async function routeView(id) {
  const c = await load(id);
  if (!c) return null;
  const { chat, ix, cast } = c;
  sortRoute(chat);
  const rail = ix ? CREAM : colorOf(c.ch);
  let open = null;
  let busy = false;

  const stHTML = (s) => {
    const who = cast.find((p) => p.id === s.who);
    const n = msgNo(chat, s.msgId);
    const m = chat.messages[n - 1];
    const isOpen = open === s.id;
    const card = isOpen
      ? `<div class="rt-card"><b>${esc(s.title)}</b>${s.line ? `<p>${esc(s.line)}</p>` : ''}<span class="k">${esc(KINDS[s.kind] || 'Station')} · message ${n}</span>
        <div class="rt-acts"><a class="rt-pill press" href="#/chat/${encodeURIComponent(chat.id)}/m/${encodeURIComponent(s.msgId)}">${icon('chev', 15)}Jump there</a>${!ix ? `<button type="button" class="rt-pill press" data-branch="${esc(s.id)}">${icon('track', 15)}Branch from here</button>` : ''}</div>
        <button type="button" class="rt-rm press" data-rm="${esc(s.id)}">Remove from map</button></div>`
      : '';
    return `<li class="rt-st${isOpen ? ' open' : ''}" style="--m:${ix && who ? colorOf(who) : CREAM}">
      <button type="button" class="rt-hit press" data-st="${esc(s.id)}" aria-expanded="${isOpen}" aria-label="${esc(s.title)}"><span class="rt-dot" aria-hidden="true"></span>
        <b>${esc(s.title)}</b>${s.line && !isOpen ? `<span class="rt-line">${esc(s.line)}</span>` : ''}<small>${esc(KINDS[s.kind] || 'Station')} · message ${n}${m && n === chat.messages.length ? ' · latest' : ''}</small></button>${card}</li>`;
  };
  const listHTML = () =>
    chat.route.length
      ? `<ol class="rt" style="--c:${rail}">${chat.route.map(stHTML).join('')}</ol>`
      : `<ol class="rt empty" style="--c:${rail}"><li class="rt-st start"><span class="rt-hit"><span class="rt-dot" aria-hidden="true"></span><b>Start</b><span class="rt-line">Stations appear as the story turns: a first meeting, a secret, a fight, a new place.</span></span></li></ol>`;
  const btnText = () => (!chat.route.some((s) => s.auto) && !chat.chron?.whole && chat.messages.length > 2 ? 'Read the story so far' : unread(chat) > 0 ? 'Update the map' : 'Map is up to date');
  const sub = () => `${esc(c.title)} · ${chat.route.length} station${chat.route.length === 1 ? '' : 's'}`;

  const html = `<div class="screen no-tab cr-screen">
    ${topbar({ back: `#/chat/${encodeURIComponent(chat.id)}`, title: 'Route map' })}
    <p class="cr-sub" id="rtSub">${sub()}</p>
    <div id="rtList">${listHTML()}</div>
    <div class="cr-foot">${toggleRow('tChron', 'Track the story', 'Every couple of replies, a short extra AI call updates the map and Bonds.', trackingOn(S.settings))}
      <p class="fhint">Long-press a message in the chat to mark it on the map yourself.</p></div>
    <div class="sticky-cta">${primary(btnText(), { id: 'rtGo', attrs: unread(chat) > 0 || btnText() === 'Read the story so far' ? '' : 'disabled' })}</div>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const redraw = () => {
        $('#rtList').innerHTML = listHTML();
        $('#rtSub').innerHTML = sub();
        const go = $('#rtGo');
        go.querySelector('span').textContent = btnText();
        go.disabled = busy || !(unread(chat) > 0 || btnText() === 'Read the story so far');
      };
      bindSwitch($('#tChron'), async (on) => {
        S.settings.chronicle = on;
        await saveSettings();
      });
      $('#rtList').addEventListener('click', async (e) => {
        const st = e.target.closest('[data-st]');
        if (st) {
          open = open === st.dataset.st ? null : st.dataset.st;
          redraw();
          return;
        }
        const br = e.target.closest('[data-branch]');
        if (br) {
          const s = chat.route.find((x) => x.id === br.dataset.branch);
          const i = chat.messages.findIndex((m) => m.id === s?.msgId);
          if (i < 0) return;
          const nc = await branchChat(chat, i);
          location.hash = `#/chat/${encodeURIComponent(nc.id)}`;
          toast('Branched here. The original is under Chats.', { action: 'Back', ms: 5000, onAction: () => (location.hash = `#/chat/${encodeURIComponent(chat.id)}`) });
          return;
        }
        const rm = e.target.closest('[data-rm]');
        if (rm) {
          const gone = chat.route.find((x) => x.id === rm.dataset.rm);
          chat.route = chat.route.filter((x) => x !== gone);
          open = null;
          await saveChat(chat, false);
          redraw();
          toast('Removed from the map', { action: 'Undo', onAction: async () => (chat.route.push(gone), sortRoute(chat), await saveChat(chat, false), redraw()) });
        }
      });
      $('#rtGo').addEventListener('click', async () => {
        if (busy) return;
        const whole = btnText() === 'Read the story so far';
        busy = true;
        const go = $('#rtGo');
        go.classList.add('busy');
        go.disabled = true;
        try {
          const res = await chronicle({ chat, cast, persona: c.persona, conn: c.conn, settings: S.settings, whole, onStep: (a, len) => len > 24 && (go.querySelector('span').textContent = `Reading… ${Math.round((a / len) * 100)}%`) });
          await saveChat(chat, false);
          toast(res.stations.length ? `${res.stations.length} new station${res.stations.length === 1 ? '' : 's'}` : 'No new stations this time');
        } catch (e) {
          const t = failText(e);
          if (t) toast(t, { kind: 'err' });
        }
        busy = false;
        go.classList.remove('busy');
        redraw();
      });
    },
  };
}

// ================= Bonds =================
export async function bondsView(id) {
  const c = await load(id);
  if (!c) return null;
  const { chat, cast } = c;
  chat.bonds ||= {};
  const openSet = new Set();

  const bars = (v) => `<span class="bd-seg" aria-hidden="true">${Array.from({ length: 10 }, (_, k) => `<i${v >= (k + 1) * 10 - 5 ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const card = (p, k) => {
    const b = chat.bonds[p.id];
    const isOpen = openSet.has(p.id);
    const last = b?.log?.find((l) => l.d);
    const rows = BOND_KEYS.map(
      ([key, label]) =>
        `<div class="bd-m"><span>${label}</span>${bars(b?.[key] ?? 0)}<em>${b ? b[key] : '–'}</em>${isOpen && b ? `<span class="bd-adj"><button type="button" class="press" data-adj="${esc(p.id)}:${key}:-5" aria-label="${label} down 5">−</button><button type="button" class="press" data-adj="${esc(p.id)}:${key}:5" aria-label="${label} up 5">+</button></span>` : ''}</div>`
    ).join('');
    const hist = isOpen && b?.log?.length
      ? `<ol class="bd-log">${b.log
          .map((l) => `<li><b>${l.first ? 'First read' : esc(changeText(l.d))}</b>${l.why && !l.first ? ` · ${esc(l.why)}` : ''}<small>${msgNo(chat, l.msgId) ? `message ${msgNo(chat, l.msgId)} · ` : ''}${esc(ago(l.at))}</small></li>`)
          .join('')}</ol>`
      : '';
    return `<section class="bd-card${b ? '' : ' none'}${isOpen ? ' open' : ''}" style="--c:${colorOf(p)};animation-delay:${k * 60}ms">
      ${b ? `<button type="button" class="bd-hd press" data-open="${esc(p.id)}" aria-expanded="${isOpen}">${tag(p)}<span class="bd-more">${isOpen ? 'Less' : 'History'}${icon('chev', 14)}</span></button>` : `<div class="bd-hd">${tag(p)}</div>`}
      ${rows}
      ${b ? `${b.view ? `<p class="bd-view">${esc(b.view)}</p>` : ''}${last ? `<p class="bd-chg">${esc(changeText(last.d))}${last.why ? ` · ${esc(last.why)}` : ''}</p>` : ''}` : `<p class="bd-chg">No reads yet. Bonds appear after a couple of replies.</p>`}
      ${isOpen ? `${hist}${b ? `<div class="bd-tools">${toggleRow(`lk-${esc(p.id)}`, 'Keep these values', 'The story won’t change them; you still can, with − and +.', !!b.locked)}<button type="button" class="btn-text press" data-reset="${esc(p.id)}">${icon('restart', 15)}Start over</button></div>` : ''}` : ''}
    </section>`;
  };
  const listHTML = () => cast.map(card).join('');

  const html = `<div class="screen no-tab cr-screen">
    ${topbar({ back: `#/chat/${encodeURIComponent(chat.id)}`, title: 'Bonds' })}
    <p class="cr-sub">How they feel about ${esc(c.persona?.name?.trim() || 'you')}</p>
    <div id="bdList" class="bd-list">${listHTML()}</div>
    <p class="fhint" style="margin-top:14px">${trackingOn(S.settings) ? 'Bonds update with the Route map as the story goes. The AI is told where things stand.' : 'Story tracking is off (Route map › Track the story), so bonds only change when you change them.'}</p>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const list = root.querySelector('#bdList');
      const redraw = () => {
        list.innerHTML = listHTML();
        list.querySelectorAll('.switch[id^="lk-"]').forEach((el) =>
          bindSwitch(el, async (on) => {
            chat.bonds[el.id.slice(3)].locked = on;
            await saveChat(chat, false);
          })
        );
      };
      redraw();
      list.classList.add('in');
      list.addEventListener('click', async (e) => {
        const o = e.target.closest('[data-open]');
        if (o) {
          const pid = o.dataset.open;
          openSet.has(pid) ? openSet.delete(pid) : openSet.add(pid);
          list.classList.remove('in');
          return redraw();
        }
        const a = e.target.closest('[data-adj]');
        if (a) {
          const [pid, key, d] = a.dataset.adj.split(':');
          const b = chat.bonds[pid];
          const v = Math.max(0, Math.min(100, b[key] + Number(d)));
          if (v === b[key]) return;
          b.log.unshift({ msgId: chat.messages[chat.messages.length - 1]?.id, at: Date.now(), d: { [key]: v - b[key] }, why: 'set by you' });
          b[key] = v;
          await saveChat(chat, false);
          return redraw();
        }
        const r = e.target.closest('[data-reset]');
        if (r) {
          const p = cast.find((x) => x.id === r.dataset.reset);
          if (!(await confirmSheet({ title: `Start ${esc(p.name)}’s bond over?`, body: 'The values and history are cleared. The next read sets them again from the story.', ok: 'Start over' }))) return;
          delete chat.bonds[p.id];
          openSet.delete(p.id);
          await saveChat(chat, false);
          redraw();
        }
      });
    },
  };
}

// ================= Diary =================
export async function diaryView(id, entryId = null) {
  const c = await load(id);
  if (!c) return null;
  const { chat, ix, cast } = c;
  chat.diary ||= [];
  if (entryId) return entryView(c, entryId);
  let who = cast.find((p) => p.id === S.settings.diaryWho?.[chat.id]) || cast[0];
  let busy = false;

  const entries = () => chat.diary.filter((e) => e.who === who.id).slice().reverse();
  const since = () => {
    const last = entries()[0];
    return last ? chat.messages.length - msgNo(chat, last.msgId) : chat.messages.length;
  };
  const canWrite = () => !busy && since() >= 4;
  const plate = (e, k) => {
    const p = cast.find((x) => x.id === e.who) || who;
    const n = msgNo(chat, e.msgId);
    return `<a class="dy${k ? ' older' : ''} press" href="#/diary/${encodeURIComponent(chat.id)}/${encodeURIComponent(e.id)}" style="animation-delay:${Math.min(k, 5) * 50}ms">
      <span class="dy-hd">${tag(p, 20)}<small>${n ? `After message ${n}` : esc(ago(e.at))}</small></span>
      <b>${esc(e.title)}</b><span class="dy-t">${esc(e.text)}</span></a>`;
  };
  const listHTML = () => {
    const list = entries();
    return list.length ? list.map(plate).join('') : `<div class="dy empty"><b>Nothing written yet</b><span class="dy-t">${esc(who.name)} writes about what happened from their side: what they noticed, felt and kept to themselves.</span></div>`;
  };
  const whoRow = () =>
    ix ? `<div class="dy-who" role="group" aria-label="Whose diary">${cast.map((p) => `<button type="button" class="press" aria-pressed="${p.id === who.id}" data-who="${esc(p.id)}">${avatarBullet(p, 26)}${esc(p.name)}</button>`).join('')}</div>` : '';
  const hint = () => (since() >= 4 ? '' : entries().length ? 'A new entry unlocks after a few more messages.' : 'The first entry unlocks after a few messages.');

  const html = `<div class="screen no-tab cr-screen">
    ${topbar({ back: `#/chat/${encodeURIComponent(chat.id)}`, title: 'Diary' })}
    <p class="cr-sub" id="dySub">${esc(who.name)}’s private entries</p>
    ${whoRow()}
    <div id="dyList" class="dy-list">${listHTML()}</div>
    <p class="fhint" id="dyHint">${hint()}</p>
    <div class="sticky-cta">${primary('Write a new entry', { id: 'dyGo', attrs: canWrite() ? '' : 'disabled' })}</div>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const redraw = () => {
        $('#dyList').innerHTML = listHTML();
        $('#dySub').textContent = `${who.name}’s private entries`;
        $('#dyHint').textContent = hint();
        $('#dyGo').disabled = !canWrite();
      };
      root.querySelector('.dy-who')?.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-who]');
        if (!b) return;
        who = cast.find((p) => p.id === b.dataset.who) || who;
        root.querySelectorAll('.dy-who [data-who]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        S.settings.diaryWho = { ...(S.settings.diaryWho || {}), [chat.id]: who.id };
        saveSettings();
        redraw();
      });
      $('#dyGo').addEventListener('click', async () => {
        if (!canWrite()) return;
        busy = true;
        const go = $('#dyGo');
        go.classList.add('busy');
        go.disabled = true;
        go.querySelector('span').textContent = `${who.name} is writing…`;
        try {
          await writeDiary({ chat, who, cast, persona: c.persona, conn: c.conn, settings: S.settings });
          await saveChat(chat, false);
        } catch (e) {
          const t = failText(e);
          if (t) toast(t, { kind: 'err' });
        }
        busy = false;
        go.classList.remove('busy');
        go.querySelector('span').textContent = 'Write a new entry';
        redraw();
      });
    },
  };
}

// One entry, full page.
function entryView(c, entryId) {
  const { chat, cast } = c;
  const e = chat.diary.find((x) => x.id === entryId);
  if (!e) return null;
  const p = cast.find((x) => x.id === e.who) || cast[0];
  const n = msgNo(chat, e.msgId);
  const html = `<div class="screen no-tab cr-screen">
    ${topbar({ back: `#/diary/${encodeURIComponent(chat.id)}`, title: `${esc(p.name)}’s diary` })}
    <article class="dy-page">
      <p class="dy-meta">${tag(p, 22)}<small>${n ? `After message ${n} · ` : ''}${esc(ago(e.at))}</small></p>
      <h1>${esc(e.title)}</h1>
      ${e.text.split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join('')}
    </article>
    <div class="dy-acts">${n ? `<a class="rt-pill press" href="#/chat/${encodeURIComponent(chat.id)}/m/${encodeURIComponent(e.msgId)}">${icon('chev', 15)}Jump to that moment</a>` : ''}<button type="button" class="btn-text press" id="dyDel">${icon('trash', 15)}Delete entry</button></div>
  </div>`;
  return {
    html,
    depth: 3,
    mount(root) {
      root.querySelector('#dyDel').addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Delete this entry?', body: 'It can’t be brought back.', ok: 'Delete', danger: true }))) return;
        chat.diary = chat.diary.filter((x) => x !== e);
        await saveChat(chat, false);
        location.hash = `#/diary/${encodeURIComponent(chat.id)}`;
      });
    },
  };
}
