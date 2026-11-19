import { S, character, getChat, saveChat, saveCharacter, saveSettings, connectionFor, textOf, named, resetChat, recordFare, interchange, isInterchangeId, chatsFor, startNewChat, deleteChat } from '../store.js';
import { complete, PROVIDERS } from '../providers.js';
import { buildPrompt } from '../prompt.js';
import { shouldSummarize, summarize } from '../memory.js';
import { esc, uid, formatMessage, fmtNum, estimateTokens, inkOn, ago, plain, detectMood, copyText, download, slug, reducedMotion, motion, lineAccent, EASE_OUT } from '../util.js';
import { avatarTile } from '../avatar.js';
import { sceneSVG } from '../scenes.js';
import { sceneSheet as openSceneSheet } from '../scenepicker.js';
import { speak, stopSpeaking, ttsSupported } from '../tts.js';
import { exportCardPng } from '../cards.js';
import { ibtn, avatarBullet, icon, arrow, openMenu, openSheet, toast, confirmSheet, autosize, reel } from '../ui.js';

// Streams text into a bubble word by word, keeping *actions* italic as they arrive.
class StreamRenderer {
  constructor(el, caret) {
    this.el = el;
    this.caret = caret;
    this.inAct = false;
    this.open();
  }
  open() {
    this.cur = document.createElement('span');
    if (this.inAct) this.cur.className = 'act';
    this.el.insertBefore(this.cur, this.caret);
  }
  push(text) {
    for (const part of text.split(/(\*|\n|\s+)/)) {
      if (!part) continue;
      if (part === '*') {
        this.inAct = !this.inAct;
        this.open();
      } else if (part === '\n') {
        this.el.insertBefore(document.createElement('br'), this.caret);
        this.open();
      } else if (/^\s+$/.test(part)) {
        this.cur.appendChild(document.createTextNode(part.replace(/\n/g, ' ')));
      } else {
        const s = document.createElement('span');
        s.className = 'tok';
        s.textContent = part;
        this.cur.appendChild(s);
      }
    }
  }
}

