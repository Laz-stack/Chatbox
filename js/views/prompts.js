import { S, character, getChat, saveChat, saveSettings, connectionFor, hasStarted, latestChat, personaFor, interchange, isInterchangeId } from '../store.js';
import { buildPrompt, promptAsText } from '../prompt.js';
import { summarize, historyTokens } from '../memory.js';
import { esc, debounce, uid, fmtNum, copyText, reducedMotion } from '../util.js';
import { recall, factGroups, addFact, editFact, removeFact, togglePin } from '../memorybook.js';
import { topbar, title2, ibtn, bullet, avatarBullet, area, toggleRow, bindSwitch, icon, primary, reel, toast, openSheet, autosize } from '../ui.js';
const HEX6 = /^#[0-9a-f]{6}$/i;

const NOTE_MAX = 10000; // characters per pinned note (about 2,500 tokens, sent with every reply)

// Every layer keeps one number and one colour everywhere (Prompts and Final prompt), even when some are empty.
const LAYER_ORDER = ['global', 'connection', 'world', 'persona', 'user', 'lore', 'style', 'content', 'pinned', 'recall', 'notes', 'chat'];
const layerNo = (k) => String(LAYER_ORDER.indexOf(k) + 1);
const LAYER_COLORS = { global: ['#FDCD15', '#0A0A0A'], connection: ['#E70404', '#FFFFFF'], persona: ['#ECECEC', '#0A0A0A'], user: ['#065BFE', '#FFFFFF'], lore: ['#FE6500', '#0A0A0A'], world: ['#FE6500', '#0A0A0A'], style: ['#FB4DAA', '#0A0A0A'], content: ['#2EAA67', '#0A0A0A'], pinned: ['#065BFE', '#FFFFFF'], recall: ['#FE6500', '#0A0A0A'], notes: ['#B8ACFE', '#0A0A0A'], chat: ['#333333', '#ECECEC'] };

function recentCharacter() {
  const started = S.characters.filter((c) => hasStarted(latestChat(c.id))).sort((a, b) => latestChat(b.id).updatedAt - latestChat(a.id).updatedAt);
  return started[0] || S.characters[0];
}

// ---------- Prompts (global) ----------
export function promptsView() {
  const ch = recentCharacter();
  const steps = [
    ['Global prompt', 'Goes first, in every chat. You are editing it.', 'global'],
    ['Connection prompt', 'Added after global, for the connection in use.', 'connection'],
    ['Character persona', "The card's prompt, with {{char}} and {{user}} filled in.", 'persona'],
    ['Your persona', 'Who the character is talking to.', 'user'],
    ['World', 'An imported story’s setting and rules, sent every time.', 'world'],
    ['Lorebook', 'World info whose keywords came up in the chat.', 'lore'],
    ['Reply style', 'Length and point of view, from Depot.', 'style'],
    ['Content rules', 'What is allowed, from 18+ content in Depot.', 'content'],
    ['This chat’s notes', 'Pinned notes: instructions and facts for one chat (Memory).', 'pinned'],
    ['Remembered', 'Memory book facts that matter right now (up to 8 per reply).', 'recall'],
    ['Notes and summary', 'The story so far, Bonds, places, quests and story time.', 'notes'],
    ['The chat', 'Recent messages, newest last.', 'chat'],
  ];
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/settings' })}
    ${title2('Prompts', 'Global', { tag: 'h1' })}
    <div class="stack" style="margin-top:16px">
      ${area('gPrompt', 'Global prompt', S.settings.globalPrompt, { rows: 6, right: '<span class="counter" id="gCount"></span>' })}
      <p class="fhint" style="margin-top:-6px">Use {{char}} for the character's name and {{user}} for yours. Saved as you type.</p>
      ${toggleRow('tGlobalOn', 'Apply to every chat', 'Characters can opt out on their card', S.settings.globalOn)}
      <div><div class="hrow"><h2 class="h">How it stacks</h2><span class="small">In this order</span></div>
      <ol class="stack-line">${steps
        .map(
          ([t, s, k], i) =>
            `<li style="animation-delay:${0.1 + i * 0.06}s" class="${k === 'global' && !S.settings.globalOn ? 'off' : ''}" data-k="${k}">${bullet(String(i + 1), 'var(--plate2)', 'var(--cream)', 36)}<div style="padding-top:3px"><div class="t" ${k === 'global' ? 'style="color:var(--yellow)"' : ''}>${t}</div><div class="s">${s}</div></div></li>`
        )
        .join('')}</ol></div>
    </div>
    ${ch ? `<div class="sticky-cta">${primary('Show final prompt', { href: `#/final/${ch.id}`, cls: 'plate' })}</div>` : ''}
  </div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      const ta = root.querySelector('#gPrompt');
      const cnt = root.querySelector('#gCount');
      const upd = () => (cnt.textContent = `${ta.value.length.toLocaleString()} / 4,000`);
      upd();
      const persist = debounce(() => saveSettings(), 350);
      ta.addEventListener('input', () => {
        S.settings.globalPrompt = ta.value;
        upd();
        persist();
      });
      bindSwitch(root.querySelector('#tGlobalOn'), (v) => {
        S.settings.globalOn = v;
        saveSettings();
        root.querySelector('li[data-k="global"]').classList.toggle('off', !v);
      });
    },
  };
}

