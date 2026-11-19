import { S, character, getChat, saveChat, saveCharacter, connectionFor, textOf, resetChat } from '../store.js';
import { complete, PROVIDERS } from '../providers.js';
import { buildPrompt } from '../prompt.js';
import { shouldSummarize, summarize } from '../memory.js';
import { esc, uid, formatMessage, fmtNum, detectMood, copyText, download, slug, reducedMotion } from '../util.js';
import { avatarTile } from '../avatar.js';
import { sceneSVG, SCENES } from '../scenes.js';
import { speak, stopSpeaking, ttsSupported } from '../tts.js';
import { exportCardPng } from '../cards.js';
import { ibtn, avatarBullet, icon, arrow, openMenu, openSheet, toast, confirmSheet, autosize, ruler, bindRuler, reel } from '../ui.js';

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

export async function chatView(id) {
  const ch = character(id);
  if (!ch) return null;
  const chat = await getChat(id);
  let ctl = null;
  let busy = false;
  let destroyed = false;

  const conn0 = connectionFor(ch);
  const html = `<div class="chat" id="chat" style="--blur:${ch.sceneBlur ?? 4}px;--dim:${(ch.sceneDim ?? 60) / 100}">
    <div class="chat-scene" id="scene" aria-hidden="true">${ch.scene && ch.scene !== 'none' ? sceneSVG(ch.scene) : ''}</div>
    <header class="chat-head">
      ${ibtn('back', 'Back to home', { href: '#/' })}
      <a class="chat-who press" href="#/edit/${ch.id}" aria-label="Edit ${esc(ch.name)}">${avatarBullet(ch, 42, `view-transition-name:line-${ch.id}`)}<span class="who-tx"><span class="who-n">${esc(ch.name)}</span><span class="who-s" id="status">${esc(ch.tagline || 'Online')}</span></span></a>
      ${ibtn('more', 'Chat options', { id: 'moreBtn' })}
    </header>
    <div class="chat-meta">
      <a class="pill press" href="#/connections" aria-label="Switch connection"><span class="dot"></span><span class="ell" id="connName">${esc(conn0 ? conn0.model || conn0.name : 'No connection')}</span></a>
      <span class="pill muted" id="tokPill" ${S.settings.showCounter ? '' : 'hidden'} title="Estimated tokens sent with the next reply">${icon('layers', 14)}<span class="num" id="tokN">…</span></span>
      <a class="pill y press end" href="#/memory/${ch.id}">${icon('pin', 15)}<span id="noteN">${chat.notes.length}</span>&nbsp;note${chat.notes.length === 1 ? '' : 's'}</a>
    </div>
    <div class="log" id="log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="chips" id="chips"></div>
    <form class="composer" id="composer">
      ${ibtn('asterisk', 'Add an action in asterisks', { id: 'actBtn' })}
      <textarea id="input" rows="1" placeholder="Message ${esc(ch.name)}…" aria-label="Message ${esc(ch.name)}" enterkeyhint="send"></textarea>
      <button type="submit" class="send press" id="sendBtn" aria-label="Send" disabled>${arrow(24, '#FFFFFF')}</button>
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
      return pager || read ? `<div class="msg-tools">${pager}${read}</div>` : '';
    }
    function msgHTML(m, i, enter = false) {
      const cls = `msg ${m.role === 'user' ? 'user' : 'ai'}${enter ? ' enter' : ''}`;
      if (m.role === 'user') return `<div class="${cls}" data-i="${i}" data-id="${m.id}"><div class="bubble">${formatMessage(textOf(m))}</div></div>`;
      return `<div class="${cls}" data-i="${i}" data-id="${m.id}">${avatarTile(ch, 30, { expr: m.mood || 'happy', radius: 10, cls: 'msg-av' })}<div class="msg-col"><div class="bubble">${formatMessage(textOf(m))}</div>${toolsHTML(m, i)}</div></div>`;
    }
    function renderAll() {
      const cut = chat.summary?.upto || 0;
      let h = '';
      chat.messages.forEach((m, i) => {
        if (cut && i === cut) h += `<a class="stop-line" href="#/memory/${ch.id}">${icon('spark', 14)} Earlier stops summarized</a>`;
        h += msgHTML(m, i);
      });
      if (!chat.messages.length) h = `<div class="empty">Say hello to ${esc(ch.name)}. Wrap actions in *asterisks*.</div>`;
      log.innerHTML = h;
      renderChips();
    }
    function rerenderMsg(i) {
      const el = log.querySelector(`.msg[data-i="${i}"]`);
      if (el) el.outerHTML = msgHTML(chat.messages[i], i);
    }
    function renderChips() {
      if (busy) return (chips.innerHTML = '');
      const last = chat.messages[chat.messages.length - 1];
      let h = '';
      if (last?.role === 'assistant' && !last.first) h = `<button type="button" class="press" data-chip="regen">${icon('refresh', 16)}Regenerate</button><button type="button" class="press" data-chip="continue">${icon('chev', 16)}Continue</button>`;
      else if (last?.role === 'user') h = `<button type="button" class="press" data-chip="reply">${icon('refresh', 16)}Get a reply</button>`;
      chips.innerHTML = h;
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
      const b = buildPrompt({ char: ch, chat, conn: c, settings: S.settings, persona: S.persona });
      root.querySelector('#tokN').textContent = fmtNum(b.total);
    }
    function setBusy(v) {
      busy = v;
      sendBtn.classList.toggle('stopping', v);
      sendBtn.innerHTML = v ? icon('stop', 20) : arrow(24, '#FFFFFF');
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
      const built = buildPrompt({ char: ch, chat, conn, settings: S.settings, persona: S.persona, upto, mode });

      // Prepare the bubble.
      let el = log.querySelector(`.msg[data-i="${idx}"]`);
      if (mode === 'reply') {
        log.querySelector('.empty')?.remove();
        log.insertAdjacentHTML('beforeend', msgHTML(target, idx, true));
        el = log.querySelector(`.msg[data-i="${idx}"]`);
      }
      const bubble = el.querySelector('.bubble');
      el.querySelector('.msg-tools')?.remove();
      const prev = mode === 'continue' ? textOf(target) : '';
      if (mode === 'regen') {
        await bubble.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-30px)' }], { duration: 180, easing: 'ease-in' }).finished.catch(() => {});
        bubble.style.opacity = '';
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
          character: ch,
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
        const mood = detectMood(text);
        const moodChanged = mood !== target.mood;
        target.mood = mood;
        rerenderMsg(idx);
        if (moodChanged) log.querySelector(`.msg[data-i="${idx}"] .msg-av`)?.classList.add('bump');
        if (S.settings.readAloud) speak(text);
      }
      setBusy(false);
      setStatus('idle');
      if (error) showError(error, mode);
      await save();
      toBottom(true);

      // Long chats: condense older messages in the background.
      if (!error && S.settings.autoSummary && shouldSummarize(chat, conn)) {
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
      if (b && !reducedMotion()) await b.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 36}px)`, opacity: 0 }], { duration: 150, easing: 'ease-in' }).finished.catch(() => {});
      m.alt = next;
      m.mood = detectMood(textOf(m));
      rerenderMsg(i);
      const nb = log.querySelector(`.msg[data-i="${i}"] .bubble`);
      if (nb && !reducedMotion()) nb.animate([{ transform: `translateX(${dir * 36}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
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
          { icon: 'pin', label: 'Pin to notes', on: () => pin(m) },
          '-',
          { icon: 'trash', label: 'Delete', danger: true, on: () => remove(i) },
        ],
        { onClose: () => el.classList.remove('lifted') }
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
    async function pin(m) {
      const t = textOf(m).replace(/\s+/g, ' ').trim();
      chat.notes.push({ id: uid(), text: t.length > 220 ? t.slice(0, 217) + '…' : t, at: Date.now() });
      await save();
      root.querySelector('#noteN').textContent = chat.notes.length;
      updateTokens();
      toast('Pinned to notes', { action: 'View', onAction: () => (location.hash = `#/memory/${ch.id}`) });
    }
    async function remove(i) {
      const [m] = chat.messages.splice(i, 1);
      if (chat.summary && i < chat.summary.upto) chat.summary.upto--;
      const el = log.querySelector(`.msg[data-i="${i}"]`);
      if (el && !reducedMotion()) await el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 200, easing: 'ease-in' }).finished.catch(() => {});
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
        { icon: 'card', label: 'Edit character', on: () => (location.hash = `#/edit/${ch.id}`) },
        { icon: 'image', label: 'Scene', on: sceneSheet },
        { icon: 'spark', label: 'Memory and notes', on: () => (location.hash = `#/memory/${ch.id}`) },
        { icon: 'layers', label: 'Final prompt', on: () => (location.hash = `#/final/${ch.id}`) },
        { icon: 'download', label: 'Export card (PNG)', on: async () => download(await exportCardPng(ch), slug(ch.name) + '.card.png') },
        '-',
        {
          icon: 'restart',
          label: 'Start a new chat',
          danger: true,
          on: async () => {
            if (!(await confirmSheet({ title: 'Start a new chat?', body: `This clears your chat with ${esc(ch.name)}. Pinned notes stay. Export a backup first if you want to keep it.`, ok: 'Start over', danger: true }))) return;
            const fresh = await resetChat(ch.id);
            Object.assign(chat, fresh);
            renderAll();
            updateTokens();
          },
        },
      ])
    );

    function sceneSheet() {
      const orig = { scene: ch.scene, blur: ch.sceneBlur ?? 4, dim: ch.sceneDim ?? 60 };
      let d = { ...orig };
      const chatEl = root.querySelector('#chat');
      const sceneEl = root.querySelector('#scene');
      const apply = () => {
        chatEl.style.setProperty('--blur', d.blur + 'px');
        chatEl.style.setProperty('--dim', d.dim / 100);
        sceneEl.innerHTML = d.scene !== 'none' ? sceneSVG(d.scene) : '';
      };
      let saved = false;
      openSheet({
        label: 'Scene',
        html: `<div class="sheet-head"><h2 class="t2" style="font-size:28px"><span>Scene</span><span class="sub">Behind the chat</span></h2></div>
          <div class="grid3" id="scGrid">${SCENES.map((s) => `<button type="button" class="pick press" data-k="${s.key}" aria-pressed="${s.key === d.scene}"><span class="thumb scene">${sceneSVG(s.key)}<span class="check">${`<span class="bullet" style="width:24px;height:24px;background:var(--yellow);color:var(--bg)">${icon('check', 13)}</span>`}</span></span><span class="nm">${s.name}</span></button>`).join('')}</div>
          <div class="stack" style="margin:18px 0">${ruler('scBlur', 'Blur', d.blur, 20)}${ruler('scDim', 'Dim', d.dim, 100)}</div>
          <button type="button" class="btn-primary press" id="scSave"><span>Use for ${esc(ch.name)}</span>${arrow(30)}</button>`,
        onMount(s, close) {
          s.querySelector('#scGrid').addEventListener('click', (e) => {
            const b = e.target.closest('[data-k]');
            if (!b) return;
            d.scene = b.dataset.k;
            s.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-pressed', x === b));
            apply();
          });
          bindRuler(s.querySelector('#scBlur').closest('.ruler-wrap'), (v) => ((d.blur = v), apply()));
          bindRuler(s.querySelector('#scDim').closest('.ruler-wrap'), (v) => ((d.dim = v), apply()));
          s.querySelector('#scSave').onclick = async () => {
            saved = true;
            Object.assign(ch, { scene: d.scene, sceneBlur: d.blur, sceneDim: d.dim });
            await saveCharacter(ch);
            close();
            toast('Scene saved');
          };
        },
        onClose() {
          if (!saved) (d = orig), apply();
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

    log.addEventListener('click', (e) => {
      onChip(e);
      const a = e.target.closest('[data-alt]');
      if (a) return switchAlt(+a.dataset.alt);
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
      p.bubble.style.transition = 'transform .4s cubic-bezier(.34,1.56,.64,1)';
      p.bubble.style.transform = '';
      setTimeout(() => (p.bubble.style.transition = ''), 400);
      if (Math.abs(p.dx) > 70) switchAlt(p.dx < 0 ? 1 : -1);
    };
    log.addEventListener('pointerup', endPress);
    log.addEventListener('pointercancel', endPress);

    renderAll();
    toBottom();
    updateTokens();
    if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
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