export async function chatView(id, focusId = null) {
  const ix = isInterchangeId(id) ? interchange(id) : null;
  // In an Interchange `ch` stands for the room (title, first member's scene and colour);
  // each reply's own speaker comes from speakerOf().
  // A chat id ("mika~x7k2") opens that chat; a character id opens its most recent one.
  const owner = ix ? id : character(id) ? id : S.chats.get(id)?.characterId || id;
  const ch = ix ? { ...ix.people[0], id: ix.id, name: ix.title, tagline: `Interchange · ${ix.people.length} lines`, connectionId: null } : character(owner);
  if (!ch) return null;
  const speakerOf = (m) => (ix ? ix.people.find((p) => p.id === m?.speaker) || ix.people[0] : ch);
  const group = ix ? { people: ix.people, scene: ix.scene } : null;
  const chat = await getChat(id);
  if (!chat) return null;
  let ctl = null;
  let busy = false;
  let destroyed = false;

  const conn0 = connectionFor(ch);
  const connText = (c) => (!c ? 'No connection' : c.provider === 'demo' ? 'Demo replies' : c.model || c.name);
  // Short placeholder: a long name would wrap the composer onto several lines.
  const callName = ix ? 'the interchange' : ch.name.length > 14 ? ch.name.split(/\s+/)[0].slice(0, 14) : ch.name;
  const html = `<div class="chat" id="chat" style="--blur:${ch.sceneBlur ?? 4}px;--dim:${(ch.sceneDim ?? 60) / 100};--accent:${lineAccent(ch.line?.color)}">
    <div class="chat-scene" id="scene" aria-hidden="true">${ch.scene && ch.scene !== 'none' ? sceneSVG(ch.scene) : ''}</div>
    <header class="chat-head">
      ${ibtn('back', 'Back to home', { href: '#/' })}
      <a class="chat-who press" href="${ix ? `#/interchange/${ix.id}` : `#/edit/${ch.id}`}" aria-label="Edit ${esc(ch.name)}">${ix ? `<span class="meet">${ix.people.map((p, i) => avatarBullet(p, 38, i ? 'margin-left:-12px' : '')).join('')}</span>` : avatarBullet(ch, 42, '', `head:${ch.id}`)}<span class="who-tx"><span class="who-n">${esc(ch.name)}</span><span class="who-s" id="status">${esc(ch.tagline || 'Online')}</span></span></a>
      ${ibtn('more', 'Chat options', { id: 'moreBtn' })}
    </header>
    <div class="chat-meta">
      <a class="pill press" href="#/connections" aria-label="Connection: ${esc(connText(conn0))}. Tap to switch."><span class="dot${conn0?.provider === 'demo' ? ' demo' : ''}" id="connDot"></span><span class="ell" id="connName">${esc(connText(conn0))}</span></a>
      <span class="pill muted" id="tokPill" ${S.settings.showCounter ? '' : 'hidden'} title="Estimated tokens sent with the next reply">${icon('layers', 14)}<span><span class="num" id="tokN">…</span> tokens</span></span>
      <a class="pill y press end" href="#/memory/${chat.id}" ${ix ? 'hidden' : ''}>${icon('pin', 15)}<span id="noteN">${chat.notes.length}</span>&nbsp;note${chat.notes.length === 1 ? '' : 's'}</a>
    </div>
    <div class="log" id="log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Chat with ${esc(ch.name)}"></div>
    <div class="chips" id="chips"></div>
    ${ix ? '<div class="nextbar" id="nextbar" role="radiogroup" aria-label="Who answers next"></div>' : ''}
    <form class="composer" id="composer">
      ${ibtn('asterisk', 'Add an *action*', { id: 'actBtn', attrs: 'title="Add an *action*: wraps the selection in asterisks"' })}
      <textarea id="input" rows="1" placeholder="Message ${esc(callName)}…" aria-label="Message ${esc(ch.name)}" enterkeyhint="send"></textarea>
      <button type="submit" class="send press" id="sendBtn" aria-label="Send" disabled>${arrow(24, 'currentColor')}</button>
    </form>
  </div>`;

  async function mount(root) {
    const log = root.querySelector('#log');
    const chips = root.querySelector('#chips');
    const input = root.querySelector('#input');
    const sendBtn = root.querySelector('#sendBtn');
    const status = root.querySelector('#status');
    const fit = autosize(input);

    // ---------- rendering ----------
    const lastAiIndex = () => {
      for (let i = chat.messages.length - 1; i >= 0; i--) if (chat.messages[i].role === 'assistant') return i;
      return -1;
    };
    function toolsHTML(m, i) {
      const isLast = i === chat.messages.length - 1;
      if (!isLast || m.role !== 'assistant') return '';
      const pager =
        m.alts.length > 1
          ? `<div class="pager"><button type="button" data-alt="-1" aria-label="Previous reply" ${m.alt === 0 ? 'disabled' : ''}>${icon('back', 18)}</button><span class="num" aria-live="polite">${m.alt + 1} / ${m.alts.length}</span><button type="button" data-alt="1" aria-label="Next reply">${icon('chev', 18)}</button></div>`
          : '';
      const read = ttsSupported ? `<button type="button" class="mini press" data-read aria-label="Read aloud">${icon('speaker', 18)}</button>` : '';
      const used = (m.lore?.[m.alt] || []).filter((id) => S.lore.some((e) => e.id === id));
      const lore = used.length ? `<button type="button" class="mini lore-used press" data-lore aria-label="${used.length} Lorebook entr${used.length === 1 ? 'y' : 'ies'} used">${icon('book', 16)}<span class="num">${used.length}</span></button>` : '';
      return pager || read || lore ? `<div class="msg-tools">${pager}${read}${lore}</div>` : '';
    }
    function msgHTML(m, i, enter = false) {
      const cls = `msg ${m.role === 'user' ? 'user' : 'ai'}${enter ? ' enter' : ''}`;
      const star = m.star ? `<span class="star-b" title="In your Logbook">${icon('star', 13)}</span>` : '';
      if (m.role === 'user') return `<div class="${cls}${m.star ? ' starred' : ''}" data-i="${i}" data-id="${m.id}"><div class="bubble">${formatMessage(named(textOf(m), ch))}${star}</div></div>`;
      const sp = speakerOf(m);
      const tag = ix ? `<span class="spk-tag" style="--c:${sp.line?.color || '#2EAA67'};--ink:${inkOn(sp.line?.color || '#2EAA67')}">${esc(sp.name)}</span>` : '';
      return `<div class="${cls}${m.star ? ' starred' : ''}" data-i="${i}" data-id="${m.id}">${avatarTile(sp, 30, { expr: m.mood || 'happy', radius: 10, cls: 'msg-av' })}<div class="msg-col"><div class="bubble">${tag}${formatMessage(named(textOf(m), sp))}${star}</div>${toolsHTML(m, i)}</div></div>`;
    }
    function renderAll() {
      const cut = chat.summary?.upto || 0;
      let h = '';
      chat.messages.forEach((m, i) => {
        if (cut && i === cut) h += `<a class="stop-line" href="#/memory/${chat.id}">${icon('spark', 14)} Earlier stops summarized</a>`;
        h += msgHTML(m, i);
      });
      if (!chat.messages.length)
        h = ix
          ? `<div class="empty">${ix.scene?.trim() ? `<b class="ix-scene">${esc(ix.scene.trim())}</b>` : ''}${esc(ix.people.map((p) => p.name).join(' and '))} are here. Say something, and pick who answers below.</div>`
          : `<div class="empty">Say hello to ${esc(ch.name)}. Wrap actions in *asterisks*.</div>`;
      log.innerHTML = h;
      renderChips();
    }
    function rerenderMsg(i) {
      const el = log.querySelector(`.msg[data-i="${i}"]`);
      if (el) el.outerHTML = msgHTML(chat.messages[i], i);
    }
    function renderChips() {
      // While a reply is being written the chips stay in place, disabled, so nothing jumps.
      chips.classList.toggle('wait', busy);
      if (busy) return chips.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const last = chat.messages[chat.messages.length - 1];
      let h = '';
      if (last?.role === 'assistant' && !last.first) {
        h = `<button type="button" class="press" data-chip="regen">${icon('refresh', 16)}Regenerate</button><button type="button" class="press" data-chip="continue">${icon('chev', 16)}Continue</button>`;
        if (ix) h += `<button type="button" class="press" data-chip="reply">${icon('chev', 16)}${chat.next && chat.next !== 'either' ? esc(speakerOf({ speaker: chat.next }).name) + ' speaks' : 'Next line'}</button>`;
      }
      else if (last?.role === 'user') h = `<button type="button" class="press" data-chip="reply">${icon('refresh', 16)}Get a reply</button>`;
      chips.innerHTML = h;
    }
    // ---------- Interchange: who answers next ----------
    function renderNext() {
      const bar = root.querySelector('#nextbar');
      if (!bar) return;
      const cur = chat.next || 'either';
      bar.innerHTML =
        '<span class="nb-l">Next stop</span>' +
        ix.people
          .map((p) => {
            const col = p.line?.color || '#2EAA67';
            return `<button type="button" class="ns press${cur === p.id ? ' on' : ''}" role="radio" aria-checked="${cur === p.id}" data-next="${p.id}" style="--c:${col};--ink:${inkOn(col)}">${avatarBullet(p, 26)}${esc(p.name)}${cur === p.id ? icon('check', 15) : ''}</button>`;
          })
          .join('') +
        `<button type="button" class="ns either press${cur === 'either' ? ' on' : ''}" role="radio" aria-checked="${cur === 'either'}" data-next="either">Either</button>`;
    }
    // Picked speaker, else whoever you addressed by name, else anyone but the last to speak.
    function pickSpeaker() {
      if (chat.next && chat.next !== 'either') return speakerOf({ speaker: chat.next });
      const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
      const said = (lastUser ? textOf(lastUser) : '').toLowerCase();
      const named = ix.people.filter((p) => new RegExp(`\\b${p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(said));
      if (named.length === 1) return named[0];
      const lastAi = [...chat.messages].reverse().find((m) => m.role === 'assistant');
      const pool = ix.people.filter((p) => p.id !== lastAi?.speaker);
      const from = pool.length ? pool : ix.people;
      return from[Math.floor(Math.random() * from.length)];
    }
    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    const toBottom = (smooth = false) => log.scrollTo({ top: log.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });

    function setStatus(kind) {
      status.classList.toggle('busy', kind !== 'idle');
      if (kind === 'typing') status.innerHTML = 'typing <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      else if (kind === 'summary') status.innerHTML = `${reel(16, { spd: 0.8 })} summarizing`;
      else status.textContent = ch.tagline || 'Online';
    }
    function updateTokens() {
      const c = connectionFor(ch);
      const who = ix ? speakerOf({ speaker: chat.next && chat.next !== 'either' ? chat.next : ix.people[0].id }) : ch;
      const b = buildPrompt({ char: who, chat, conn: c, settings: S.settings, persona: S.persona, group });
      root.querySelector('#tokN').textContent = fmtNum(b.total);
    }
    function setBusy(v) {
      busy = v;
      sendBtn.classList.toggle('stopping', v);
      sendBtn.innerHTML = v ? icon('stop', 20) : arrow(24, 'currentColor');
      sendBtn.setAttribute('aria-label', v ? 'Stop' : 'Send');
      sendBtn.disabled = !v && !input.value.trim();
      renderChips();
    }

    // ---------- generation ----------
    async function generate(mode) {
      const conn = connectionFor(ch);
      if (!conn) return toast('Add a connection first.', { action: 'Add', onAction: () => (location.hash = '#/connection/new') });
      log.querySelector('.err')?.remove();
      let target;
      let idx;
      if (mode === 'reply') {
        target = { id: uid(), role: 'assistant', alts: [''], alt: 0, mood: 'happy', at: Date.now() };
        if (ix) target.speaker = pickSpeaker().id;
        chat.messages.push(target);
        idx = chat.messages.length - 1;
      } else {
        idx = lastAiIndex();
        if (idx < 0) return;
        target = chat.messages[idx];
        if (mode === 'regen') {
          target.alts.push('');
          target.alt = target.alts.length - 1;
        }
      }
      const upto = mode === 'continue' ? idx + 1 : idx;
      const sp = speakerOf(target);
      const built = buildPrompt({ char: sp, chat, conn, settings: S.settings, persona: S.persona, upto, mode, group });

      // Prepare the bubble.
      let el = log.querySelector(`.msg[data-i="${idx}"]`);
      if (mode === 'reply') {
        log.querySelector('.empty')?.remove();
        log.insertAdjacentHTML('beforeend', msgHTML(target, idx, true));
        el = log.querySelector(`.msg[data-i="${idx}"]`);
      }
      const bubble = el.querySelector('.bubble');
      // Keep the tools row's space while writing (hidden), so the log doesn't jump.
      const tools = el.querySelector('.msg-tools');
      if (tools) (tools.style.visibility = 'hidden'), tools.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const prev = mode === 'continue' ? textOf(target) : '';
      if (mode === 'regen') {
        // Hold the bubble's height until the new text fills it, so the log doesn't jump.
        bubble.style.minHeight = bubble.offsetHeight + 'px';
        await motion(bubble, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-24px)' }], { duration: 160, easing: 'ease-in' }).finished.catch(() => {});
      }
      bubble.innerHTML = mode === 'continue' ? formatMessage(prev) : '';
      const caret = document.createElement('span');
      caret.className = 'caret';
      caret.setAttribute('aria-hidden', 'true');
      bubble.appendChild(caret);
      const rd = new StreamRenderer(bubble, caret);
      if (mode === 'continue' && /\*/.test(prev) && (prev.match(/\*/g) || []).length % 2) rd.inAct = !rd.inAct, rd.open();
      toBottom();

      setBusy(true);
      setStatus('typing');
      el.setAttribute('aria-busy', 'true');
      ctl = new AbortController();
      let text = prev;
      let first = true;
      let error = null;
      try {
        await complete(conn, {
          system: built.system,
          messages: built.messages,
          signal: ctl.signal,
          stream: ch.stream !== false,
          maxTokens: conn.maxTokens,
          temperature: conn.temperature,
          character: sp,
          onDelta(d) {
            if (destroyed) return;
            if (first && mode === 'continue') d = (prev && !/\s$/.test(prev) && !/^[\s.,!?;:)]/.test(d) ? ' ' : '') + d;
            first = false;
            const stick = nearBottom();
            text += d;
            target.alts[target.alt] = text;
            rd.push(d);
            if (stick) toBottom();
          },
        });
      } catch (e) {
        if (e.name !== 'AbortError') error = e;
      }
      ctl = null;
      if (destroyed) return save();

      if (!text.trim() || (error && text === prev)) {
        // Nothing arrived: roll back.
        if (mode === 'reply') {
          chat.messages.splice(idx, 1);
          el.remove();
        } else if (mode === 'regen') {
          target.alts.pop();
          target.alt = target.alts.length - 1;
          rerenderMsg(idx);
        } else rerenderMsg(idx);
      } else {
        target.alts[target.alt] = text;
        // Which Lorebook entries this reply was written with (per alternate).
        target.lore ||= {};
        if (built.loreIds?.length) target.lore[target.alt] = built.loreIds;
        else delete target.lore[target.alt];
        const mood = detectMood(text);
        const moodChanged = mood !== target.mood;
        target.mood = mood;
        rerenderMsg(idx);
        if (moodChanged && !reducedMotion()) log.querySelector(`.msg[data-i="${idx}"] .msg-av`)?.classList.add('bump');
        if (S.settings.readAloud) speak(text);
        // Fares: what this journey cost, as an estimate (about four characters per token).
        recordFare(conn, sp.id, built.total, estimateTokens(text.slice(prev.length)));
      }
      setBusy(false);
      setStatus('idle');
      root.querySelector('#connDot').classList.toggle('bad', !!error);
      if (error) showError(error, mode);
      else if (text.trim() && !S.settings.seenChatTips) {
        // One-time tip after the first reply: the message actions are otherwise invisible.
        S.settings.seenChatTips = true;
        saveSettings();
        setTimeout(() => !destroyed && toast('Tip: long-press a message to edit, copy or pin it. Swipe a reply sideways for another version.', { action: 'Got it', ms: 9000 }), 500);
      }
      await save();
      toBottom(true);

      // Long chats: condense older messages in the background.
      if (!ix && !error && S.settings.autoSummary && shouldSummarize(chat, conn)) {
        setStatus('summary');
        try {
          await summarize({ chat, char: ch, conn, persona: S.persona });
          if (!destroyed) renderAll(), toBottom();
        } catch (e) {
          console.warn('summary failed', e);
        }
        if (!destroyed) setStatus('idle');
      }
      if (!destroyed) updateTokens();
    }

    function showError(e, mode) {
      const retry = mode === 'continue' ? 'continue' : chat.messages[chat.messages.length - 1]?.role === 'user' ? 'reply' : 'regen';
      log.insertAdjacentHTML(
        'beforeend',
        `<div class="err" role="alert"><b>${esc(e.message || 'Something went wrong.')}</b>${e.hint ? `<p>${esc(e.hint)}</p>` : '<p></p>'}<div class="acts"><button type="button" class="pill press" data-chip="${retry}">${icon('refresh', 15)}Try again</button><a class="pill press" href="#/connections">${icon('link', 15)}Connections</a></div></div>`
      );
      chips.innerHTML = '';
      toBottom(true);
    }

    async function save() {
      await saveChat(chat);
    }

    async function send() {
      const t = input.value.trim();
      if (!t || busy) return;
      stopSpeaking();
      const m = { id: uid(), role: 'user', alts: [t], alt: 0, at: Date.now() };
      chat.messages.push(m);
      const idx = chat.messages.length - 1;
      log.querySelector('.empty')?.remove();
      log.querySelector('.err')?.remove();
      // Drop tools from the previous last message.
      log.querySelectorAll('.msg-tools').forEach((x) => x.remove());
      log.insertAdjacentHTML('beforeend', msgHTML(m, idx, true));
      input.value = '';
      fit();
      toBottom(true);
      await save();
      generate('reply');
    }

    async function switchAlt(dir) {
      const i = lastAiIndex();
      if (i !== chat.messages.length - 1 || busy) return;
      const m = chat.messages[i];
      const next = m.alt + dir;
      if (next < 0) return;
      if (next >= m.alts.length) return generate('regen');
      const b = log.querySelector(`.msg[data-i="${i}"] .bubble`);
      if (b) await motion(b, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 28}px)`, opacity: 0 }], { duration: 140, easing: 'ease-in' }).finished.catch(() => {});
      m.alt = next;
      m.mood = detectMood(textOf(m));
      rerenderMsg(i);
      const nb = log.querySelector(`.msg[data-i="${i}"] .bubble`);
      if (nb) motion(nb, [{ transform: `translateX(${dir * 28}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE_OUT });
      save();
      updateTokens();
    }

    // ---------- message actions ----------
    function messageMenu(el) {
      const i = +el.dataset.i;
      const m = chat.messages[i];
      if (!m || busy) return;
      el.classList.add('lifted');
      openMenu(
        el.querySelector('.bubble'),
        [
          { icon: 'edit', label: 'Edit message', on: () => editMessage(i) },
          { icon: 'copy', label: 'Copy', on: () => copyText(textOf(m)).then(() => toast('Copied')) },
          ...(ttsSupported ? [{ icon: 'speaker', label: 'Read aloud', on: () => speak(textOf(m)) }] : []),
          { icon: 'star', label: m.star ? 'Remove star' : 'Star to Logbook', on: () => toggleStar(m, i) },
          { icon: 'pin', label: 'Pin to notes', on: () => pin(m) },
          '-',
          { icon: 'trash', label: 'Delete', danger: true, on: () => remove(i) },
        ],
        { onClose: () => el.classList.remove('lifted'), spotlight: el.querySelector('.bubble') }
      );
    }
    function editMessage(i) {
      const m = chat.messages[i];
      openSheet({
        label: 'Edit message',
        html: `<h2 class="sheet-title">Edit message</h2><textarea class="input area" id="editTa" rows="7" data-autofocus>${esc(textOf(m))}</textarea><div style="height:14px"></div><div class="sheet-actions"><button type="button" class="btn-primary plate press" data-x><span>Cancel</span></button><button type="button" class="btn-primary press" data-ok><span>Save</span></button></div>`,
        onMount(s, close) {
          s.querySelector('[data-x]').onclick = () => close();
          s.querySelector('[data-ok]').onclick = async () => {
            const v = s.querySelector('#editTa').value.trim();
            if (!v) return toast('A message cannot be empty. Delete it instead.');
            m.alts[m.alt] = v;
            if (m.role === 'assistant') m.mood = detectMood(v);
            rerenderMsg(i);
            await save();
            updateTokens();
            close();
          };
        },
      });
    }
    // Starred messages collect in the Logbook (Platform and Lines › Starred).
    async function toggleStar(m, i) {
      if (m.star) delete m.star;
      else m.star = Date.now();
      rerenderMsg(i);
      await saveChat(chat, false);
      toast(m.star ? 'Starred. It’s in your Logbook.' : 'Removed from your Logbook', m.star ? { action: 'View', onAction: () => (location.hash = '#/lines/starred') } : {});
    }
    async function pin(m) {
      const t = textOf(m).replace(/\s+/g, ' ').trim();
      chat.notes.push({ id: uid(), text: t.length > 220 ? t.slice(0, 217) + '…' : t, at: Date.now() });
      await save();
      root.querySelector('#noteN').textContent = chat.notes.length;
      updateTokens();
      toast('Pinned to notes', { action: 'View', onAction: () => (location.hash = `#/memory/${chat.id}`) });
    }
    async function remove(i) {
      const [m] = chat.messages.splice(i, 1);
      if (chat.summary && i < chat.summary.upto) chat.summary.upto--;
      const el = log.querySelector(`.msg[data-i="${i}"]`);
      if (el) await motion(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 180, easing: 'ease-in' }).finished.catch(() => {});
      renderAll();
      await save();
      updateTokens();
      toast('Message deleted', {
        action: 'Undo',
        onAction: async () => {
          chat.messages.splice(i, 0, m);
          if (chat.summary && i < chat.summary.upto) chat.summary.upto++;
          renderAll();
          await save();
          updateTokens();
        },
      });
    }

    // ---------- header menu ----------
    root.querySelector('#moreBtn').addEventListener('click', (e) =>
      openMenu(e.currentTarget, [
        ...(ix
          ? [{ icon: 'card', label: 'Edit interchange', on: () => (location.hash = `#/interchange/${ix.id}`) }]
          : [{ icon: 'card', label: 'Edit character', on: () => (location.hash = `#/edit/${ch.id}`) }]),
        ...(ix
          ? []
          : [
              { icon: 'image', label: 'Scene', on: sceneSheet },
              { icon: 'spark', label: 'Memory and notes', on: () => (location.hash = `#/memory/${chat.id}`) },
              { icon: 'layers', label: 'Final prompt', on: () => (location.hash = `#/final/${chat.id}`) },
              { icon: 'download', label: 'Export card (PNG)', on: async () => download(await exportCardPng(ch), slug(ch.name) + '.card.png') },
            ]),
        '-',
        ...(ix
          ? []
          : [
              { icon: 'plus', label: 'New chat', on: newChatHere },
              { icon: 'file', label: `Chats with ${ch.name}`, on: chatsSheet },
            ]),
        ...(!ix ? [] : [{
          icon: 'restart',
          label: 'Start a new chat',
          danger: true,
          on: async () => {
            if (!(await confirmSheet({ title: 'Start a new chat?', body: `This clears your chat with ${esc(ch.name)}. Pinned notes stay. You can undo for a few seconds afterwards.`, ok: 'Clear the chat', danger: true }))) return;
            const old = structuredClone(chat);
            const fresh = await resetChat(ch.id);
            for (const k of Object.keys(chat)) delete chat[k];
            Object.assign(chat, fresh);
            renderAll();
            updateTokens();
            toast('Chat cleared', {
              action: 'Undo',
              ms: 8000,
              onAction: async () => {
                for (const k of Object.keys(chat)) delete chat[k];
                Object.assign(chat, old);
                await saveChat(chat);
                if (destroyed) return;
                renderAll();
                toBottom();
                updateTokens();
                root.querySelector('#noteN').textContent = chat.notes.length;
              },
            });
          },
        }]),
      ])
    );

    // ---------- several chats with one character ----------
    async function newChatHere() {
      const c = await startNewChat(ch.id);
      location.hash = `#/chat/${c.id}`;
      toast(`New chat with ${ch.name}. Your other chats are under Chats.`, { ms: 2400 });
    }
    const chatTitle = (c) => {
      const firstYou = c.messages.find((m) => m.role === 'user');
      return firstYou ? plain(textOf(firstYou)).slice(0, 60) : 'Not started yet';
    };
    function chatsSheet() {
      const list = () =>
        chatsFor(ch.id)
          .map(
            (c) =>
              `<div class="chatrow${c.id === chat.id ? ' here' : ''}"><a class="cr-main press" href="#/chat/${c.id}" data-go><span class="cr-t">${esc(chatTitle(c))}</span><span class="cr-s">${c.messages.length} message${c.messages.length === 1 ? '' : 's'} · ${ago(c.updatedAt) === 'now' ? 'just now' : ago(c.updatedAt) + ' ago'}${c.id === chat.id ? ' · open now' : ''}</span></a><button type="button" class="ibtn ghost press" data-del="${c.id}" aria-label="Delete this chat">${icon('trash', 18)}</button></div>`
          )
          .join('');
      openSheet({
        label: `Chats with ${ch.name}`,
        html: `<h2 class="sheet-title">Chats with ${esc(ch.name)}</h2><p class="sheet-p">Each chat is its own story. Notes and memory stay with the chat they were made in.</p>
          <button type="button" class="btn-primary press" id="newChatBtn"><span>New chat</span>${icon('plus', 24)}</button>
          <div class="chatlist" id="chatList">${list()}</div>`,
        onMount(s, close) {
          s.querySelector('#newChatBtn').onclick = () => (close(), newChatHere());
          s.querySelector('#chatList').addEventListener('click', async (e) => {
            if (e.target.closest('[data-go]')) return close();
            const b = e.target.closest('[data-del]');
            if (!b) return;
            const cid = b.dataset.del;
            if (!(await confirmSheet({ title: 'Delete this chat?', body: 'Its messages, notes and summary go too. Other chats with this character stay.', ok: 'Delete chat', danger: true }))) return;
            await deleteChat(cid);
            if (cid === chat.id) {
              close();
              location.hash = `#/chat/${ch.id}`;
              return;
            }
            s.querySelector('#chatList').innerHTML = list();
            toast('Chat deleted');
          });
        },
      });
    }

    function sceneSheet() {
      const chatEl = root.querySelector('#chat');
      const sceneEl = root.querySelector('#scene');
      const apply = (d) => {
        chatEl.style.setProperty('--blur', d.blur + 'px');
        chatEl.style.setProperty('--dim', d.dim / 100);
        sceneEl.innerHTML = d.scene !== 'none' ? sceneSVG(d.scene) : '';
      };
      openSceneSheet({
        value: { scene: ch.scene, blur: ch.sceneBlur ?? 4, dim: ch.sceneDim ?? 60 },
        cta: `Use for ${esc(ch.name)}`,
        onPreview: apply,
        async onSave(d) {
          Object.assign(ch, { scene: d.scene, sceneBlur: d.blur, sceneDim: d.dim });
          await saveCharacter(ch);
          toast('Scene saved');
        },
      });
    }

    // ---------- events ----------
    root.querySelector('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy) ctl?.abort();
      else send();
    });
    input.addEventListener('input', () => (sendBtn.disabled = !busy && !input.value.trim()));
    input.addEventListener('keydown', (e) => {
      const coarse = matchMedia('(pointer: coarse)').matches;
      if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    root.querySelector('#actBtn').addEventListener('click', () => {
      const s = input.selectionStart;
      const e = input.selectionEnd;
      const v = input.value;
      input.value = v.slice(0, s) + '*' + v.slice(s, e) + '*' + v.slice(e);
      input.focus();
      input.setSelectionRange(s + 1, e + 1);
      fit();
      sendBtn.disabled = !input.value.trim();
    });

    const onChip = (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b || busy) return;
      generate(b.dataset.chip);
    };
    chips.addEventListener('click', onChip);
    root.querySelector('#nextbar')?.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-next]');
      if (!b) return;
      chat.next = b.dataset.next;
      renderNext();
      renderChips();
      updateTokens();
      await saveChat(chat, false);
    });

    log.addEventListener('click', (e) => {
      onChip(e);
      const a = e.target.closest('[data-alt]');
      if (a) return switchAlt(+a.dataset.alt);
      if (e.target.closest('[data-lore]')) {
        const m = chat.messages[lastAiIndex()];
        const used = (m?.lore?.[m.alt] || []).map((id) => S.lore.find((x) => x.id === id)).filter(Boolean);
        openSheet({
          label: 'Lorebook entries used',
          html: `<h2 class="sheet-title">Lorebook in this reply</h2><p class="sheet-p">Sent with this reply: a keyword came up in the chat, or the entry is always on.</p><div class="lore-list">${used
            .map((x) => `<a class="lore-row press" href="#/lore/${x.id}" data-close><span class="lore-main"><span class="lore-t">${esc(x.title || x.keys[0] || 'Untitled entry')}</span><span class="lore-keys">${x.always ? '<span class="kchip always">Always</span>' : ''}${x.keys.slice(0, 5).map((k) => `<span class="kchip">${esc(k)}</span>`).join('')}</span></span>${icon('chev', 18)}</a>`)
            .join('')}</div>`,
          onMount(s, close) {
            s.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close()));
          },
        });
        return;
      }
      if (e.target.closest('[data-read]')) {
        const i = lastAiIndex();
        speak(textOf(chat.messages[i]));
      }
    });
    log.addEventListener('contextmenu', (e) => {
      const el = e.target.closest('.msg');
      if (!el) return;
      e.preventDefault();
      messageMenu(el);
    });

    // Long press opens the message menu; horizontal swipe on the last reply flips alternates.
    let press = null;
    log.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.msg');
      if (!el || e.target.closest('button,a') || e.button === 2) return;
      const bubble = el.querySelector('.bubble');
      press = { el, bubble, x: e.clientX, y: e.clientY, dx: 0, swipe: false, t: setTimeout(() => (press && !press.swipe ? (messageMenu(el), (press = null)) : 0), 480) };
    });
    log.addEventListener('pointermove', (e) => {
      if (!press) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (Math.abs(dy) > 10 && !press.swipe) return clearTimeout(press.t), (press = null);
      const isLast = +press.el.dataset.i === chat.messages.length - 1 && press.el.classList.contains('ai');
      if (Math.abs(dx) > 10 && isLast && !busy) {
        clearTimeout(press.t);
        press.swipe = true;
        press.dx = dx;
        press.bubble.style.transform = `translateX(${dx * 0.6}px) rotate(${dx * 0.02}deg)`;
      } else if (Math.abs(dx) > 10) clearTimeout(press.t), (press = null);
    });
    const endPress = () => {
      if (!press) return;
      clearTimeout(press.t);
      const p = press;
      press = null;
      if (!p.swipe) return;
      p.bubble.style.transition = reducedMotion() ? '' : `transform .32s ${EASE_OUT}`;
      p.bubble.style.transform = '';
      setTimeout(() => (p.bubble.style.transition = ''), 340);
      if (Math.abs(p.dx) > 70) switchAlt(p.dx < 0 ? 1 : -1);
    };
    log.addEventListener('pointerup', endPress);
    log.addEventListener('pointercancel', endPress);

    renderAll();
    if (ix) renderNext();
    toBottom();
    updateTokens();
    // Opened from the Logbook or a search hit: bring that message into view and mark it briefly.
    const focusEl = focusId && log.querySelector(`.msg[data-id="${CSS.escape(focusId)}"]`);
    if (focusEl) {
      focusEl.scrollIntoView({ block: 'center' });
      focusEl.classList.add('found');
      setTimeout(() => focusEl.classList.remove('found'), 2200);
    } else if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
  }

  return {
    html,
    depth: 1,
    mount,
    unmount() {
      destroyed = true;
      ctl?.abort();
      stopSpeaking();
    },
  };
}
