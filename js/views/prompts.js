import { S, character, getChat, saveChat, saveSettings, connectionFor, hasStarted, latestChat } from '../store.js';
import { buildPrompt, promptAsText } from '../prompt.js';
import { summarize, historyTokens } from '../memory.js';
import { esc, debounce, uid, fmtNum, copyText, reducedMotion } from '../util.js';
import { topbar, title2, ibtn, bullet, avatarBullet, area, toggleRow, bindSwitch, icon, primary, reel, toast, openSheet } from '../ui.js';

// Every layer keeps one number and one colour everywhere (Prompts and Final prompt), even when some are empty.
const LAYER_ORDER = ['global', 'connection', 'persona', 'user', 'notes', 'chat'];
const layerNo = (k) => String(LAYER_ORDER.indexOf(k) + 1);
const LAYER_COLORS = { global: ['#FDCD15', '#0A0A0A'], connection: ['#E70404', '#FFFFFF'], persona: ['#ECECEC', '#0A0A0A'], user: ['#065BFE', '#FFFFFF'], notes: ['#B8ACFE', '#0A0A0A'], chat: ['#333333', '#ECECEC'] };

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
    ['Notes and summary', 'Pinned notes and the running summary.', 'notes'],
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
            `<li style="animation-delay:${0.1 + i * 0.06}s" class="${k === 'global' && !S.settings.globalOn ? 'off' : ''}" data-k="${k}">${bullet(String(i + 1), LAYER_COLORS[k][0], LAYER_COLORS[k][1], 36)}<div style="padding-top:3px"><div class="t" ${k === 'global' ? 'style="color:var(--yellow)"' : ''}>${t}</div><div class="s">${s}</div></div></li>`
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
  const ch = chat && character(chat.characterId);
  if (!ch) return null;
  const conn = connectionFor(ch);
  const built = buildPrompt({ char: ch, chat, conn, settings: S.settings, persona: S.persona });
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

// ---------- Memory and notes (per character) ----------
export async function memoryView(id) {
  const chat = await getChat(id);
  const ch = chat && character(chat.characterId);
  if (!ch) return null;
  const conn = connectionFor(ch);
  const ctx = conn?.context || 16000;

  const deck = () => {
    const used = buildPrompt({ char: ch, chat, conn, settings: S.settings, persona: S.persona }).total;
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
          `<div class="note-row" data-id="${n.id}">${bullet(icon('pin', 15), '#FDCD15', '#0A0A0A', 30)}<span class="tx">${esc(n.text)}</span><button type="button" class="ibtn ghost press" data-del="${n.id}" aria-label="Delete note">${icon('trash', 18)}</button></div>`
      )
      .join('');
  const summaryHTML = () =>
    chat.summary?.text
      ? `<p style="margin:10px 0 12px;font:400 14px/1.55 var(--font)">${esc(chat.summary.text)}</p>`
      : `<p style="margin:10px 0 12px;font:400 14px/1.55 var(--font);color:var(--muted)">No summary yet. One appears automatically once this chat grows long, or make one now.</p>`;

  const html = `<div class="screen no-tab">
    ${topbar({ back: `#/chat/${chat.id}` })}
    ${title2('Memory', `What ${esc(ch.name)} keeps`, { tag: 'h1' })}
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
      <div><div class="hrow"><h2 class="h">Pinned notes</h2><span class="small" id="pinCount">${chat.notes.length} pinned</span></div>
        <div class="group notes" id="notes">${notesHTML()}<form class="add-row" id="addNote"><input id="noteIn" placeholder="Add a note, e.g. Prefers tea over coffee" aria-label="Add a note" maxlength="300" autocomplete="off">${ibtn('plus', 'Add note', { cls: 'yellow', attrs: 'type="submit"' }).replace('type="button"', '')}</form></div>
        <p class="fhint">Notes are sent with every reply in this chat. Long-press a message in the chat to pin it.</p>
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
      $('#addNote').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = $('#noteIn').value.trim();
        if (!v) return;
        chat.notes.push({ id: uid(), text: v, at: Date.now() });
        $('#noteIn').value = '';
        $('#addNote').insertAdjacentHTML('beforebegin', `<div class="note-row" data-id="${chat.notes.at(-1).id}">${bullet(icon('pin', 15), '#FDCD15', '#0A0A0A', 30)}<span class="tx">${esc(v)}</span><button type="button" class="ibtn ghost press" data-del="${chat.notes.at(-1).id}" aria-label="Delete note">${icon('trash', 18)}</button></div>`);
        await saveChat(chat, false);
        refresh();
      });
      $('#notes').addEventListener('click', async (e) => {
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
      $('#editSum').addEventListener('click', () =>
        openSheet({
          label: 'Edit summary',
          html: `<h2 class="sheet-title">Edit summary</h2><textarea class="input area" id="sumTa" rows="8" data-autofocus placeholder="What has happened so far">${esc(chat.summary?.text || '')}</textarea><div style="height:14px"></div><div class="sheet-actions"><button type="button" class="btn-primary plate press" data-x><span>Cancel</span></button><button type="button" class="btn-primary press" data-ok><span>Save</span></button></div>`,
          onMount(s, close) {
            s.querySelector('[data-x]').onclick = () => close();
            s.querySelector('[data-ok]').onclick = async () => {
              const v = s.querySelector('#sumTa').value.trim();
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
          await summarize({ chat, char: ch, conn, persona: S.persona, force: true });
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
