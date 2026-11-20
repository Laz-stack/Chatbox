import { S, character, getChat, saveChat, saveCharacter, saveSettings, connectionFor, textOf, named, resetChat, recordFare, interchange, isInterchangeId, chatsFor, startNewChat, deleteChat, blankCharacter, saveInterchange, personaFor, personaById, newChat } from '../store.js';
import { textSheet } from './text.js';
import { STEER, parseScene, splitTurn, hasCastLines, resolveSpeaker, passengersIn, demoScene } from '../scene.js';
import { complete, PROVIDERS } from '../providers.js';
import { buildPrompt } from '../prompt.js';
import { shouldSummarize, summarize } from '../memory.js';
import { esc, uid, formatMessage, markProse, fmtNum, estimateTokens, inkOn, ago, plain, detectMood, copyText, download, slug, reducedMotion, motion, lineAccent, EASE_OUT } from '../util.js';
import { avatarTile } from '../avatar.js';
import { sceneSVG } from '../scenes.js';
import { sceneSheet as openSceneSheet } from '../scenepicker.js';
import { speak, stopSpeaking, ttsSupported } from '../tts.js';
import { exportCardPng } from '../cards.js';
import { ibtn, avatarBullet, icon, arrow, openMenu, openSheet, toast, confirmSheet, autosize, reel } from '../ui.js';