// ---------- Final prompt preview ----------
export async function finalView(id) {
  const chat = await getChat(id);
  const room = roomOf(chat);
  if (!room) return null;
  const { ch, who, group } = room;
  const conn = connectionFor(ch);
  const built = buildPrompt({ char: who, chat, conn, settings: S.settings, persona: personaFor(chat), group });
  const parts = [...built.layers, { key: 'chat', name: 'The chat', tokens: built.histTokens, text: built.messages.map((m) => `${m.role === 'user' ? S.persona.name || 'You' : ch.name}: ${m.content}`).join('\n\n') }];
  const total = built.total;
  const html = `<div class="screen no-tab">
    ${topbar({ back: `#/chat/${chat.id}`, title: 'Final prompt', right: ibtn('copy', 'Copy the whole prompt', { id: 'copyBtn', cls: 'yellow' }) })}
    <div class="stack" style="gap:16px">
      <div style="display:flex;align-items:center;gap:10px">${avatarBullet(ch, 30)}<span class="small" style="font-size:14px">${esc(ch.name)} · ${esc(conn?.name || 'No connection')}${conn && conn.provider !== 'demo' && conn.model ? ' · ' + esc(conn.model) : ''}</span></div>
      <div class="bignum"><span class="n" id="bigN">${total.toLocaleString()}</span><span class="l"><span>tokens</span><span>each reply</span></span></div>
      <div class="segbar" aria-hidden="true">${parts.map((p, i) => `<i style="flex:${Math.max(p.tokens, 1)};background:${LAYER_COLORS[p.key][0]};animation-delay:${0.1 + i * 0.07}s"></i>`).join('')}</div>
      <div class="legend">${parts.map((p) => `<span>${bullet(layerNo(p.key), LAYER_COLORS[p.key][0], LAYER_COLORS[p.key][1], 20)}${p.name.replace(' prompt', '')} <em class="num">${fmtNum(p.tokens)}</em></span>`).join('')}</div>
      <div class="stack" style="gap:10px">${parts
        .map(
          (p, i) =>
            `<details class="layer" style="animation-delay:${0.15 + i * 0.05}s"><summary>${bullet(layerNo(p.key), LAYER_COLORS[p.key][0], LAYER_COLORS[p.key][1], 24)}<b>${p.name}</b><span class="small num">${p.tokens.toLocaleString()} tokens</span></summary><div class="peek">${esc(p.text)}</div><pre>${esc(p.text)}</pre></details>`
        )
        .join('')}</div>
      <p class="fhint">Token counts are estimates (about four characters each). Messages older than the summary and anything past the context size are left out.</p>
    </div>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      root.querySelector('#copyBtn').addEventListener('click', () => copyText(promptAsText(built)).then(() => toast('Prompt copied')));
      // Count-up on the big number.
      const el = root.querySelector('#bigN');
      if (reducedMotion()) return;
      const t0 = performance.now();
      // Own clock, clamped: a frame timestamp can be earlier than t0 and would count backwards.
      const tick = () => {
        const k = Math.min(1, Math.max(0, (performance.now() - t0) / 700));
        el.textContent = Math.round(total * (1 - Math.pow(1 - k, 3))).toLocaleString();
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  };
}