// Streams text into a bubble word by word, keeping *actions* italic as they arrive.
class StreamRenderer {
  // prose: text outside "quotes" shows as an action while it streams, matching markProse().
  constructor(el, caret, prose = false) {
    this.el = el;
    this.caret = caret;
    this.inAct = false;
    this.prose = prose;
    this.inQuote = null;
    this.open();
  }
  open() {
    this.cur = document.createElement('span');
    if (this.inAct || (this.prose && !this.inQuote)) this.cur.className = 'act';
    this.el.insertBefore(this.cur, this.caret);
  }
  tok(t) {
    const s = document.createElement('span');
    s.className = 'tok';
    s.textContent = t;
    this.cur.appendChild(s);
  }
  push(text) {
    for (const part of text.split(/(\*|\n|\s+|["“”])/)) {
      if (!part) continue;
      if (this.prose && !this.inAct && /^["“”]$/.test(part)) {
        if (!this.inQuote) (this.inQuote = part === '“' ? '”' : '"'), this.open(), this.tok(part);
        else if (part === this.inQuote || part === '”') this.tok(part), (this.inQuote = null), this.open();
        else this.tok(part);
        continue;
      }
      if (part === '*') {
        this.inAct = !this.inAct;
        this.open();
      } else if (part === '\n') {
        this.el.insertBefore(document.createElement('br'), this.caret);
        this.inQuote = null;
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
  // A Carriage is an Interchange in "One scene" mode: one reply narrates the scene and voices everyone.
  const scene = ix?.mode === 'scene';
  const ch = ix ? { ...ix.people[0], id: ix.id, name: ix.title, tagline: scene ? `Carriage · ${ix.people.length} aboard` : `Interchange · ${ix.people.length} lines`, connectionId: null } : character(owner);
  if (!ch) return null;
  const speakerOf = (m) => (ix ? ix.people.find((p) => p.id === m?.speaker) || ix.people[0] : ch);
  const group = ix ? { people: ix.people, scene: ix.scene, world: ix.world || '', mode: ix.mode || 'turns', passengers: ix.passengers !== false } : null;
  // Who you are in this chat (its own pick, else your default persona).
  const me = () => personaFor(chat);
  const youWho = () => ({ name: me().name?.trim() || 'You', preset: me().preset, avatarImage: me().avatarImage, line: { color: '#FDCD15' } });
  const chat = await getChat(id);
  if (!chat) return null;
  let ctl = null;
  let busy = false;
  let destroyed = false;

  const conn0 = connectionFor(ch);
  const connText = (c) => (!c ? 'No connection' : c.provider === 'demo' ? 'Demo replies' : String(c.model || c.name).split('/').pop());
  // Short placeholder: a long name would wrap the composer onto several lines.
  const callName = scene ? 'the scene' : ix ? 'the interchange' : ch.name.length > 14 ? ch.name.split(/\s+/)[0].slice(0, 14) : ch.name;
  const html = `<div class="chat" id="chat" style="--blur:${ch.sceneBlur ?? 4}px;--dim:${(ch.sceneDim ?? 60) / 100};--accent:${lineAccent(ch.line?.color)}">
    <div class="chat-scene" id="scene" aria-hidden="true">${ch.scene && ch.scene !== 'none' ? sceneSVG(ch.scene) : ''}</div>
    <header class="chat-head">
      ${ibtn('back', 'Back to home', { href: '#/' })}
      <button type="button" class="chat-who press" id="whoBtn" aria-haspopup="dialog" aria-label="${esc(ch.name)}: chat details">${ix ? `<span class="meet">${ix.people.slice(0, 4).map((p, i) => avatarBullet(p, 32, i ? 'margin-left:-10px' : '')).join('')}</span>` : avatarBullet(ch, 36, '', `head:${ch.id}`)}<span class="who-tx"><span class="who-n">${esc(ch.name)}</span><span class="who-s"><span class="who-meta" id="meta"><span class="dot${conn0?.provider === 'demo' ? ' demo' : ''}" id="connDot"></span><span class="ell" id="connName">${esc(connText(conn0))}</span><span id="tokPill" ${S.settings.showCounter ? '' : 'hidden'}>· <span class="num" id="tokN">…</span></span><span id="noteWrap" ${!ix && chat.notes.length ? '' : 'hidden'}>· ${icon('pin', 12)}<span id="noteN">${chat.notes.length}</span></span></span><span id="status" hidden></span></span></span></button>
      ${ibtn('more', 'Chat options', { id: 'moreBtn' })}
    </header>
    <div class="log${ix ? ' story' : ''}" id="log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Chat with ${esc(ch.name)}"></div>
    <div class="chips${scene ? ' steer' : ''}" id="chips"></div>
    ${ix && !scene ? '<div class="nextbar" id="nextbar" role="radiogroup" aria-label="Who answers next"></div>' : ''}
    <form class="composer" id="composer">
      ${scene ? `<button type="button" class="ibtn as-btn press" id="asBtn" aria-label="Speaking as you. Tap to speak as someone else." aria-haspopup="menu">${avatarBullet(youWho(), 32)}</button>` : ''}
      ${ibtn('asterisk', 'Add an *action*', { id: 'actBtn', attrs: 'title="Add an *action*: wraps the selection in asterisks"' })}
      <textarea id="input" rows="1" placeholder="${scene ? 'What you do or say…' : `Message ${esc(callName)}…`}" aria-label="Message ${esc(ch.name)}" enterkeyhint="send"></textarea>
      <button type="submit" class="send press" id="sendBtn" aria-label="Send" disabled>${arrow(22, 'currentColor')}</button>
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
          ? m.first
            ? `<div class="pager opening"><button type="button" data-alt="-1" aria-label="Previous opening" ${m.alt === 0 ? 'disabled' : ''}>${icon('back', 18)}</button><span class="num" aria-live="polite">Opening ${m.alt + 1} of ${m.alts.length}</span><button type="button" data-alt="1" aria-label="Next opening" ${m.alt === m.alts.length - 1 ? 'disabled' : ''}>${icon('chev', 18)}</button></div>`
            : `<div class="pager"><button type="button" data-alt="-1" aria-label="Previous reply" ${m.alt === 0 ? 'disabled' : ''}>${icon('back', 18)}</button><span class="num" aria-live="polite">${m.alt + 1} / ${m.alts.length}</span><button type="button" data-alt="1" aria-label="Next reply">${icon('chev', 18)}</button></div>`
          : '';
      const read = ttsSupported ? `<button type="button" class="mini press" data-read aria-label="Read aloud">${icon('speaker', 18)}</button>` : '';
      const used = (m.lore?.[m.alt] || []).filter((id) => S.lore.some((e) => e.id === id));
      const lore = used.length ? `<button type="button" class="mini lore-used press" data-lore aria-label="${used.length} Lorebook entr${used.length === 1 ? 'y' : 'ies'} used">${icon('book', 16)}<span class="num">${used.length}</span></button>` : '';
      return pager || read || lore ? `<div class="msg-tools">${pager}${read}${lore}</div>` : '';
    }
    // ---------- Carriage: the story layout ----------
    // AI text with unmarked prose shown as actions (Reply style › Formatting: Asterisks, the default).
    const proseOn = () => (S.settings.replyStyle?.format || 'asterisks') === 'asterisks';
    const showAi = (t) => (proseOn() ? markProse(t) : t);
    const fillS = (t, who) => named(t, who || ix.people[0], 'you', me());
    // One block's markup; data-k lets the streamer update a block in place instead of rebuilding it.
    function blockHTML(r, text, { by = false, save = false } = {}) {
      if (r.kind === 'narr') return `<p class="scn-narr" data-k="narr">${formatMessage(showAi(fillS(text)))}</p>`;
      if (r.kind === 'passenger')
        return `<div class="scn-b pass" data-k="p:${esc(r.name.toLowerCase())}"><span class="scn-tag">${esc(r.name)}</span><div class="scn-t">${formatMessage(showAi(fillS(text)))}</div>${save ? `<button type="button" class="scn-save press" data-pass="${esc(r.name)}">${icon('plus', 14)}Save as a line</button>` : ''}</div>`;
      const who = r.kind === 'you' ? youWho() : r.who;
      const col = who.line?.color || '#2EAA67';
      return `<div class="scn-b${r.kind === 'you' ? ' you' : ''}" data-k="${r.kind === 'you' ? 'you' : 'l:' + who.id}" style="--c:${col};--ink:${inkOn(col)}"><span class="scn-tag">${avatarBullet(who, 20)}${esc(r.kind === 'you' ? 'You' : who.name)}${by ? '<small>· you wrote</small>' : ''}</span><div class="scn-t">${formatMessage(r.kind === 'you' || by ? fillS(text, r.who) : showAi(fillS(text, r.who)))}</div></div>`;
    }
    function sceneParts(text, m, streaming = false) {
      const shown = new Set();
      // A Take-turns reply has one known speaker: split it into narration and that speaker's lines.
      // Unless the text itself names the cast ("Sina: …"), e.g. a reply first written in Take turns and regenerated as a scene.
      const blocks = m?.speaker && !hasCastLines(text, ix.people) ? splitTurn(text, speakerOf(m).name) : parseScene(text);
      return blocks.map((b) => {
        if (b.kind === 'narr') return blockHTML({ kind: 'narr' }, b.text);
        const r = resolveSpeaker(b.name, ix.people, me().name);
        let save = false;
        if (r.kind === 'passenger' && m && !streaming) {
          const key = r.name.toLowerCase();
          const pe = (chat.passengers || []).find((x) => x.name.toLowerCase() === key);
          save = !!pe && !pe.line && pe.first === m.id && !shown.has(key);
          shown.add(key);
        }
        return blockHTML(r, b.text, { save });
      });
    }
    // While streaming: keep finished blocks, update the growing one, append new ones (their tags fade in).
    function paintScene(box, text, caret, m = null) {
      caret.remove();
      const parts = sceneParts(text, m, true);
      const tpl = document.createElement('template');
      parts.forEach((h, j) => {
        tpl.innerHTML = h;
        const n = tpl.content.firstElementChild;
        const cur = box.children[j];
        if (cur && cur.dataset.k === n.dataset.k) {
          if (cur._h === h) return;
          const t1 = cur.querySelector('.scn-t');
          const t2 = n.querySelector('.scn-t');
          if (t1 && t2) t1.innerHTML = t2.innerHTML;
          else cur.innerHTML = n.innerHTML;
          cur._h = h;
        } else {
          n._h = h;
          n.classList.add('fresh');
          if (cur) cur.replaceWith(n);
          else box.appendChild(n);
        }
      });
      while (box.children.length > parts.length) box.lastElementChild.remove();
      const last = box.lastElementChild;
      (last?.querySelector('.scn-t') || last || box).appendChild(caret);
    }
    function sceneMsgHTML(m, i, enter) {
      const star = m.star || m.quotes?.length ? `<span class="star-b" title="In your Logbook">${icon('star', 13)}</span>` : '';
      let inner;
      if (m.role === 'user') {
        if (m.dir) inner = `<p class="scn-dir">${icon(STEER[m.dir]?.icon || 'chev', 14)}${esc(STEER[m.dir]?.label || 'Direction')}</p>`;
        else if (m.as) inner = blockHTML({ kind: 'line', who: speakerOf({ speaker: m.as }) }, textOf(m), { by: true });
        else inner = blockHTML({ kind: 'you' }, textOf(m));
      } else inner = sceneParts(textOf(m), m).join('');
      return `<div class="msg scene ${m.role === 'user' ? 'mine' : 'ai'}${m.dir ? ' dir' : ''}${enter ? ' enter' : ''}${m.star ? ' starred' : ''}" data-i="${i}" data-id="${m.id}"><div class="msg-col"><div class="bubble scn">${inner}${star}</div>${m.role === 'assistant' ? toolsHTML(m, i) : ''}</div></div>`;
    }
    function renderAboard() {
      const bar = document.querySelector('#aboard');
      if (!bar || !ix) return;
      bar.innerHTML =
        '<span class="lbl">On board</span>' +
        ix.people.map((p) => `<span class="ab" style="--c:${p.line?.color || '#2EAA67'}">${avatarBullet(p, 24)}${esc(p.name)}</span>`).join('') +
        (chat.passengers || []).filter((p) => !p.line).map((p) => `<button type="button" class="ab pass press" data-pass="${esc(p.name)}" aria-label="${esc(p.name)}, a passenger. Tap to save as a line.">${esc(p.name)}</button>`).join('');
    }
    function msgHTML(m, i, enter = false) {
      if (ix) return sceneMsgHTML(m, i, enter);
      const cls = `msg ${m.role === 'user' ? 'user' : 'ai'}${enter ? ' enter' : ''}`;
      const star = m.star || m.quotes?.length ? `<span class="star-b" title="In your Logbook">${icon('star', 13)}</span>` : '';
      if (m.role === 'user') return `<div class="${cls}${m.star ? ' starred' : ''}" data-i="${i}" data-id="${m.id}"><div class="bubble">${formatMessage(named(textOf(m), ch, 'you', me()))}${star}</div></div>`;
      const sp = speakerOf(m);
      const tag = ix ? `<span class="spk-tag" style="--c:${sp.line?.color || '#2EAA67'};--ink:${inkOn(sp.line?.color || '#2EAA67')}">${esc(sp.name)}</span>` : '';
      return `<div class="${cls}${m.star || m.quotes?.length ? ' starred' : ''}" data-i="${i}" data-id="${m.id}">${avatarTile(sp, 30, { expr: m.mood || 'happy', radius: 10, cls: 'msg-av' })}<div class="msg-col"><div class="bubble">${tag}${formatMessage(showAi(named(textOf(m), sp, 'you', me())))}${star}</div>${toolsHTML(m, i)}</div></div>`;
    }
    function renderAll() {
      const cut = chat.summary?.upto || 0;
      let h = '';
      chat.messages.forEach((m, i) => {
        if (cut && i === cut) h += `<a class="stop-line" href="#/memory/${chat.id}">${icon('spark', 14)} Earlier stops summarized</a>`;
        h += msgHTML(m, i);
      });
      if (scene) {
        h = `<div class="scn-card"><span class="scn-card-h"><b>Scene</b><a class="scn-edit press" href="#/interchange/${ix.id}">Edit</a></span>${ix.scene?.trim() ? esc(ix.scene.trim()) : ix.world?.trim() ? 'The world, its rules and the cast came with the imported card. Swipe the first message to pick where the story starts.' : 'No scene set yet. Tap Edit to say where everyone is.'}</div>${h}`;
        if (!chat.messages.length) h += `<p class="empty scn-empty">${esc(ix.people.length > 1 ? ix.people.slice(0, -1).map((p) => p.name).join(', ') + ' and ' + ix.people[ix.people.length - 1].name : ix.people[0].name)} are on board. Write what you do, or tap <b>Let them talk</b> to get the scene going.</p>`;
      } else if (!chat.messages.length)
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
    const writeChip = () => `<button type="button" class="press" data-chip="write">${icon('edit', 16)}Write for me</button>`;
    function renderChips() {
      // While a reply is being written the chips stay in place, disabled, so nothing jumps.
      chips.classList.toggle('wait', busy);
      if (busy) return chips.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const last = chat.messages[chat.messages.length - 1];
      let h = '';
      if (scene) {
        if (last?.role === 'user' && !last.dir) h += `<button type="button" class="press" data-chip="reply">${icon('refresh', 16)}Get the scene</button>`;
        // After a reply, the reply's own actions come first; the steering choices follow the separator.
        if (last?.role === 'assistant' && !last.first) h += `<button type="button" class="press" data-chip="regen">${icon('refresh', 16)}Regenerate</button><button type="button" class="press" data-chip="continue">${icon('chev', 16)}Continue</button>${writeChip()}<span class="chip-sep" aria-hidden="true"></span>`;
        h += Object.entries(STEER).map(([k, s]) => `<button type="button" class="press" data-steer="${k}">${icon(s.icon, 16)}${s.label}</button>`).join('');
        chips.innerHTML = h;
        chips.scrollLeft = 0;
        return;
      }
      if (last?.role === 'assistant' && last.first) h = writeChip();
      if (last?.role === 'assistant' && !last.first) {
        h = `<button type="button" class="press" data-chip="regen">${icon('refresh', 16)}Regenerate</button><button type="button" class="press" data-chip="continue">${icon('chev', 16)}Continue</button>` + writeChip();
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
      const meta = root.querySelector('#meta');
      meta.hidden = kind !== 'idle';
      status.hidden = kind === 'idle';
      status.classList.toggle('busy', kind !== 'idle');
      if (kind === 'typing') status.innerHTML = 'typing <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      else if (kind === 'you') status.innerHTML = 'writing your line <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      else if (kind === 'summary') status.innerHTML = `${reel(16, { spd: 0.8 })} summarizing`;
      else status.textContent = '';
    }
    function updateTokens() {
      const c = connectionFor(ch);
      const who = ix ? speakerOf({ speaker: chat.next && chat.next !== 'either' ? chat.next : ix.people[0].id }) : ch;
      const b = buildPrompt({ char: who, chat, conn: c, settings: S.settings, persona: me(), group });
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
        if (ix && !scene) target.speaker = pickSpeaker().id;
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
      // In demo mode a Carriage gets a canned scene in the right format.
      const asked = scene ? { ...sp, name: ix.title, demoText: (last) => demoScene(ix.people.map((p) => p.name), last) } : sp;
      const built = buildPrompt({ char: sp, chat, conn, settings: S.settings, persona: me(), upto, mode, group });

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
      bubble.innerHTML = mode === 'continue' ? formatMessage(showAi(prev)) : '';
      const caret = document.createElement('span');
      caret.className = 'caret';
      caret.setAttribute('aria-hidden', 'true');
      bubble.appendChild(caret);
      let raf = 0;
      const rd = ix
        ? { push: () => raf || (raf = requestAnimationFrame(() => ((raf = 0), !destroyed && paintScene(bubble, text, caret, target)))) }
        : new StreamRenderer(bubble, caret, proseOn());
      if (ix && prev) paintScene(bubble, prev, caret, target);
      if (!ix && mode === 'continue' && /\*/.test(prev) && (prev.match(/\*/g) || []).length % 2) rd.inAct = !rd.inAct, rd.open();
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
          maxTokens: S.settings.replyStyle?.length === 'long' ? Math.max(conn.maxTokens || 600, 1000) : conn.maxTokens,
          temperature: conn.temperature,
          character: asked,
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
      cancelAnimationFrame(raf);
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
        if (scene) {
          // Side characters who spoke for the first time become passengers (they can be saved as lines).
          chat.passengers ||= [];
          for (const n of passengersIn(text, ix.people, me().name))
            if (!chat.passengers.some((x) => x.name.toLowerCase() === n.toLowerCase())) chat.passengers.push({ name: n, first: target.id });
          renderAboard();
        }
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
          await summarize({ chat, char: ch, conn, persona: me() });
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
      if (speakAs) (m.as = speakAs), setSpeakAs(null);
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

    // Steering bar: a stage direction the AI follows (shown in the log as a small sign), then the scene moves on.
    async function steer(k) {
      if (busy || !STEER[k]) return;
      const m = { id: uid(), role: 'user', dir: k, alts: [STEER[k].note], alt: 0, at: Date.now() };
      chat.messages.push(m);
      log.querySelector('.empty')?.remove();
      log.querySelector('.err')?.remove();
      log.querySelectorAll('.msg-tools').forEach((x) => x.remove());
      log.insertAdjacentHTML('beforeend', msgHTML(m, chat.messages.length - 1, true));
      toBottom(true);
      await save();
      generate('reply');
    }
    // Speak as: your next line is written for one of the cast instead of yourself.
    let speakAs = null;
    function setSpeakAs(id) {
      speakAs = id;
      const b = root.querySelector('#asBtn');
      if (!b) return;
      const p = id ? speakerOf({ speaker: id }) : null;
      b.innerHTML = avatarBullet(p || youWho(), 32);
      b.classList.toggle('on', !!p);
      b.setAttribute('aria-label', p ? `Speaking as ${p.name}. Tap to change.` : 'Speaking as you. Tap to speak as someone else.');
      input.placeholder = p ? `Write ${p.name}'s line…` : 'What you do or say…';
    }
    function passengerSheet(name) {
      const key = name.toLowerCase();
      const said = chat.messages
        .filter((m) => m.role === 'assistant')
        .flatMap((m) => parseScene(textOf(m)).filter((b) => b.kind === 'say' && b.name.toLowerCase() === key).map((b) => b.text));
      const room = ix.people.length < 5;
      openSheet({
        label: name,
        html: `<h2 class="sheet-title">${esc(name)}</h2><p class="sheet-p">A passenger in this scene. Save them as a line to give them a colour, a Blueprint and chats of their own.${room ? ' They also join this carriage.' : ''}</p>${
          said.length ? `<div class="pass-said">${said.slice(-3).map((t) => `<p>${formatMessage(showAi(fillS(t)))}</p>`).join('')}</div>` : ''
        }<button type="button" class="btn-primary press" data-save><span>Save as a line</span>${icon('plus', 24)}</button>`,
        onMount(s, close) {
          s.querySelector('[data-save]').onclick = () => (close(), savePassenger(name, said));
        },
      });
    }
    async function savePassenger(name, said) {
      const c = blankCharacter();
      Object.assign(c, {
        name,
        tagline: `Met in ${ix.title}`,
        preset: 'initial',
        scene: ix.people[0].scene || 'cafe',
        persona: `${name} first turned up in the scene "${ix.title}".` + (said.length ? `\nThings they said there:\n${said.slice(0, 4).map((t) => '- ' + plain(t)).join('\n')}` : ''),
      });
      await saveCharacter(c);
      const raw = S.interchanges.find((x) => x.id === ix.id);
      const joins = raw && raw.members.length < 5;
      if (joins) {
        raw.members.push(c.id);
        await saveInterchange(raw);
        ix.people.push(c);
        ch.tagline = `Carriage · ${ix.people.length} aboard`;
        setStatus('idle');
      }
      const pe = (chat.passengers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (pe) pe.line = c.id;
      await save();
      renderAll();
      renderAboard();
      toast(`${name} is now a line${joins ? ' and rides with this carriage' : ''}.`, { action: 'Edit', onAction: () => (location.hash = `#/edit/${c.id}`) });
    }

    async function switchAlt(dir) {
      const i = lastAiIndex();
      if (i !== chat.messages.length - 1 || busy) return;
      const m = chat.messages[i];
      const next = m.alt + dir;
      if (next < 0) return;
      if (next >= m.alts.length) return m.first ? undefined : generate('regen');
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
    let menuOpen = false;
    function messageMenu(el) {
      const i = +el.dataset.i;
      const m = chat.messages[i];
      // A long press fires both our hold timer and the browser's contextmenu: open one menu only.
      if (!m || busy || menuOpen) return;
      menuOpen = true;
      el.classList.add('lifted');
      const lines = quoteLines(m);
      openMenu(
        el.querySelector('.bubble'),
        [
          { icon: 'edit', label: 'Edit message', on: () => editMessage(i) },
          { icon: 'copy', label: 'Copy', on: () => copyText(textOf(m)).then(() => toast('Copied')) },
          ...(ttsSupported ? [{ icon: 'speaker', label: 'Read aloud', on: () => speak(textOf(m)) }] : []),
          ...(lines.length ? [{ icon: 'star', label: m.quotes?.length ? `Star a line (${m.quotes.length} starred)` : 'Star a line', on: () => starLineSheet(m, i, lines) }] : []),
          { icon: 'star', label: m.star ? 'Remove star from reply' : lines.length ? 'Star whole reply' : 'Star to Logbook', on: () => toggleStar(m, i) },
          { icon: 'pin', label: 'Pin to notes', on: () => pin(m) },
          ...(ix ? [] : [{ icon: 'track', label: 'Branch from here', on: () => branch(i) }]),
          '-',
          { icon: 'trash', label: 'Delete', danger: true, on: () => remove(i) },
        ],
        { onClose: () => (el.classList.remove('lifted'), (menuOpen = false)), spotlight: el.querySelector('.bubble') }
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
    // ---------- star a line: the quoted lines in a message, each with who said it ----------
    const QUOTE = /"([^"\n]{2,}?)"|“([^”\n]{2,}?)”/g;
    function quoteLines(m) {
      const text = textOf(m);
      let parts;
      if (m.role === 'user') parts = [m.as ? { who: speakerOf({ speaker: m.as }) } : { you: true }];
      if (m.role === 'user') parts[0].text = text;
      else if (ix) {
        const blocks = m.speaker && !hasCastLines(text, ix.people) ? splitTurn(text, speakerOf(m).name) : parseScene(text);
        parts = blocks
          .filter((b) => b.kind === 'say')
          .map((b) => {
            const r = resolveSpeaker(b.name, ix.people, me().name);
            return { who: r.kind === 'line' ? r.who : null, name: r.kind === 'passenger' ? r.name : null, you: r.kind === 'you', text: b.text };
          });
      } else parts = [{ who: ch, text }];
      const out = [];
      for (const p of parts)
        for (const mm of named(p.text, p.who || (ix ? ix.people[0] : ch), 'you', me()).matchAll(QUOTE)) {
          const t = (mm[1] || mm[2]).trim();
          if (t && !out.some((x) => x.text === t)) out.push({ text: t, whoId: p.who?.id || null, name: p.you ? me().name?.trim() || 'You' : p.name || p.who?.name || ch.name });
        }
      return out;
    }
    function starLineSheet(m, i, lines) {
      const isOn = (l) => (m.quotes || []).some((q) => q.text === l.text);
      const rows = () =>
        lines
          .map((l, k) => `<button type="button" class="qline press${isOn(l) ? ' on' : ''}" data-k="${k}" aria-pressed="${isOn(l)}"><span class="ql-tx"><b>${esc(l.name)}</b><span>“${esc(l.text)}”</span></span><span class="ql-star">${icon('star', 18)}</span></button>`)
          .join('');
      openSheet({
        label: 'Star a line',
        html: `<h2 class="sheet-title">Star a line</h2><p class="sheet-p">Tap the lines you want to keep. Each one lands in your Logbook on its own.</p><div class="qlist" id="ql">${rows()}</div>`,
        onMount(s) {
          s.querySelector('#ql').addEventListener('click', async (e) => {
            const b = e.target.closest('[data-k]');
            if (!b) return;
            const l = lines[+b.dataset.k];
            m.quotes ||= [];
            const j = m.quotes.findIndex((q) => q.text === l.text);
            if (j >= 0) m.quotes.splice(j, 1);
            else m.quotes.push({ id: uid(), text: l.text, who: l.whoId, name: l.name, at: Date.now() });
            if (!m.quotes.length) delete m.quotes;
            s.querySelector('#ql').innerHTML = rows();
            rerenderMsg(i);
            await saveChat(chat, false);
          });
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
      setNotes();
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
          ? [
              { icon: 'card', label: scene ? 'Edit carriage' : 'Edit interchange', on: () => (location.hash = `#/interchange/${ix.id}`) },
              { icon: 'talk', label: scene ? 'Switch to Take turns' : 'Switch to One scene', on: switchMode },
            ]
          : [{ icon: 'card', label: 'Edit character', on: () => (location.hash = `#/edit/${ch.id}`) }]),
        ...(ix
          ? []
          : [
              { icon: 'image', label: 'Scene', on: sceneSheet },
              { icon: 'spark', label: 'Memory and notes', on: () => (location.hash = `#/memory/${chat.id}`) },
              { icon: 'layers', label: 'Final prompt', on: () => (location.hash = `#/final/${chat.id}`) },
              { icon: 'download', label: 'Export card (PNG)', on: async () => download(await exportCardPng(ch), slug(ch.name) + '.card.png') },
            ]),
        { icon: 'user', label: `You: ${me().name?.trim() || 'You'}`, on: personaSheet },
        { icon: 'download', label: 'Export as story', on: exportStory },
        { icon: 'sliders', label: 'Reading text', on: textSheet },
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
                setNotes();
              },
            });
          },
        }]),
      ])
    );

    // ---------- branch: a new chat that starts as a copy of this one up to message i ----------
    async function branch(i) {
      const c = newChat(ch.id, `${ch.id}~${uid()}`);
      c.messages = structuredClone(chat.messages.slice(0, i + 1));
      c.notes = structuredClone(chat.notes || []);
      if (chat.personaId) c.personaId = chat.personaId;
      if (chat.summary && chat.summary.upto <= i + 1) c.summary = structuredClone(chat.summary);
      c.branchOf = { chat: chat.id, at: chat.messages[i].id };
      await saveChat(c);
      location.hash = `#/chat/${c.id}`;
      toast('Branched here. The original is under Chats.', { action: 'Back', ms: 5000, onAction: () => (location.hash = `#/chat/${chat.id}`) });
    }

    // ---------- write for me: the AI drafts your next line into the composer ----------
    async function writeForMe() {
      if (busy) return;
      const conn = connectionFor(ch);
      if (!conn) return toast('Add a connection first.', { action: 'Add', onAction: () => (location.hash = '#/connection/new') });
      const lastAi = chat.messages[lastAiIndex()];
      const sp = scene ? ix.people[0] : speakerOf(lastAi);
      // Your line is short and in your voice, whatever the characters' reply style is.
      const built = buildPrompt({ char: sp, chat, conn, settings: { ...S.settings, replyStyle: {} }, persona: me(), group });
      const prev = input.value.trim();
      const as = speakAs ? speakerOf({ speaker: speakAs }).name : me().name?.trim() || 'the user';
      const ask = `[Write ${as}'s next message for them: what ${as} says and does next, in first person as ${as}, matching the story so far. One to three short sentences, actions in *asterisks*. Write only the message itself: no name in front, no notes. Do not write anyone else's lines.${prev ? ` Build it from this idea: "${prev}".` : ''}]`;
      const msgs = built.messages.map((x) => ({ ...x }));
      const tail = msgs[msgs.length - 1];
      if (tail?.role === 'user') tail.content += '\n\n' + ask;
      else msgs.push({ role: 'user', content: ask });
      const clean = (t) => t.replace(new RegExp(`^\\s*\\**${as.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\**\\s*:\\s*`, 'i'), '').trimStart();
      setBusy(true);
      setStatus('you');
      input.value = '';
      ctl = new AbortController();
      let out = '';
      try {
        await complete(conn, {
          system: built.system,
          messages: msgs,
          signal: ctl.signal,
          stream: true,
          maxTokens: 220,
          temperature: conn.temperature,
          character: { name: as, demoText: () => ['*glances at the clock* "One more coffee, then I really have to go."', '*leans in, smiling* "Okay, now I want to hear the whole story."', '*shrugs* "Fine by me. Lead the way."'][Math.floor(Math.random() * 3)] },
          onDelta(d) {
            if (destroyed) return;
            out += d;
            input.value = clean(out);
            fit();
          },
        });
      } catch (e) {
        if (e.name !== 'AbortError') toast(e.message || 'Could not write a line.', { kind: 'err' });
      }
      ctl = null;
      if (destroyed) return;
      setBusy(false);
      setStatus('idle');
      // Nothing came back (error or stop): give back what you had typed.
      input.value = clean(out).trim() || prev;
      fit();
      sendBtn.disabled = !input.value.trim();
      if (input.value) {
        input.focus();
        recordFare(conn, sp.id, built.total, estimateTokens(out));
      }
    }

    // ---------- export: the chat as a readable story (Markdown) ----------
    function exportStory() {
      const you = me().name?.trim() || 'You';
      const title = ix ? ix.title : ch.name;
      const names = [...(ix ? ix.people.map((p) => p.name) : [ch.name]), you];
      const cast = names.length > 2 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join(' and ');
      const out = [`# ${title}`, '', `*${scene ? 'A Carriage scene' : ix ? 'An Interchange' : 'A story'} with ${cast}. Exported from Chatbox on ${new Date().toLocaleDateString()}.*`, ''];
      if (ix?.scene?.trim()) out.push(`> ${ix.scene.trim()}`, '');
      for (const m of chat.messages) {
        if (m.error) continue;
        if (m.dir) {
          if (m.dir === 'skip') out.push('* * *', '');
          continue;
        }
        const who = m.role === 'assistant' ? speakerOf(m) : ix ? ix.people[0] : ch;
        const t = named(textOf(m), who, 'you', me()).trim();
        if (!t) continue;
        if (m.role === 'user') out.push(`**${m.as ? speakerOf({ speaker: m.as }).name : you}:** ${t}`, '');
        else if (scene) for (const b of parseScene(t)) out.push(b.kind === 'narr' ? b.text.trim() : `**${b.name}:** ${b.text.trim()}`, '');
        else out.push(`**${who.name}:** ${t}`, '');
      }
      download(new Blob([out.join('\n')], { type: 'text/markdown' }), `${slug(title) || 'chat'}.story.md`);
      toast('Story saved as a Markdown file');
    }

    // ---------- Interchange: Take turns <-> One scene, keeping the chat ----------
    async function switchMode() {
      const raw = S.interchanges.find((x) => x.id === ix.id);
      if (!raw || busy) return;
      if (scene && raw.members.length > 3) return toast('Take turns fits three lines. Remove some in Edit carriage first.');
      raw.mode = scene ? 'turns' : 'scene';
      await saveInterchange(raw);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      setTimeout(() => toast(raw.mode === 'scene' ? 'One scene: everyone can talk at once, with narration.' : 'Take turns: one speaker per reply. Pick who answers next.'), 450);
    }

    // ---------- who you are in this chat ----------
    function personaSheet() {
      const rows = () =>
        S.personas
          .map((p) => {
            const on = p.id === me().id;
            return `<button type="button" class="rider prow pick-p press${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-pid="${p.id}">${avatarBullet(p, 44)}<span class="nm">${esc(p.name || 'You')}<small>${p.id === S.persona.id ? 'Your default · follows if you change it' : esc(p.about?.trim().slice(0, 50) || 'Persona')}</small></span>${on ? `<span class="def-chip">${icon('check', 14)}This chat</span>` : ''}</button>`;
          })
          .join('');
      openSheet({
        label: 'Who you are in this chat',
        html: `<h2 class="sheet-title">Who you are here</h2><p class="sheet-p">Characters in this chat see this persona. Other chats keep their own.</p><div class="plist" role="radiogroup" aria-label="Persona" id="pl">${rows()}</div><a class="dashed press" href="#/persona" data-close style="margin-top:12px">${icon('user', 20)}Manage personas</a>`,
        onMount(s, close) {
          s.querySelector('[data-close]').addEventListener('click', () => close());
          s.querySelector('#pl').addEventListener('click', async (e) => {
            const b = e.target.closest('[data-pid]');
            if (!b) return;
            const id = b.dataset.pid;
            if (id === S.persona.id) delete chat.personaId;
            else chat.personaId = id;
            await saveChat(chat, false);
            s.querySelector('#pl').innerHTML = rows();
            renderAll();
            renderAboard();
            setSpeakAs?.(speakAs);
            updateTokens();
            close();
            toast(`You’re ${me().name?.trim() || 'yourself'} in this chat.`);
          });
        },
      });
    }

    // ---------- several chats with one character ----------
    async function newChatHere() {
      const c = await startNewChat(ch.id);
      location.hash = `#/chat/${c.id}`;
      toast(`New chat with ${ch.name}. Your other chats are under Chats.`, { ms: 2400 });
    }
    const chatTitle = (c) => {
      const firstYou = c.messages.find((m) => m.role === 'user');
      if (firstYou && !c.branchOf) return plain(textOf(firstYou)).slice(0, 60);
      if (c.branchOf) {
        const src = S.chats.get(c.branchOf.chat);
        return `Branch of “${src ? chatTitle(src) : 'an earlier chat'}”`.slice(0, 70);
      }
      return 'Not started yet';
    };
    const branchNote = (c) => {
      if (!c.branchOf) return '';
      const n = c.messages.findIndex((m) => m.id === c.branchOf.at);
      return `Branch · from message ${n + 1} · `;
    };
    function chatsSheet() {
      const list = () =>
        chatsFor(ch.id)
          .map(
            (c) =>
              `<div class="chatrow${c.id === chat.id ? ' here' : ''}"><a class="cr-main press" href="#/chat/${c.id}" data-go><span class="cr-t">${esc(chatTitle(c))}</span><span class="cr-s">${branchNote(c)}${c.messages.length} message${c.messages.length === 1 ? '' : 's'} · ${ago(c.updatedAt) === 'now' ? 'just now' : ago(c.updatedAt) + ' ago'}${c.id === chat.id ? ' · open now' : ''}</span></a><button type="button" class="ibtn ghost press" data-del="${c.id}" aria-label="Delete this chat">${icon('trash', 18)}</button></div>`
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
      const st = e.target.closest('[data-steer]');
      if (st) return steer(st.dataset.steer);
      const b = e.target.closest('[data-chip]');
      if (!b || busy) return;
      if (b.dataset.chip === 'write') return writeForMe();
      generate(b.dataset.chip);
    };
    // Chat details: who's on board, the connection, tokens and notes (moved out of the header).
    function infoSheet() {
      const c = connectionFor(ch);
      const nt = chat.notes.length;
      const linkRow = (href, ic, t, s) => `<a class="info-row press" href="${href}" data-close><span class="row-ic">${icon(ic, 18)}</span><span class="row-tx"><span class="row-t">${t}</span><span class="row-s">${s}</span></span>${icon('chev', 18)}</a>`;
      openSheet({
        label: 'Chat details',
        html: `<h2 class="sheet-title">${esc(ch.name)}</h2>
          ${ix ? `<p class="info-lbl">${scene ? 'On board' : 'In this interchange'}</p><div class="aboard" id="aboard" role="group" aria-label="On board"></div>` : ''}
          <div class="info-list">
            ${linkRow(ix ? `#/interchange/${ix.id}` : `#/edit/${ch.id}`, 'card', ix ? (scene ? 'Edit carriage' : 'Edit interchange') : 'Edit character', ix ? 'Cast, world and scene' : 'Sheet, picture and first message')}
            ${linkRow('#/connections', 'link', esc(connText(c)), 'Connection · tap to switch')}
            ${linkRow(`#/final/${chat.id}`, 'layers', `${root.querySelector('#tokN').textContent} tokens`, 'Sent with the next reply · see the final prompt')}
            ${ix ? '' : linkRow(`#/memory/${chat.id}`, 'pin', `${nt} note${nt === 1 ? '' : 's'}`, 'Memory and pinned notes')}
          </div>`,
        onMount(s, close) {
          renderAboard();
          s.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close()));
          s.querySelector('#aboard')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-pass]');
            if (b) close(), passengerSheet(b.dataset.pass);
          });
        },
      });
    }
    root.querySelector('#whoBtn').addEventListener('click', infoSheet);
    const setNotes = () => {
      root.querySelector('#noteN').textContent = chat.notes.length;
      root.querySelector('#noteWrap').hidden = !!ix || !chat.notes.length;
    };
    root.querySelector('#asBtn')?.addEventListener('click', (e) =>
      openMenu(e.currentTarget, [
        { icon: 'user', label: 'As yourself', on: () => setSpeakAs(null) },
        ...ix.people.map((p) => ({ icon: 'edit', label: `As ${p.name}`, on: () => setSpeakAs(p.id) })),
      ])
    );
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
      const pic = e.target.closest('.msg-img');
      if (pic) {
        const lb = document.createElement('button');
        lb.type = 'button';
        lb.className = 'lightbox';
        lb.setAttribute('aria-label', 'Close picture');
        lb.innerHTML = `<img src="${pic.getAttribute('src')}" alt="">`;
        const shut = () => (lb.remove(), removeEventListener('keydown', esc1), pic.focus?.());
        const esc1 = (k) => k.key === 'Escape' && shut();
        lb.addEventListener('click', shut);
        addEventListener('keydown', esc1);
        if (!pic.hasAttribute('tabindex')) pic.setAttribute('tabindex', '-1');
        document.body.appendChild(lb);
        lb.focus();
        return;
      }
      const ps = e.target.closest('[data-pass]');
      if (ps) return passengerSheet(ps.dataset.pass);
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
    if (ix && !scene) renderNext();
    renderAboard();
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