// A chat's room: the character, or for an Interchange the room (title, first member) and its cast.
function roomOf(chat) {
  const ix = chat && isInterchangeId(chat.characterId) ? interchange(chat.characterId) : null;
  if (ix) {
    const ch = { ...ix.people[0], id: ix.id, name: ix.title, connectionId: null };
    return { ix, ch, cast: ix.people, who: ix.people[0], group: { people: ix.people, scene: ix.scene, world: ix.world || '', mode: ix.mode || 'turns', passengers: ix.passengers !== false } };
  }
  const ch = chat && character(chat.characterId);
  return ch ? { ix: null, ch, cast: [ch], who: ch, group: null } : null;
}

// ---------- Memory and notes (per chat; Interchanges too) ----------
export async function memoryView(id) {
  const chat = await getChat(id);
  const room = roomOf(chat);
  if (!room) return null;
  const { ch, ix, cast, who, group } = room;
  const conn = connectionFor(ch);
  const ctx = conn?.context || 16000;

  const deck = () => {
    const used = buildPrompt({ char: who, chat, conn, settings: S.settings, persona: personaFor(chat), group }).total;
    const frac = Math.min(1, used / ctx);
    const spd = Math.max(1.5, 9 - frac * 7).toFixed(1);
    return `<div class="deck"><div class="reels">${reel(118, { spd, pack: 40 - Math.round(frac * 12), cls: 'r1' })}${reel(118, { spd: (spd * 0.75).toFixed(1), pack: 26 + Math.round(frac * 12), cls: 'r2' })}<span class="tape"></span></div>
      <div class="stats"><span class="big num">${fmtNum(used)} of ${fmtNum(ctx)}<small>tokens sent with each reply</small></span><span class="small num" style="color:var(--inkm);font-size:13px">${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'}</span></div>
      <div class="meter"><i style="width:${Math.max(2, frac * 100).toFixed(1)}%"></i></div></div>`;
  };
  const notesHTML = () =>
    chat.notes
      .map(
        (n) =>
          `<div class="note-row" data-id="${n.id}">${bullet(icon('pin', 15), '#FDCD15', '#0A0A0A', 30)}<button type="button" class="tx press" data-edit="${n.id}" aria-label="Edit note">${esc(n.text)}</button><button type="button" class="ibtn ghost press" data-del="${n.id}" aria-label="Delete note">${icon('trash', 18)}</button></div>`
      )
      .join('');
  // ---------- Memory book ----------
  const you = personaFor(chat);
  const youName = you?.name?.trim() || 'You';
  // Each person's dot wears their line colour; yours is cream (yellow means selected), the world grey.
  const dotOf = (about) => {
    const a = (about || '').toLowerCase();
    if (!a) return '--d:#9B9B9B';
    if (a === youName.toLowerCase().split(/\s+/)[0] || a === youName.toLowerCase()) return '--d:#ECECEC';
    const p = cast.find((x) => x.name.toLowerCase() === a || x.name.toLowerCase().split(/\s+/)[0] === a.split(/\s+/)[0]);
    return `--d:${HEX6.test(p?.line?.color || '') ? p.line.color : '#9B9B9B'}`;
  };
  const dotEl = (about, cls = 'mb-dot') => `<span class="${cls}" style="${dotOf(about)}" aria-hidden="true"></span>`;
  // Folded by person: what goes with the next reply in one line (open to read it), then one row per
  // person that opens to their facts, newest first: PAGE, then two pages more, then all of them.
  const PAGE = 8;
  let nowOpen = false;
  const openG = new Set();
  const shownG = new Map();
  const mbCount = () => `${(chat.facts || []).length} fact${(chat.facts || []).length === 1 ? '' : 's'}`;
  const chev = () => `<span class="mb-chev" aria-hidden="true">${icon('chev', 16)}</span>`;
  const nowHTML = () => {
    const rec = recall(chat);
    const faces = [...new Set(rec.map((f) => f.about || ''))].slice(0, 4).map((a) => dotEl(a, 'mb-face')).join('');
    return `<div class="mb-now group${nowOpen ? ' open' : ''}"><button type="button" class="mb-nowbtn press" data-mbnow aria-expanded="${nowOpen}" aria-controls="mbNowList"><span class="mb-faces">${faces}</span><span class="mb-nowtx"><b>${rec.length} go${rec.length === 1 ? 'es' : ''} with the next reply</b><span>Matched to the latest messages, plus pinned ones</span></span>${chev()}</button><div class="mb-fold" id="mbNowList"><div><ol class="mb-rail">${rec.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ol></div></div></div>`;
  };
  const row = (f) =>
    `<div class="mb-row" data-id="${esc(f.id)}"><button type="button" class="mb-tx press" data-mbedit="${esc(f.id)}" aria-label="Edit: ${esc(f.text)}">${esc(f.text)}</button><button type="button" class="mb-pin press${f.pinned ? ' on' : ''}" data-mbpin="${esc(f.id)}" aria-pressed="${!!f.pinned}" aria-label="Always remember">${icon('pin', 15)}</button></div>`;
  const groupHTML = (k, v) => {
    const o = openG.has(k);
    const n = shownG.get(k) || PAGE;
    const list = [...v].reverse();
    const id = `mbg-${encodeURIComponent(k || '~world').replace(/[^\w-]/g, '_')}`;
    return `<div class="mb-g${o ? ' open' : ''}" data-g="${esc(k)}"><button type="button" class="mb-gbtn press" data-mbg="${esc(k)}" aria-expanded="${o}" aria-controls="${id}">${dotEl(k)}<b>${esc(k || 'World')}</b><em class="num">${v.length}<span class="vh"> fact${v.length === 1 ? '' : 's'}</span></em>${chev()}</button><div class="mb-fold" id="${id}"><div class="mb-facts">${list.slice(0, n).map(row).join('')}${list.length > n ? `<button type="button" class="mb-more press" data-mbmore="${esc(k)}">${n > PAGE && list.length - n > PAGE * 2 ? `Show all ${list.length}` : `Show ${Math.min(PAGE * 2, list.length - n)} more`}</button>` : ''}</div></div></div>`;
  };
  const mbHTML = () => {
    const facts = chat.facts || [];
    const add = `<button type="button" class="mb-add press" id="mbAdd">${icon('plus', 16)}Add something to remember</button>`;
    if (!facts.length)
      return `<div class="group mb-empty"><p>Nothing yet. As the story goes on, lasting facts (names, promises, secrets, who owes whom) are written down here and remembered when they come up again${S.settings.chronicle === false ? '. Story tracking is off (Route map › Track the story), so only facts you add are kept' : ''}.</p>${add}</div>`;
    return nowHTML() + `<div class="group mb-list">${factGroups(chat).map(([k, v]) => groupHTML(k, v)).join('')}${add}</div>`;
  };
  const summaryHTML = () =>
    chat.summary?.text
      ? `<p class="sum-tx">${esc(chat.summary.text)}</p>`
      : `<p style="margin:10px 0 12px;font:400 14px/1.55 var(--font);color:var(--muted)">No summary yet. One appears automatically once this chat grows long, or make one now.</p>`;

  const html = `<div class="screen no-tab">
    ${topbar({ back: `#/chat/${chat.id}` })}
    ${title2('Memory', ix ? `What ${esc(ch.name)} keeps` : `What ${esc(ch.name)} keeps`, { tag: 'h1' })}
    <div class="stack" style="margin-top:16px">
      <div id="deck">${deck()}</div>
      ${toggleRow('tAuto', 'Auto-summary', 'Condense older messages as a chat grows', S.settings.autoSummary)}
      <div class="group" style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="font:800 16px/1 var(--font)">Latest summary</b><span class="small" id="covers">${chat.summary ? `Covers ${chat.summary.covers} messages` : ''}</span></div>
        <div id="sumText">${summaryHTML()}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" class="btn-primary plate press" style="height:46px;background:var(--plate2);justify-content:center;gap:8px" id="editSum">${icon('edit', 16)}<span>Edit</span></button>
          <button type="button" class="btn-primary plate press" style="height:46px;background:var(--plate2);justify-content:center;gap:8px" id="redoSum">${icon('refresh', 16)}<span>${chat.summary ? 'Redo' : 'Summarize'}</span></button>
        </div>
      </div>
      <div><div class="hrow"><h2 class="h">Memory book</h2><span class="small" id="mbCount">${mbCount()}</span></div><div id="mb">${mbHTML()}</div></div>
      <div><div class="hrow"><h2 class="h">Pinned notes</h2><span class="small" id="pinCount">${chat.notes.length} pinned</span></div>
        <div class="group notes" id="notes">${notesHTML()}<form class="add-row" id="addNote"><textarea id="noteIn" rows="1" placeholder="Add a note: an instruction, a fact, or something about you for this chat" aria-label="Add a note" maxlength="${NOTE_MAX}"></textarea>${ibtn('plus', 'Add note', { cls: 'yellow', attrs: 'type="submit"' }).replace('type="button"', '')}</form></div>
        <p class="fhint">For this chat only, sent with every reply: instructions the AI should follow, facts, and additions to your persona. Tap a note to edit it. Long-press a message in the chat to pin it.</p>
      </div>
      ${toggleRow('tCounter', 'Show token counter in chat', '', S.settings.showCounter)}
    </div>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const refresh = () => {
        $('#deck').innerHTML = deck();
        $('#pinCount').textContent = `${chat.notes.length} pinned`;
      };
      bindSwitch($('#tAuto'), (v) => ((S.settings.autoSummary = v), saveSettings()));
      bindSwitch($('#tCounter'), (v) => ((S.settings.showCounter = v), saveSettings()));
      const fitNote = autosize($('#noteIn'), 320);
      $('#addNote').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = $('#noteIn').value.replace(/\s+$/, '').replace(/^\s*\n/, '');
        if (!v.trim()) return;
        chat.notes.push({ id: uid(), text: v, at: Date.now() });
        $('#noteIn').value = '';
        fitNote();
        $('#addNote').insertAdjacentHTML('beforebegin', `<div class="note-row" data-id="${chat.notes.at(-1).id}">${bullet(icon('pin', 15), '#FDCD15', '#0A0A0A', 30)}<button type="button" class="tx press" data-edit="${chat.notes.at(-1).id}" aria-label="Edit note">${esc(v)}</button><button type="button" class="ibtn ghost press" data-del="${chat.notes.at(-1).id}" aria-label="Delete note">${icon('trash', 18)}</button></div>`);
        await saveChat(chat, false);
        refresh();
      });
      $('#notes').addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-edit]');
        if (ed) return editNote(ed.dataset.edit);
        const b = e.target.closest('[data-del]');
        if (!b) return;
        const row = b.closest('.note-row');
        const i = chat.notes.findIndex((n) => n.id === b.dataset.del);
        const [gone] = chat.notes.splice(i, 1);
        row.classList.add('gone');
        setTimeout(() => row.remove(), 300);
        await saveChat(chat, false);
        refresh();
        toast('Note removed', {
          action: 'Undo',
          onAction: async () => {
            chat.notes.splice(i, 0, gone);
            await saveChat(chat, false);
            $('#notes').querySelectorAll('.note-row').forEach((r) => r.remove());
            $('#addNote').insertAdjacentHTML('beforebegin', notesHTML());
            refresh();
          },
        });
      });
      // Tap a note: edit it in a box that grows with the text, line breaks kept.
      function editNote(id) {
        const n = chat.notes.find((x) => x.id === id);
        if (!n) return;
        openSheet({
          label: 'Edit note',
          html: `<h2 class="sheet-title">Edit note</h2><textarea class="input area note-ta" id="noteTa" rows="4" maxlength="${NOTE_MAX}" data-autofocus aria-label="Note">${esc(n.text)}</textarea><p class="fhint" id="noteLeft"></p><div class="sheet-actions"><button type="button" class="btn-primary plate press" data-x><span>Cancel</span></button><button type="button" class="btn-primary press" data-ok><span>Save</span></button></div>`,
          onMount(s, close) {
            const ta = s.querySelector('#noteTa');
            autosize(ta, Math.round(innerHeight * 0.55));
            // How long it is, and roughly what it adds to every reply.
            const left = () => (s.querySelector('#noteLeft').textContent = `${ta.value.length.toLocaleString()} of ${NOTE_MAX.toLocaleString()} characters · about ${Math.ceil(ta.value.length / 4).toLocaleString()} tokens with each reply`);
            ta.addEventListener('input', left);
            left();
            s.querySelector('[data-x]').onclick = () => close();
            s.querySelector('[data-ok]').onclick = async () => {
              const v = ta.value.replace(/\s+$/, '').replace(/^\s*\n/, '');
              if (!v.trim()) return ta.focus();
              n.text = v;
              n.at = Date.now();
              await saveChat(chat, false);
              const row = $(`#notes [data-edit="${CSS.escape(id)}"]`);
              if (row) row.textContent = v;
              refresh();
              close();
              toast('Note saved');
            };
          },
        });
      }
      // ---------- Memory book: filter, pin, edit, add ----------
      const mbRedraw = () => (($('#mb').innerHTML = mbHTML()), ($('#mbCount').textContent = mbCount()), refresh());
      function factSheet(f = null) {
        const people = [...new Set([youName, ...cast.map((p) => p.name)])];
        let about = f ? f.about || '' : '';
        openSheet({
          label: f ? 'Edit memory' : 'Add a memory',
          html: `<h2 class="sheet-title">${f ? 'Edit memory' : 'Something to remember'}</h2><textarea class="input area note-ta" id="mbTa" rows="3" maxlength="400" data-autofocus aria-label="The fact" placeholder="e.g. Sona is left-handed and hides a scar on her wrist">${esc(f?.text || '')}</textarea>
            <p class="tx-lbl" style="margin-top:12px">About</p><div class="mb-chips" id="mbAbout" role="radiogroup" aria-label="About">${[...people, ''].map((n) => `<button type="button" class="press" role="radio" aria-checked="${about === n}" data-ab="${esc(n)}">${esc(n || 'The world')}</button>`).join('')}</div>
            <div class="sheet-actions">${f ? `<button type="button" class="btn-primary plate press" data-del><span>Forget</span></button>` : `<button type="button" class="btn-primary plate press" data-x><span>Cancel</span></button>`}<button type="button" class="btn-primary press" data-ok><span>${f ? 'Save' : 'Remember'}</span></button></div>`,
          onMount(s, close) {
            const ta = s.querySelector('#mbTa');
            autosize(ta, 260);
            s.querySelector('#mbAbout').addEventListener('click', (e) => {
              const b = e.target.closest('[data-ab]');
              if (!b) return;
              about = b.dataset.ab;
              s.querySelectorAll('[data-ab]').forEach((x) => x.setAttribute('aria-checked', x === b));
            });
            s.querySelector('[data-x]')?.addEventListener('click', () => close());
            s.querySelector('[data-del]')?.addEventListener('click', async () => {
              removeFact(chat, f.id);
              await saveChat(chat, false);
              close();
              mbRedraw();
              toast('Forgotten');
            });
            s.querySelector('[data-ok]').addEventListener('click', async () => {
              const v = ta.value.trim();
              if (!v) return ta.focus();
              if (f) editFact(chat, f.id, v), (f.about = about);
              else addFact(chat, v, about);
              await saveChat(chat, false);
              close();
              mbRedraw();
            });
          },
        });
      }
      $('#mb').addEventListener('click', async (e) => {
        // Open and close in place, so the fold animates and focus stays put.
        const fold = e.target.closest('[data-mbnow], [data-mbg]');
        if (fold) {
          const host = fold.parentElement;
          const on = host.classList.toggle('open');
          fold.setAttribute('aria-expanded', on);
          if (fold.dataset.mbnow != null) nowOpen = on;
          else on ? openG.add(fold.dataset.mbg) : openG.delete(fold.dataset.mbg);
          return;
        }
        const more = e.target.closest('[data-mbmore]');
        if (more) {
          const k = more.dataset.mbmore;
          const box = more.parentElement;
          const prev = box.querySelectorAll('.mb-row').length;
          const n0 = shownG.get(k) || PAGE;
          shownG.set(k, n0 > PAGE ? Infinity : n0 + PAGE * 2);
          const g = factGroups(chat).find(([x]) => x === k);
          if (g) more.closest('.mb-g').outerHTML = groupHTML(...g);
          $('#mb').querySelectorAll('.mb-g').forEach((el) => { if (el.dataset.g === k) el.querySelectorAll('.mb-row')[prev]?.querySelector('.mb-tx')?.focus(); });
          return;
        }
        const pin = e.target.closest('[data-mbpin]');
        if (pin) {
          const f = togglePin(chat, pin.dataset.mbpin);
          await saveChat(chat, false);
          pin.classList.toggle('on', !!f?.pinned);
          pin.setAttribute('aria-pressed', !!f?.pinned);
          $('#mb .mb-now').outerHTML = nowHTML();
          refresh();
          return toast(f?.pinned ? 'Always remembered' : 'Remembered when it comes up');
        }
        const ed = e.target.closest('[data-mbedit]');
        if (ed) return factSheet((chat.facts || []).find((x) => x.id === ed.dataset.mbedit));
        if (e.target.closest('#mbAdd')) factSheet();
      });
      $('#editSum').addEventListener('click', () =>
        openSheet({
          label: 'Edit summary',
          html: `<h2 class="sheet-title">Edit summary</h2><textarea class="input area" id="sumTa" rows="8" data-autofocus placeholder="What has happened so far">${esc(chat.summary?.text || '')}</textarea><div style="height:14px"></div><div class="sheet-actions"><button type="button" class="btn-primary plate press" data-x><span>Cancel</span></button><button type="button" class="btn-primary press" data-ok><span>Save</span></button></div>`,
          onMount(s, close) {
            autosize(s.querySelector('#sumTa'), Math.round(innerHeight * 0.55));
            s.querySelector('[data-x]').onclick = () => close();
            s.querySelector('[data-ok]').onclick = async () => {
              const v = s.querySelector('#sumTa').value.replace(/\s+$/, '').replace(/^\s*\n/, '');
              if (v) chat.summary = { ...(chat.summary || { upto: 0, covers: 0 }), text: v, at: Date.now() };
              else chat.summary = null;
              await saveChat(chat, false);
              $('#sumText').innerHTML = summaryHTML();
              refresh();
              close();
            };
          },
        })
      );
      $('#redoSum').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (chat.messages.length < 4) return toast('Chat a little more first. There is nothing to summarize yet.');
        btn.classList.add('busy');
        btn.disabled = true;
        root.querySelectorAll('.reel').forEach((r) => r.classList.add('fast'));
        try {
          await summarize({ chat, char: ch, conn, persona: personaFor(chat), cast: ix ? cast : null, force: true });
          $('#sumText').innerHTML = summaryHTML();
          $('#covers').textContent = `Covers ${chat.summary.covers} messages`;
          btn.querySelector('span').textContent = 'Redo';
          refresh();
          toast('Summary updated');
        } catch (err) {
          toast(err.message || 'Summary failed', { kind: 'err' });
        }
        btn.classList.remove('busy');
        btn.disabled = false;
        root.querySelectorAll('.reel').forEach((r) => r.classList.remove('fast'));
      });
    },
  };
}
