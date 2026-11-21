import { S, character, getChat, saveChat, saveCharacter, saveSettings, connectionFor, textOf, named, resetChat, recordFare, meter, interchange, isInterchangeId, chatsFor, startNewChat, deleteChat, blankCharacter, saveInterchange, personaFor, personaById, newChat, branchChat, saveImages } from '../store.js';
import { textSheet } from './text.js';
import { replyStyleSheet } from './settings.js';
import { textPrefs } from '../textstyle.js';
import { STEER, parseScene, splitTurn, hasCastLines, resolveSpeaker, passengersIn, demoScene } from '../scene.js';
import { complete, PROVIDERS } from '../providers.js';
import { buildPrompt } from '../prompt.js';
import { shouldSummarize, summarize } from '../memory.js';
import { chronicle, chronicleDue, trackingOn, changeText, markStation, undoReply } from '../chronicle.js';
import { sortChapters, chapterSpans, chapterAt, addChapter, renameChapter, removeChapter, chapterHeadings, recapDue, writeRecap, recapFacts, recapMeta, recapFresh } from '../chapters.js';
import { clockOn, chipText, longText, partOfDay, clockSheet } from '../clock.js';
import { advOn, roll, RESULT, suggestMoves, advRowText } from '../adventure.js';
import { hereOf, untravel } from '../worldmap.js';
import { sttSupported, listen, speakParts, stopParts } from '../voice.js';
import { voiceSheet } from './voicesheet.js';
import { STYLES, picConn, picPrefs, providerName, paint, picSrc, altOf, squareOf, isDemoPics, gcPictures, keepScene, scenesOf, removeScene } from '../pictures.js';
import { scenesSheet } from './scenes.js';
import { esc, uid, formatMessage, markProse, fmtNum, estimateTokens, inkOn, ago, plain, detectMood, copyText, download, slug, reducedMotion, motion, lineAccent, EASE_OUT } from '../util.js';
import { avatarTile } from '../avatar.js';
import { windowSheet as openWindowSheet, pale } from '../scenepicker.js';
import { speak, stopSpeaking, ttsSupported } from '../tts.js';
import { exportCardPng } from '../cards.js';
import { chatSound, silence, signal, ambienceNow, musicPlaying } from '../sound.js';
import { soundSheet } from './soundsheet.js';
import { bindMarkButton } from '../markpicker.js';
import { helperComplete } from '../helper.js';
import { extractJson } from '../blueprint.js';
import { ibtn, avatarBullet, icon, arrow, openMenu, openSheet, toast, clearToasts, confirmSheet, autosize, reel, groupAvatar, toggleRow, bindSwitch, fitPics } from '../ui.js';

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

// While you were away: a gap this long counts as being away; how it reads ("14 hours", "2 days").
const AWAY_MS = 6 * 3600e3;
const awaySpan = (ms) => {
  const h = Math.round(ms / 3600e3);
  if (h < 24) return `${Math.max(1, h)} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} day${d === 1 ? '' : 's'}` : d < 14 ? 'a week' : `${Math.round(d / 7)} weeks`;
};

export async function chatView(id, focusId = null) {
  const ix = isInterchangeId(id) ? interchange(id) : null;
  // In an Interchange `ch` stands for the room (title, first member's scene and colour);
  // each reply's own speaker comes from speakerOf().
  // A chat id ("mika~x7k2") opens that chat; a character id opens its most recent one.
  const owner = ix ? id : character(id) ? id : S.chats.get(id)?.characterId || id;
  // A Carriage is an Interchange in "One scene" mode: one reply narrates the scene and voices everyone.
  const scene = ix?.mode === 'scene';
  // Story layout: always for group chats; for one-on-one chats when Reading text › Chat layout is Story.
  const story = !!ix || textPrefs().layout === 'story';
  const ch = ix ? { ...ix.people[0], id: ix.id, name: ix.title, tagline: scene ? `Carriage · ${ix.people.length} aboard` : `Interchange · ${ix.people.length} lines`, connectionId: null } : character(owner);
  if (!ch) return null;
  const speakerOf = (m) => (ix ? ix.people.find((p) => p.id === m?.speaker) || ix.people[0] : ch);
  const group = ix ? { people: ix.people, scene: ix.scene, world: ix.world || '', mode: ix.mode || 'turns', passengers: ix.passengers !== false } : null;
  // Who you are in this chat (its own pick, else your default persona).
  const me = () => personaFor(chat);
  const sceneKey = () => hereOf(chat)?.scene || ch.scene;
  // The window (Window seat): the character's card picture, or a picture set for this chat, framed at
  // the top of the chat over a station sign naming where the story is. Group chats show each member's
  // picture as a pane. With no picture it folds to the sign.
  const winPics = () => {
    if (!ix && ch.win === 'sign') return [];
    if (chat.bgPic && S.images?.[chat.bgPic]) return [S.images[chat.bgPic]];
    if (ix) {
      // A group's own picture (uploaded, or the cover from its imported card) first; else its members' pictures.
      const own = ix.picture || (ix.useScene ? null : ix.cover);
      return own ? [own] : ix.people.map((p) => p.avatarImage).filter(Boolean).slice(0, 3);
    }
    return ch.win !== 'sign' && ch.avatarImage ? [ch.avatarImage] : [];
  };
  const winKey = () => winPics().join('|').length + ':' + (chat.bgPic || '') + ':' + (ch.win || '');
  const signInfo = () => {
    const place = hereOf(chat)?.name;
    const st = (chat.route || []).at(-1)?.title;
    const cur = chapterAt(chat, chat.messages.length - 1);
    const n = cur ? (chat.chapters || []).indexOf(cur) + 1 : 0;
    const title = place || st || cur?.title || (ix ? ch.name : ch.tagline?.trim() || ch.name);
    const sub = clockOn(chat) ? longText(chat.clock) + (chat.clock.weather ? ` · ${chat.clock.weather}` : '') : cur && cur.title !== title ? `Chapter ${n} · ${cur.title}` : cur ? `Chapter ${n}` : ix ? ch.tagline : `${ch.name}’s line`;
    return { title, sub, num: String(Math.max(1, (chat.route || []).length)).padStart(2, '0'), letter: (ix ? ch.name : ch.line?.letter || ch.name || '?').trim()[0]?.toUpperCase() || '?' };
  };
  const bandOf = () => (ix ? `linear-gradient(90deg, ${ix.people.map((p, i, a) => `${p.line?.color || '#ECECEC'} ${(i / a.length) * 100}% ${((i + 1) / a.length) * 100}%`).join(', ')})` : ch.line?.color || '#ECECEC');
  const signHTML = () => {
    const s = signInfo();
    const pics = winPics();
    return `<span class="rnd${!ix && pale(ch.line?.color) ? ' pale' : ''}" style="--c:${ix ? '#0A0A0A' : ch.line?.color || '#0A0A0A'}" aria-hidden="true">${esc(s.letter)}<b class="num">${s.num}</b></span><span class="sn"><b>${esc(s.title)}</b><small>${esc(s.sub || '')}</small></span>${pics[0] ? `<span class="sthumb" aria-hidden="true" style="background-image:url('${esc(pics[0])}')"></span>` : ''}<i class="band${(ix ? ix.people.some((p) => pale(p.line?.color)) : pale(ch.line?.color)) ? ' pale' : ''}" style="background:${bandOf()}"></i>`;
  };
  // One picture is fitted to the window (whole card in a frame when it's square or small); several are panes.
  const winPicHTML = () => {
    const pics = winPics();
    return pics.map((src) => `<span class="pane"><img src="${esc(src)}" alt=""${pics.length === 1 ? ' data-fit' : ''}></span>`).join('');
  };
  const youWho = () => ({ name: me().name?.trim() || 'You', preset: me().preset, avatarImage: me().avatarImage, line: { color: '#FDCD15' } });
  const chat = await getChat(id);
  if (chat) scenesOf(chat); // older chats: keep their painted scenes before anything can remove a message
  if (!chat) return null;
  let ctl = null;
  let vmStopAll = null; // set by the voice mode in mount(); unmount stops it
  let watchOff = null; // set by watch mode in mount(); unmount stops it
  let busy = false;
  let destroyed = false;

  const conn0 = connectionFor(ch);
  const connText = (c) => (!c ? 'No connection' : c.provider === 'demo' ? 'Demo replies' : String(c.model || c.name).split('/').pop());
  // Short placeholder: a long name would wrap the composer onto several lines.
  const callName = scene ? 'the scene' : ix ? 'the interchange' : ch.name.length > 14 ? ch.name.split(/\s+/)[0].slice(0, 14) : ch.name;
  const html = `<div class="chat" id="chat" style="--accent:${lineAccent(ch.line?.color)}">
    <header class="chat-head">
      ${ibtn('back', 'Back to home', { href: '#/' })}
      <button type="button" class="chat-who press" id="whoBtn" aria-haspopup="dialog" aria-label="${esc(ch.name)}: chat details">${ix ? groupAvatar(ix, 36) : avatarBullet(ch, 36, '', `head:${ch.id}`)}<span class="who-tx"><span class="who-n">${esc(ch.name)}</span><span class="who-s"><span class="who-meta" id="meta"><span class="dot${conn0?.provider === 'demo' ? ' demo' : ''}" id="connDot"></span><span class="ell" id="connName">${esc(connText(conn0))}</span><span id="tokPill" ${S.settings.showCounter ? '' : 'hidden'}>· <span class="num" id="tokN">…</span></span><span id="noteWrap" ${!ix && chat.notes.length ? '' : 'hidden'}>· ${icon('pin', 12)}<span id="noteN">${chat.notes.length}</span></span></span><span id="status" hidden></span></span></span></button>
      <button type="button" class="ck-chip press num" id="clockBtn" ${clockOn(chat) ? '' : 'hidden'} aria-haspopup="dialog" aria-label="Story time">${clockOn(chat) ? chipText(chat.clock) : ''}</button>
      <button type="button" class="snd-btn press" id="sndBtn" hidden aria-haspopup="dialog" aria-label="Sound"><span class="snd-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>
      ${ibtn('more', 'Chat options', { id: 'moreBtn' })}
    </header>
    <div class="win${winPics().length ? ' has-pic' : ''}${chat.winFold ? ' fold' : ''}" id="win" data-k="${esc(winKey())}"><div class="win-pic" id="winPic"${ix ? '' : ` data-av="win:${esc(ch.id)}"`}>${winPicHTML()}</div><button type="button" class="sign press" id="signBtn" aria-controls="winPic" aria-label="Where you are">${signHTML()}</button></div>
    <div class="log${story ? ' story' : ''}" id="log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Chat with ${esc(ch.name)}"></div>
    <div class="chips${scene ? ' steer' : ''}" id="chips"></div>
    ${ix && !scene ? '<div class="nextbar" id="nextbar" role="radiogroup" aria-label="Who answers next"></div>' : ''}
    <form class="composer" id="composer">
      ${scene ? `<button type="button" class="ibtn as-btn press" id="asBtn" aria-label="Speaking as you. Tap to speak as someone else." aria-haspopup="menu">${avatarBullet(youWho(), 32)}</button>` : ''}
      <button type="button" class="ibtn press mk-btn" id="actBtn" aria-haspopup="dialog"></button>
      <button type="button" class="dice-btn press" id="diceBtn" aria-pressed="false" aria-label="Roll a d20 with your next line" ${advOn(chat) ? '' : 'hidden'}>d20</button>
      <textarea id="input" rows="1" placeholder="${scene ? 'What you do or say…' : `Message ${esc(callName)}…`}" aria-label="Message ${esc(ch.name)}" enterkeyhint="send"></textarea>
      ${sttSupported ? `<button type="button" class="mic-btn press" id="micBtn" aria-pressed="false" aria-label="Talk instead of typing">${icon('mic', 20)}</button>` : ''}
      <button type="submit" class="send press" id="sendBtn" aria-label="Send" disabled>${arrow(22, 'currentColor')}</button>
    </form>
    <section class="vbar" id="vbar" hidden aria-label="Voice mode"></section>
    ${ix && !scene ? `<section class="wbar" id="wbar" hidden aria-live="polite" aria-label="Watching"><div class="wb-t"><b id="wbT"></b><small id="wbS"></small><div class="wb-line" aria-hidden="true">${ix.people.map((p, k) => `<i style="left:calc(${(k / Math.max(1, ix.people.length - 1)) * 100}% - ${(k / Math.max(1, ix.people.length - 1)) * 16}px);--c:${p.line?.color || '#2EAA67'}"></i>`).join('')}<span class="wb-train"></span></div></div><button type="button" class="wb-stop press" id="wbStop">Stop</button></section>` : ''}
    <form class="findbar" id="findbar" hidden role="search" aria-label="Find in this chat">
      <button type="button" class="ibtn ghost press" id="fbClose" aria-label="Close find">${icon('x', 20)}</button>
      <label class="fb-field"><input id="fbIn" type="search" placeholder="Find in this chat" aria-label="Find in this chat" autocomplete="off" enterkeyhint="search"><span class="num" id="fbN" aria-live="polite"></span></label>
      <button type="button" class="ibtn ghost press" id="fbUp" aria-label="Previous match">${icon('chev', 20)}</button>
      <button type="button" class="ibtn ghost press" id="fbDown" aria-label="Next match">${icon('chev', 20)}</button>
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
    // A bookmark's ribbon on the bubble's corner, in the chat's line colour.
    const markOf = (m) => (chat.marks || []).find((b) => b.msgId === m.id);
    const ribbon = (m) => (markOf(m) ? `<span class="rib" role="img" aria-label="Bookmark: ${esc(markOf(m).title)}"></span>` : '');
    // The model's thinking for this version of the reply, folded into a pill.
    function thinkHTML(m) {
      const t = m.think?.[m.alt];
      if (!t?.text) return '';
      return `<details class="think"><summary><i aria-hidden="true"></i><span>Thought for ${Math.max(1, Math.round(t.ms / 1000))}s</span></summary><div class="think-tx">${esc(t.text.slice(-4000))}</div></details>`;
    }
    function toolsHTML(m, i) {
      const isLast = i === chat.messages.length - 1;
      if (!isLast || m.role !== 'assistant') return '';
      const pager =
        m.alts.length > 1
          ? m.first
            ? `<div class="pager opening"><button type="button" data-alt="-1" aria-label="Previous opening" ${m.alt === 0 ? 'disabled' : ''}>${icon('back', 18)}</button><span class="num" aria-live="polite">Opening ${m.alt + 1} of ${m.alts.length}</span><button type="button" data-alt="1" aria-label="Next opening" ${m.alt === m.alts.length - 1 ? 'disabled' : ''}>${icon('chev', 18)}</button></div>`
            : `<div class="pager"><button type="button" data-alt="-1" aria-label="Previous reply" ${m.alt === 0 ? 'disabled' : ''}>${icon('back', 18)}</button><button type="button" class="num pg-n press" data-compare aria-label="Version ${m.alt + 1} of ${m.alts.length}. Compare versions">${m.alt + 1} / ${m.alts.length}</button><button type="button" data-alt="1" aria-label="Next reply">${icon('chev', 18)}</button></div>`
          : '';
      const read = ttsSupported ? `<button type="button" class="mini press" data-read aria-label="Read aloud">${icon('speaker', 18)}</button>` : '';
      const used = (m.lore?.[m.alt] || []).filter((id) => S.lore.some((e) => e.id === id));
      const lore = used.length ? `<button type="button" class="mini lore-used press" data-lore aria-label="${used.length} Lorebook entr${used.length === 1 ? 'y' : 'ies'} used">${icon('book', 16)}<span class="num">${used.length}</span></button>` : '';
      return pager || read || lore ? `<div class="msg-tools">${pager}${read}${lore}</div>` : '';
    }
    // Names a paragraph can open with to show who is speaking: the cast, plus side characters met so far.
    const castNames = () => (ix ? [...ix.people.map((p) => p.name), ...(chat.passengers || []).map((p) => p.name)] : []);
    // ---------- Carriage: the story layout ----------
    // AI text with unmarked prose shown as actions (Reply style › Formatting: Asterisks, the default).
    const proseOn = () => (S.settings.replyStyle?.format || 'asterisks') === 'asterisks';
    const showAi = (t) => (proseOn() ? markProse(t) : t);
    const fillS = (t, who) => named(t, who || (ix ? ix.people[0] : ch), 'you', me());
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
      // One-on-one: everything with speech is the character's; plain prose is narration.
      const blocks = !ix ? splitTurn(text, ch.name) : m?.speaker && !hasCastLines(text, ix.people) ? splitTurn(text, speakerOf(m).name) : parseScene(text, castNames());
      return blocks.map((b) => {
        if (b.kind === 'narr') return blockHTML({ kind: 'narr' }, b.text);
        const r = ix ? resolveSpeaker(b.name, ix.people, me().name) : { kind: 'line', who: ch };
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
        if (m.dir) inner = dirSign(m);
        else if (m.as) inner = blockHTML({ kind: 'line', who: speakerOf({ speaker: m.as }) }, textOf(m), { by: true });
        else inner = blockHTML({ kind: 'you' }, textOf(m));
      } else inner = sceneParts(textOf(m), m).join('');
      return `<div class="msg scene ${m.role === 'user' ? 'mine' : 'ai'}${m.dir ? ' dir' : ''}${enter ? ' enter' : ''}${m.star ? ' starred' : ''}" data-i="${i}" data-id="${m.id}"><div class="msg-col">${m.role === 'assistant' ? thinkHTML(m) : ''}<div class="bubble scn">${ribbon(m)}${inner}${star}</div>${m.role === 'assistant' ? picsHTML(m) + chronHTML(m) + toolsHTML(m, i) : ''}</div></div>${m.role === 'user' ? rollHTML(m, enter) : movesHTML(m, i)}`;
    }
    function renderAboard() {
      const bar = document.querySelector('#aboard');
      if (!bar || !ix) return;
      bar.innerHTML =
        '<span class="lbl">On board</span>' +
        ix.people.map((p) => `<span class="ab" style="--c:${p.line?.color || '#2EAA67'}">${avatarBullet(p, 24)}${esc(p.name)}</span>`).join('') +
        (chat.passengers || []).filter((p) => !p.line).map((p) => `<button type="button" class="ab pass press" data-pass="${esc(p.name)}" aria-label="${esc(p.name)}, a passenger. Tap to save as a line.">${esc(p.name)}</button>`).join('');
    }
    // A stage direction in the log: Steering bar choices and "While you were away".
    function dirSign(m) {
      if (m.dir === 'time') return `<p class="scn-dir">${icon('clock', 14)}${esc(m.time || 'Time skip')}</p>`;
      if (m.dir === 'travel') return `<p class="scn-dir">${icon('route', 14)}${esc(m.time || 'Travelled')}</p>`;
      const label = m.dir === 'away' ? `While you were away · ${awaySpan(m.away?.ms || 0)}` : STEER[m.dir]?.label || 'Direction';
      return `<p class="scn-dir">${icon(m.dir === 'away' ? 'bell' : STEER[m.dir]?.icon || 'chev', 14)}${esc(label)}</p>`;
    }
    function msgHTML(m, i, enter = false) {
      if (story) return sceneMsgHTML(m, i, enter);
      if (m.dir) return `<div class="msg dirline${enter ? ' enter' : ''}" data-i="${i}" data-id="${m.id}">${dirSign(m)}</div>`;
      const cls = `msg ${m.role === 'user' ? 'user' : 'ai'}${enter ? ' enter' : ''}`;
      const star = m.star || m.quotes?.length ? `<span class="star-b" title="In your Logbook">${icon('star', 13)}</span>` : '';
      if (m.role === 'user') return `<div class="${cls}${m.star ? ' starred' : ''}" data-i="${i}" data-id="${m.id}"><div class="bubble">${ribbon(m)}${formatMessage(named(textOf(m), ch, 'you', me()))}${star}</div></div>${rollHTML(m, enter)}`;
      const sp = speakerOf(m);
      const tag = ix ? `<span class="spk-tag" style="--c:${sp.line?.color || '#2EAA67'};--ink:${inkOn(sp.line?.color || '#2EAA67')}">${esc(sp.name)}</span>` : '';
      return `<div class="${cls}${m.star || m.quotes?.length ? ' starred' : ''}" data-i="${i}" data-id="${m.id}">${avatarTile(sp, 30, { expr: m.mood || 'happy', radius: 10, cls: 'msg-av' })}<div class="msg-col">${thinkHTML(m)}<div class="bubble">${ribbon(m)}${tag}${formatMessage(showAi(named(textOf(m), sp, 'you', me())))}${star}</div>${picsHTML(m)}${chronHTML(m)}${toolsHTML(m, i)}</div></div>${movesHTML(m, i)}`;
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
      placeChapters();
      renderChips();
    }
    function rerenderMsg(i) {
      const el = log.querySelector(`.msg[data-i="${i}"]`);
      if (!el) return;
      // Rows that sit beside a message (its dice roll, its suggested moves) are redrawn with it.
      log.querySelectorAll(`[data-for="${CSS.escape(chat.messages[i].id)}"]`).forEach((x) => x.remove());
      el.outerHTML = msgHTML(chat.messages[i], i);
    }
    // ---------- Chapters: a break in the log before each chapter's first message ----------
    function placeChapters(fresh = null) {
      log.querySelectorAll('.chap').forEach((x) => x.remove());
      sortChapters(chat).forEach((c, k) => {
        const el = log.querySelector(`.msg[data-id="${CSS.escape(c.msgId)}"]`);
        el?.insertAdjacentHTML('beforebegin', `<button type="button" class="chap press${c.id === fresh ? ' fresh' : ''}" data-chap="${esc(c.id)}" aria-label="Chapter ${k + 1}: ${esc(c.title)}. Chapter options"><span class="chap-n">Chapter ${k + 1}</span><b>${esc(c.title)}</b></button>`);
      });
    }
    const chapterById = (id) => (chat.chapters || []).find((c) => c.id === id);
    function goChapter(id) {
      const el = log.querySelector(`.chap[data-chap="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
    }
    function chapterMenu(btn) {
      const c = chapterById(btn.dataset.chap);
      if (!c) return;
      openMenu(btn, [
        { icon: 'edit', label: 'Rename chapter', on: () => chapterNameSheet({ c }) },
        { icon: 'book', label: 'All chapters', on: chaptersSheet },
        '-',
        {
          icon: 'trash',
          label: 'Remove chapter',
          danger: true,
          on: async () => {
            removeChapter(chat, c.id);
            await saveChat(chat, false);
            placeChapters();
            toast('Chapter removed. Its messages join the chapter before.');
          },
        },
      ]);
    }
    // Name a new chapter (starting at message m) or rename one.
    function chapterNameSheet({ c = null, m = null }) {
      const n = c ? chat.chapters.indexOf(c) + 1 : 0;
      openSheet({
        label: c ? 'Rename chapter' : 'Start a chapter',
        html: `<h2 class="sheet-title">${c ? `Rename chapter ${n}` : 'Start a chapter here'}</h2><form id="chF"><input class="mk-in" id="chIn" maxlength="60" value="${esc(c?.title || '')}" placeholder="e.g. The Night Market" aria-label="Chapter title" autocomplete="off"><p class="fhint">${c ? 'A short title, like a book chapter.' : 'The chapter starts at this message. A short title, like a book chapter.'}</p><div class="sheet-actions"><button type="submit" class="btn-primary press"><span>${c ? 'Rename' : 'Start chapter'}</span></button></div></form>`,
        onMount(s, close) {
          const inp = s.querySelector('#chIn');
          setTimeout(() => (inp.focus(), inp.select()), 80);
          s.querySelector('#chF').addEventListener('submit', async (e) => {
            e.preventDefault();
            const t = inp.value.trim();
            if (!t) return inp.focus();
            let made = null;
            if (c) renameChapter(chat, c.id, t);
            else {
              // Messages before it become chapter 1, so the numbering still starts at the start.
              if (!(chat.chapters || []).length && chat.messages[0] && chat.messages[0].id !== m.id) addChapter(chat, chat.messages[0].id, 'The Beginning');
              made = addChapter(chat, m.id, t);
            }
            close();
            await saveChat(chat, false);
            placeChapters();
            if (made) toast(`Chapter ${chat.chapters.indexOf(made) + 1} starts here`);
          });
        },
      });
    }
    function chaptersSheet() {
      const spans = chapterSpans(chat);
      const last = chat.messages[chat.messages.length - 1];
      const cur = chapterAt(chat, chat.messages.length - 1);
      const line = ix ? '#ECECEC' : ch.line?.color || '#2EAA67';
      const canStart = last && !spans.some((x) => x.c.msgId === last.id);
      const rows = spans
        .map(({ c, n, from, to }) => `<li class="${c === cur ? 'on' : ''}"><button type="button" class="press" data-go="${esc(c.id)}"${c === cur ? ' aria-current="step"' : ''}><b>${esc(c.title)}</b><small>Chapter ${n} · messages ${from}–${to}${c === cur ? ' · you are here' : ''}</small></button></li>`)
        .join('');
      openSheet({
        label: 'Chapters',
        html: `<h2 class="sheet-title">Chapters</h2><p class="sheet-p">${spans.length ? `${esc(ix ? ix.title : ch.name)} · ${spans.length} chapter${spans.length === 1 ? '' : 's'}. Tap one to jump there.` : `No chapters yet. With Track the story on, they’re added as the story moves into a new arc, or start one yourself.`}</p>
          ${spans.length ? `<ol class="chs" style="--c:${line}">${rows}</ol>` : ''}
          ${canStart ? `<button type="button" class="ch-start press" id="chStart">${icon('plus', 16)}Start chapter ${spans.length + (spans.length || chat.messages.length === 1 ? 1 : 2)} at the latest message</button>` : ''}`,
        onMount(s, close) {
          s.addEventListener('click', (e) => {
            const g = e.target.closest('[data-go]');
            if (g) return close(), setTimeout(() => goChapter(g.dataset.go), 320);
            if (e.target.closest('#chStart')) close(), setTimeout(() => chapterNameSheet({ m: last }), 320);
          });
        },
      });
    }

    // ---------- Recap: "Previously", when you come back after a while ----------
    const lastSaidAt = () => [...chat.messages].reverse().find((m) => m.at)?.at || chat.updatedAt || 0;
    function recapBody() {
      const cast = ix ? ix.people : [ch];
      const gone = Date.now() - lastSaidAt();
      const meta = [gone >= 3600e3 ? `${awaySpan(gone)} ago` : '', ...recapMeta(chat)].filter(Boolean).join(' · ');
      const facts = recapFacts(chat, cast);
      const line = ix ? '#ECECEC' : ch.line?.color || '#2EAA67';
      return (
        `<h3 class="pv-h">Previously</h3>${meta ? `<p class="pv-k">${esc(meta)}</p>` : ''}<p class="pv-p">${esc(chat.recap.text)}</p>` +
        (facts.length ? `<ol class="pv-rail" style="--c:${line}">${facts.map((f) => `<li>${esc(f.text)}<small>${esc(f.k)}</small></li>`).join('')}</ol>` : '') +
        `<div class="pv-acts"><button type="button" class="pv-ok press">Got it</button><a class="pv-route press" href="#/route/${encodeURIComponent(chat.id)}">${icon('route', 15)}Route map</a></div>`
      );
    }
    // Shown after the message you left off at (so a "While you were away" note comes after it).
    function putRecap(box, anchorId) {
      const i = chat.messages.findIndex((m) => m.id === anchorId);
      const next = [...log.querySelectorAll('.msg[data-i]')].find((el) => +el.dataset.i > i);
      const before = next?.previousElementSibling?.classList.contains('chap') ? next.previousElementSibling : next;
      before ? log.insertBefore(box, before) : log.appendChild(box);
    }
    async function showRecap(manual = false) {
      if (destroyed) return;
      log.querySelector('.pv')?.remove();
      const anchorId = chat.messages[chat.messages.length - 1]?.id;
      const box = document.createElement('section');
      box.className = 'pv';
      box.setAttribute('aria-label', 'Previously');
      box.setAttribute('aria-live', 'polite');
      box.addEventListener('click', (e) => {
        if (e.target.closest('.pv-ok')) box.remove();
        else if (e.target.closest('.pv-again')) showRecap(true);
      });
      const stick = nearBottom();
      // From the menu, the card shows straight away while it's written; on opening, only once it's ready.
      if (manual) {
        box.innerHTML = recapFresh(chat) ? recapBody() : `<h3 class="pv-h">Previously</h3><p class="pv-p pv-wait">Writing the recap…</p>`;
        putRecap(box, anchorId);
        if (stick || manual) toBottom(true);
      }
      try {
        await writeRecap({ chat, cast: ix ? ix.people : [ch], persona: me(), conn: connectionFor(ch) });
      } catch (e) {
        if (!manual || destroyed) return box.remove();
        box.innerHTML = `<h3 class="pv-h">Previously</h3><p class="pv-p">${esc(e.message || 'The recap couldn’t be written.')}</p><div class="pv-acts"><button type="button" class="pv-again press">${icon('refresh', 15)}Try again</button><button type="button" class="pv-ok press">Close</button></div>`;
        return;
      }
      if (destroyed) return;
      chat.recap.seenAt = Date.now();
      saveChat(chat, false);
      box.innerHTML = recapBody();
      if (!box.isConnected) putRecap(box, anchorId);
      if (stick || manual) toBottom(true);
    }

    // ---------- Sound: ambience and music follow the chat; the header button shows while it plays ----------
    function updSnd() {
      const b = root.querySelector('#sndBtn');
      if (!b) return;
      const amb = ambienceNow();
      const on = !!amb || musicPlaying();
      b.hidden = !on;
      b.setAttribute('aria-label', on ? `Sound: ${amb || 'music'}. Sound settings` : 'Sound');
    }
    function soundNow() {
      if (destroyed) return;
      chatSound(chat, ch);
      updSnd();
      setTimeout(updSnd, 700); // music starts once its file is read
    }

    // ---------- Bookmarks: save points to come back to, or branch from ----------
    function bookmarkSheet(i) {
      const m = chat.messages[i];
      const guess = plain(named(textOf(m), speakerOf(m), 'you', me())).replace(/["“”*`]/g, '').split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
      openSheet({
        label: 'Bookmark',
        html: `<h2 class="sheet-title">Bookmark this moment</h2><form id="bmF"><input class="mk-in" id="bmIn" maxlength="60" value="${esc(guess)}" aria-label="Bookmark name" autocomplete="off"><p class="fhint">A save point: jump back to it from ⋯ › Bookmarks${ix ? '' : ', or start a new chat from there'}.</p><div class="sheet-actions"><button type="submit" class="btn-primary press"><span>Bookmark</span></button></div></form>`,
        onMount(s, close) {
          const inp = s.querySelector('#bmIn');
          setTimeout(() => (inp.focus(), inp.select()), 80);
          s.querySelector('#bmF').addEventListener('submit', async (e) => {
            e.preventDefault();
            (chat.marks ||= []).push({ id: uid(), msgId: m.id, title: inp.value.trim().slice(0, 60) || 'A moment', at: Date.now() });
            close();
            await saveChat(chat, false);
            rerenderMsg(i);
            toast('Bookmarked', { action: 'Bookmarks', onAction: bookmarksSheet });
          });
        },
      });
    }
    async function unbookmark(i) {
      const m = chat.messages[i];
      chat.marks = (chat.marks || []).filter((b) => b.msgId !== m.id);
      await saveChat(chat, false);
      rerenderMsg(i);
      toast('Bookmark removed');
    }
    function jumpTo(msgId) {
      const el = log.querySelector(`.msg[data-id="${CSS.escape(msgId)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      el.classList.add('found');
      setTimeout(() => el.classList.remove('found'), 2200);
    }
    function bookmarksSheet() {
      const pos = new Map(chat.messages.map((m, k) => [m.id, k]));
      const list = (chat.marks || []).filter((b) => pos.has(b.msgId)).sort((a, b) => pos.get(a.msgId) - pos.get(b.msgId));
      const line = ix ? '#ECECEC' : ch.line?.color || '#2EAA67';
      let open = null;
      const rows = () =>
        list
          .map((b) => {
            const k = pos.get(b.msgId);
            const day = chat.messages[k]?.at ? new Date(chat.messages[k].at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
            return `<li class="${open === b.id ? 'open' : ''}"><button type="button" class="bm-hit press" data-bm="${esc(b.id)}" aria-expanded="${open === b.id}"><b>${esc(b.title)}</b><small>Message ${k + 1}${day ? ` · ${day}` : ''}${k === chat.messages.length - 1 ? ' · latest' : ''}</small></button>${
              open === b.id
                ? `<div class="bm-acts"><button type="button" class="press" data-bmgo="${esc(b.id)}">${icon('chev', 15)}Jump there</button>${ix ? '' : `<button type="button" class="press" data-bmbranch="${esc(b.id)}">${icon('track', 15)}Branch from here</button>`}<button type="button" class="press" data-bmrm="${esc(b.id)}">Remove</button></div>`
                : ''
            }</li>`;
          })
          .join('');
      clearToasts();
      openSheet({
        label: 'Bookmarks',
        html: `<h2 class="sheet-title">Bookmarks</h2><p class="sheet-p">${list.length ? `Save points in this chat: jump back${ix ? '' : ', or start a new chat from there'}.` : 'No bookmarks yet. Long-press a message and choose Bookmark to save a moment you want to come back to.'}</p>${list.length ? `<ol class="bm-rail" id="bmRail" style="--c:${line}">${rows()}</ol>` : ''}`,
        onMount(s, close) {
          s.addEventListener('click', async (e) => {
            const h = e.target.closest('[data-bm]');
            const go = e.target.closest('[data-bmgo]');
            const br = e.target.closest('[data-bmbranch]');
            const rm = e.target.closest('[data-bmrm]');
            const find = (id) => list.find((b) => b.id === id);
            if (h) return (open = open === h.dataset.bm ? null : h.dataset.bm), (s.querySelector('#bmRail').innerHTML = rows());
            if (go) return close(), setTimeout(() => jumpTo(find(go.dataset.bmgo).msgId), 320);
            if (br) return close(), branch(pos.get(find(br.dataset.bmbranch).msgId));
            if (rm) {
              const b = find(rm.dataset.bmrm);
              chat.marks = chat.marks.filter((x) => x !== b);
              list.splice(list.indexOf(b), 1);
              await saveChat(chat, false);
              rerenderMsg(pos.get(b.msgId));
              s.querySelector('#bmRail').innerHTML = rows();
            }
          });
        },
      });
    }

    // ---------- Find in this chat: a tray where the composer was ----------
    const find = { q: '', hits: [], at: -1 };
    const unmark = () => {
      log.querySelectorAll('mark.fm').forEach((mk) => mk.replaceWith(document.createTextNode(mk.textContent)));
      log.querySelectorAll('.bubble').forEach((b) => b.normalize());
    };
    function markAll(q) {
      unmark();
      find.hits = [];
      if (q.length < 2) return;
      const ql = q.toLowerCase();
      for (const b of log.querySelectorAll('.msg .bubble')) {
        const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          if (node.parentElement.closest('.rib, .spk-tag, .star-b')) continue;
          const t = node.textContent;
          let at = t.toLowerCase().indexOf(ql);
          if (at < 0) continue;
          const frag = document.createDocumentFragment();
          let last = 0;
          while (at >= 0) {
            frag.append(t.slice(last, at));
            const mk = document.createElement('mark');
            mk.className = 'fm';
            mk.textContent = t.slice(at, at + q.length);
            frag.append(mk);
            find.hits.push(mk);
            last = at + q.length;
            at = t.toLowerCase().indexOf(ql, last);
          }
          frag.append(t.slice(last));
          node.replaceWith(frag);
        }
      }
    }
    function showHit(k) {
      const n = find.hits.length;
      const out = root.querySelector('#fbN');
      if (!n) return (find.at = -1), (out.textContent = find.q.length >= 2 ? 'No matches' : '');
      find.at = ((k % n) + n) % n;
      find.hits.forEach((mk, j) => mk.classList.toggle('cur', j === find.at));
      out.textContent = `${find.at + 1} of ${n}`;
      find.hits[find.at].scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    function openFind() {
      const fb = root.querySelector('#findbar');
      fb.hidden = false;
      root.querySelector('#composer').hidden = true;
      chips.hidden = true;
      root.querySelector('#nextbar')?.setAttribute('hidden', '');
      const inp = root.querySelector('#fbIn');
      inp.value = find.q;
      setTimeout(() => inp.focus(), 30);
      if (find.q) markAll(find.q), showHit(find.hits.length - 1);
    }
    function closeFind() {
      unmark();
      find.hits = [];
      root.querySelector('#findbar').hidden = true;
      root.querySelector('#composer').hidden = false;
      chips.hidden = false;
      root.querySelector('#nextbar')?.removeAttribute('hidden');
    }

    const writeChip = () => `<button type="button" class="press" data-chip="write">${icon('edit', 16)}Write for me</button>`;
    function renderChips() {
      // While a reply is being written the chips stay in place, disabled, so nothing jumps.
      chips.classList.toggle('wait', busy);
      if (busy) return chips.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const last = chat.messages[chat.messages.length - 1];
      let h = '';
      if (scene) {
        if (last?.role === 'user' && (!last.dir || last.dir === 'travel' || last.dir === 'time')) h += `<button type="button" class="press" data-chip="reply">${icon('refresh', 16)}Get the scene</button>`;
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
        if (ix) h += `<button type="button" class="press" data-chip="reply">${icon('chev', 16)}${!isMode(chat.next) ? esc(speakerOf({ speaker: chat.next }).name) + ' speaks' : 'Next line'}</button>`;
      }
      else if (last?.role === 'user') h = `<button type="button" class="press" data-chip="reply">${icon('refresh', 16)}Get a reply</button>`;
      if (ix && !scene && chat.messages.length) h = `<button type="button" class="press chip-watch" data-chip="watch">${icon('talk', 16)}Watch them</button>` + h;
      chips.innerHTML = h;
    }
    // ---------- Interchange: who answers next ----------
    function renderNext() {
      const bar = root.querySelector('#nextbar');
      if (!bar) return;
      const cur = !chat.next || chat.next === 'either' ? 'turns' : chat.next;
      const mode = (k, l) => `<button type="button" class="ns either press${cur === k ? ' on' : ''}" role="radio" aria-checked="${cur === k}" data-next="${k}">${l}</button>`;
      bar.innerHTML =
        '<span class="nb-l">Next stop</span>' +
        mode('turns', 'Take turns') +
        mode('story', 'Story picks') +
        ix.people
          .map((p) => {
            const col = p.line?.color || '#2EAA67';
            return `<button type="button" class="ns press${cur === p.id ? ' on' : ''}" role="radio" aria-checked="${cur === p.id}" data-next="${p.id}" style="--c:${col};--ink:${inkOn(col)}">${avatarBullet(p, 26)}${esc(p.name)}${cur === p.id ? icon('check', 15) : ''}</button>`;
          })
          .join('');
    }
    // Who answers: the member you picked; else whoever you addressed by name; else Take turns (the
    // next in order after the last to speak) or Story picks (the Helper reads the scene and chooses).
    const isMode = (v) => !v || v === 'either' || v === 'turns' || v === 'story';
    function nextInTurn() {
      const lastAi = [...chat.messages].reverse().find((m) => m.role === 'assistant' && m.speaker);
      const k = ix.people.findIndex((p) => p.id === lastAi?.speaker);
      return ix.people[(k + 1) % ix.people.length];
    }
    async function storyPick() {
      const conn = connectionFor(ch);
      if (!conn || conn.provider === 'demo') return null;
      const you = me().name?.trim() || 'User';
      const recent = chat.messages
        .filter((m) => !m.dir && !m.error)
        .slice(-8)
        .map((m) => `${m.role === 'user' ? you : speakerOf(m).name}: ${named(textOf(m), speakerOf(m), you, me()).slice(0, 500)}`)
        .join('\n\n');
      const out = await helperComplete(conn, 'next', {
        system: 'You direct a group roleplay. Reply with ONE JSON object and nothing else.',
        messages: [{ role: 'user', content: `Cast: ${ix.people.map((p) => p.name).join(', ')}.\n\nRecent story:\n${recent}\n\nWho in the cast would most naturally speak next: someone who was addressed, has a reason to react, or has been quiet; not the same person again unless it clearly fits. Return {"next":"<one name from the cast>"}.` }],
        stream: false,
        maxTokens: 300,
        temperature: 0.3,
      });
      const r = resolveSpeaker(String(extractJson(out).next || ''), ix.people, '');
      return r.kind === 'line' ? r.who : null;
    }
    async function chooseSpeaker(watching = false) {
      if (!isMode(chat.next)) return speakerOf({ speaker: chat.next });
      if (!watching) {
        const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user' && !m.dir);
        const said = (lastUser ? textOf(lastUser) : '').toLowerCase();
        const named_ = ix.people.filter((p) => new RegExp(`\\b${p.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(said));
        if (named_.length === 1) return named_[0];
      }
      if (chat.next === 'story') {
        const p = await storyPick().catch(() => null);
        if (p) return p;
      }
      return nextInTurn();
    }
    let forced = null; // Watch mode decides the speaker before each turn

    // ---------- Watch mode: the cast talks among themselves ----------
    const watch = { on: false, n: 0, turn: 0 };
    watchOff = () => (watch.on = false);
    function watchSheet() {
      let n = 4;
      openSheet({
        label: 'Watch them talk',
        html: `<h2 class="sheet-title">Watch them talk</h2><p class="sheet-p">They talk among themselves${chat.next === 'story' ? ', the story picking who speaks' : ', taking turns'}. Tap Stop to jump back in. Each turn is one reply.</p>
          <div class="wt-opts" role="radiogroup" aria-label="How many turns">${[[2, '2'], [4, '4'], [8, '8'], [Infinity, 'Until I stop']].map(([k, l]) => `<button type="button" class="press" role="radio" aria-checked="${k === n}" data-wn="${k}">${l}</button>`).join('')}</div>
          <div class="sheet-actions"><button type="button" class="btn-primary press" id="wtGo"><span>Start watching</span></button></div>`,
        onMount(s, close) {
          s.querySelector('.wt-opts').addEventListener('click', (e) => {
            const b = e.target.closest('[data-wn]');
            if (!b) return;
            n = +b.dataset.wn;
            s.querySelectorAll('[data-wn]').forEach((x) => x.setAttribute('aria-checked', x === b));
          });
          s.querySelector('#wtGo').addEventListener('click', () => (close(), setTimeout(() => startWatch(n), 300)));
        },
      });
    }
    function paintWatch(sp) {
      const bar = root.querySelector('#wbar');
      bar.querySelector('#wbT').textContent = `Watching · turn ${watch.turn}${Number.isFinite(watch.n) ? ` of ${watch.n}` : ''}`;
      bar.querySelector('#wbS').textContent = sp ? `${sp.name} is speaking` : 'Choosing who speaks…';
      const k = sp ? ix.people.indexOf(sp) : -1;
      const tr = bar.querySelector('.wb-train');
      if (k >= 0) tr.style.left = `calc(${(k / Math.max(1, ix.people.length - 1)) * 100}% - ${(k / Math.max(1, ix.people.length - 1)) * 22}px)`;
    }
    async function startWatch(n) {
      if (busy || watch.on) return;
      Object.assign(watch, { on: true, n, turn: 0 });
      const bar = root.querySelector('#wbar');
      bar.hidden = false;
      root.querySelector('#composer').hidden = true;
      chips.hidden = true;
      root.querySelector('#nextbar')?.setAttribute('hidden', '');
      bar.querySelector('#wbStop').focus({ preventScroll: true });
      while (watch.on && watch.turn < n) {
        watch.turn++;
        paintWatch(null);
        const sp = await chooseSpeaker(true);
        if (!watch.on || destroyed) break;
        forced = sp;
        paintWatch(sp);
        await generate('reply');
        forced = null;
        if (!watch.on || destroyed || log.querySelector('.err')) break;
        await new Promise((r) => setTimeout(r, 900));
      }
      stopWatch(false);
    }
    function stopWatch(abort = true) {
      const was = watch.on;
      watch.on = false;
      if (abort && busy) ctl?.abort();
      if (destroyed) return;
      const bar = root.querySelector('#wbar');
      if (bar.hidden) return;
      bar.hidden = true;
      root.querySelector('#composer').hidden = false;
      chips.hidden = false;
      root.querySelector('#nextbar')?.removeAttribute('hidden');
      renderChips();
      if (was) input.focus({ preventScroll: true });
    }
    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    const toBottom = (smooth = false) => log.scrollTo({ top: log.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });

    function setStatus(kind) {
      const meta = root.querySelector('#meta');
      meta.hidden = kind !== 'idle';
      status.hidden = kind === 'idle';
      status.classList.toggle('busy', kind !== 'idle');
      const train = '<span class="trk" aria-hidden="true"><b></b></span>';
      if (kind === 'typing') status.innerHTML = `${train}typing`;
      else if (kind === 'you') status.innerHTML = `${train}writing your line`;
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
        if (ix && !scene) target.speaker = (forced || (await chooseSpeaker())).id;
        chat.messages.push(target);
        idx = chat.messages.length - 1;
      } else {
        idx = lastAiIndex();
        if (idx < 0) return;
        target = chat.messages[idx];
        // Suggested moves belong to the text they followed: a new version or more text gets new ones.
        if (target.moves) delete target.moves, log.querySelectorAll(`.mv[data-for="${CSS.escape(target.id)}"]`).forEach((x) => x.remove());
        if (mode === 'regen') {
          target.alts.push('');
          target.alt = target.alts.length - 1;
          // A new version: take back what the old one changed in Bonds, and read it again later.
          if (target.chron) undoReply(chat, target);
          if (chat.chron) chat.chron.upto = Math.min(chat.chron.upto, chat.messages.indexOf(target));
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
      const rd = story
        ? { push: () => raf || (raf = requestAnimationFrame(() => ((raf = 0), !destroyed && paintScene(bubble, text, caret, target)))) }
        : new StreamRenderer(bubble, caret, proseOn());
      if (story && prev) paintScene(bubble, prev, caret, target);
      if (!story && mode === 'continue' && /\*/.test(prev) && (prev.match(/\*/g) || []).length % 2) rd.inAct = !rd.inAct, rd.open();
      toBottom();

      setBusy(true);
      setStatus('typing');
      el.setAttribute('aria-busy', 'true');
      ctl = new AbortController();
      let text = prev;
      let first = true;
      let error = null;
      const mt = meter();
      // What the model thinks before answering: a pill above the reply ("Thinking… 4s", then
      // "Thought for 12s"), its text inside.
      const think = { text: '', start: Date.now(), end: 0, el: null, last: 0 };
      const thinkPill = (done = false) => {
        if (!think.el) {
          think.el = document.createElement('details');
          think.el.className = 'think live';
          think.el.innerHTML = '<summary><i aria-hidden="true"></i><span></span></summary><div class="think-tx"></div>';
          bubble.before(think.el);
        }
        const now = Date.now();
        if (!done && now - think.last < 250) return;
        think.last = now;
        const secs = Math.max(1, Math.round(((think.end || now) - think.start) / 1000));
        think.el.classList.toggle('live', !done && !think.end);
        think.el.querySelector('span').textContent = think.end || done ? `Thought for ${secs}s` : `Thinking… ${secs}s`;
        think.el.querySelector('.think-tx').textContent = think.text.slice(-4000);
      };
      try {
        await complete(conn, {
          system: built.system,
          messages: built.messages,
          signal: ctl.signal,
          stream: ch.stream !== false,
          maxTokens: S.settings.replyStyle?.length === 'long' ? Math.max(conn.maxTokens || 600, 1000) : conn.maxTokens,
          temperature: conn.temperature,
          character: asked,
          onUsage: mt.onUsage,
          onReasoning(d) {
            if (destroyed) return;
            think.text += d;
            thinkPill();
          },
          onDelta(d) {
            if (destroyed) return;
            if (think.text && !think.end) (think.end = Date.now()), thinkPill(true);
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
        if (think.text) (target.think ||= {})[target.alt] = { text: think.text.slice(-20000), ms: (think.end || Date.now()) - think.start };
        else if (target.think?.[target.alt] && mode !== 'continue') delete target.think[target.alt];
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
        if (S.settings.readAloud && !vm.on) speakReply(target);
        // Fares: what this journey cost. OpenRouter says what it billed; otherwise tokens (the
        // provider's count, else about four characters per token) at the connection's prices.
        mt.commit(built.total, estimateTokens(text.slice(prev.length)), (i, o, c) => recordFare(conn, sp.id, i, o, c)).catch(() => {});
        signal('reply');
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
      if (!error && S.settings.autoSummary && shouldSummarize(chat, conn)) {
        setStatus('summary');
        try {
          await summarize({ chat, char: ch, conn, persona: me(), cast: ix ? ix.people : null });
          if (!destroyed) renderAll(), toBottom();
        } catch (e) {
          console.warn('summary failed', e);
        }
        if (!destroyed) setStatus('idle');
      }
      if (!destroyed) updateTokens();
      // Route map and Bonds: a short background read every couple of replies.
      if (!error && text.trim() && (trackingOn(S.settings) || advOn(chat)) && chronicleDue(chat)) runChronicle(conn);
      if (!error && text.trim() && advOn(chat)) runMoves(conn, target);
      if (vm.on) vmAfterReply(error ? null : target);
    }

    async function runChronicle(conn) {
      const target = chat.messages[chat.messages.length - 1];
      try {
        const res = await chronicle({ chat, cast: ix ? ix.people : [ch], persona: me(), conn, settings: S.settings });
        if (res.changes.length || res.stations.length || res.time || res.ties || res.adv || res.place || res.chapter || res.facts) target.chron = { bonds: res.changes, stations: res.stations.map((s) => s.title), ...(res.chapter ? { chapter: res.chapter } : {}), ...(res.facts ? { facts: res.facts } : {}), ...(res.time ? { time: res.time } : {}), ...(res.ties ? { ties: res.ties } : {}), ...(res.adv ? { adv: res.adv } : {}), ...(res.place ? { place: res.place } : {}) };
        if (res.place) setScene();
        if (res.stations.length && chat.picAuto && picConn() && !destroyed) runPaint(target, chat.picStyle || picPrefs().style);
        await saveChat(chat, false);
        const i = chat.messages.indexOf(target);
        if (!destroyed && target.chron && i >= 0) {
          rerenderMsg(i);
          log.querySelectorAll(`.msg[data-i="${i}"] .chr-seg`).forEach((x) => x.closest('.chr-row').classList.add('fresh'));
        }
        if (!destroyed && res.chapter) placeChapters(res.chapter.id);
        if (!destroyed) res.chapter ? signal('chapter') : res.stations.length ? signal('station') : null;
        if (!destroyed && (res.time || res.place)) soundNow();
        if (!destroyed) updateClock();
      } catch (e) {
        console.warn('chronicle failed', e);
        await saveChat(chat, false);
      }
    }

    // The slim rows under a reply: what changed in Bonds, and new stations on the Route map.
    function chronHTML(m) {
      const c = m.chron;
      if (!c) return '';
      const cast = ix ? ix.people : [ch];
      const rows = (c.bonds || []).map((x) => {
        const p = cast.find((q) => q.id === x.who);
        return p ? `<a class="chr-row press" href="#/bonds/${encodeURIComponent(chat.id)}"><span class="chr-dot" style="background:${p.line?.color || '#2EAA67'}" aria-hidden="true"></span><span>${esc(p.name)} · ${esc(changeText(x.d))}${x.why ? ` · ${esc(x.why)}` : ''}</span></a>` : '';
      });
      if (c.place) rows.push(`<a class="chr-row press" href="#/map/${encodeURIComponent(chat.id)}">${icon('route', 13)}<span>${c.place.created ? 'New place' : 'Now at'} · ${esc(c.place.name)}</span></a>`);
      if (c.adv?.length) rows.push(`<a class="chr-row press" href="#/adventure/${encodeURIComponent(chat.id)}">${icon('dice', 13)}<span>${esc(advRowText(c.adv))}</span></a>`);
      if (c.chapter && chapterById(c.chapter.id)) rows.push(`<button type="button" class="chr-row press" data-chapgo="${esc(c.chapter.id)}"><span class="chr-seg" aria-hidden="true"></span><span>New chapter · ${esc(chapterById(c.chapter.id).title)}</span></button>`);
      if (c.facts?.length) rows.push(`<a class="chr-row press" href="#/memory/${encodeURIComponent(chat.id)}"><span class="chr-mem" aria-hidden="true">${icon('book', 13)}</span><span>${c.facts.length === 1 ? `Remembered · ${esc(c.facts[0].text)}` : `Remembered ${c.facts.length} things · Memory`}</span></a>`);
      for (const s of c.stations || []) rows.push(`<a class="chr-row press" href="#/route/${encodeURIComponent(chat.id)}"><span class="chr-seg" aria-hidden="true"></span><span>New station · ${esc(s)}</span></a>`);
      return rows.filter(Boolean).length ? `<div class="chr">${rows.join('')}</div>` : '';
    }

    // Long-press › Mark on route map: name the moment, it becomes a station.
    function markSheet(m) {
      const guess = plain(textOf(m)).replace(/["“”*`]/g, '').split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
      openSheet({
        label: 'Mark on route map',
        html: `<h2 class="sheet-title">Mark on route map</h2><form id="mkF"><input class="mk-in" id="mkIn" maxlength="60" value="${esc(guess)}" aria-label="Station name" autocomplete="off"><p class="fhint">Give the moment a short name.</p><div class="sheet-actions"><button type="submit" class="btn-primary press"><span>Add station</span></button></div></form>`,
        onMount(s, close) {
          const inp = s.querySelector('#mkIn');
          setTimeout(() => (inp.focus(), inp.select()), 80);
          s.querySelector('#mkF').addEventListener('submit', async (e) => {
            e.preventDefault();
            const st = markStation(chat, m, inp.value);
            close();
            if (!st) return toast('That message is already on the map');
            await saveChat(chat, false);
            toast('Added to the route map', { action: 'Open', onAction: () => (location.hash = `#/route/${encodeURIComponent(chat.id)}`) });
          });
        },
      });
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

    // `text`: send this instead of the composer (a picked move), leaving any draft in place.
    async function send(risky = false, text = null) {
      const t = (text ?? input.value).trim();
      if (!t || busy) return;
      stopParts();
      stopSpeaking();
      const m = { id: uid(), role: 'user', alts: [t], alt: 0, at: Date.now() };
      // Adventure mode: a d20 check rides along (the d20 toggle, or a risky suggested move).
      const dice = root.querySelector('#diceBtn');
      if (advOn(chat) && (risky || dice?.getAttribute('aria-pressed') === 'true')) m.roll = roll();
      dice?.setAttribute('aria-pressed', 'false');
      if (speakAs) (m.as = speakAs), setSpeakAs(null);
      chat.messages.push(m);
      const idx = chat.messages.length - 1;
      log.querySelector('.empty')?.remove();
      log.querySelector('.err')?.remove();
      // Drop tools (and suggested moves) from the previous last message.
      log.querySelectorAll('.msg-tools, .mv').forEach((x) => x.remove());
      log.insertAdjacentHTML('beforeend', msgHTML(m, idx, true));
      if (m.roll) flipRoll(log.querySelector(`.roll-row[data-roll="${m.id}"]`));
      if (text == null) (input.value = ''), fit();
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
    // ---------- voice ----------
    // A reply as spoken parts: narration in the default voice, each speaker in their own.
    function partsOf(m) {
      const text = named(textOf(m), speakerOf(m), 'you', me());
      const blocks = scene ? parseScene(text, castNames()) : splitTurn(text, speakerOf(m).name);
      return blocks.map((b) => {
        if (b.kind !== 'say') return { text: b.text, narr: true, who: null };
        const r = scene ? resolveSpeaker(b.name, ix.people, me().name) : { kind: 'line', who: speakerOf(m) };
        return { text: b.text, narr: false, who: r.kind === 'line' ? r.who : null, name: b.name };
      });
    }
    function speakReply(m, onEnd) {
      return speakParts(partsOf(m), { onEnd, onPart: (p) => vm.on && vmSet('speaking', p) });
    }
    function voicesMenu() {
      const save = (who) => async (v) => {
        who.voice = v;
        await saveCharacter(who);
      };
      if (!ix) return voiceSheet(ch, { onSave: save(ch) });
      openMenu(root.querySelector('#moreBtn'), ix.people.map((p) => ({ icon: 'speaker', label: `${p.name}’s voice`, on: () => voiceSheet(p, { onSave: save(p) }) })));
    }

    // Composer mic: talk instead of typing; the words land in the box for you to send.
    let dict = null;
    root.querySelector('#micBtn')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (dict) return dict.stop();
      stopParts();
      const before = input.value.trim();
      b.setAttribute('aria-pressed', 'true');
      dict = listen({
        onInterim: (t) => ((input.value = (before ? before + ' ' : '') + t), fit(), (sendBtn.disabled = !input.value.trim())),
        onFinal: () => input.focus(),
        onEnd: () => ((dict = null), b.setAttribute('aria-pressed', 'false')),
        onError: (k) => {
          dict = null;
          b.setAttribute('aria-pressed', 'false');
          toast(k === 'blocked' ? 'Microphone blocked. Allow it for this site in the browser settings.' : 'Couldn’t listen just now.', { kind: 'err' });
        },
      });
    });

    // Hands-free voice mode: Listening → Thinking → Speaking, then listening again.
    const vm = { on: false, state: 'listening', rec: null, said: '', who: null, heard: false };
    const vbar = root.querySelector('#vbar');
    const STOPS = [['listening', 'Listening'], ['thinking', 'Thinking'], ['speaking', 'Speaking']];
    // The bar is built once; each state change updates it in place (so the yellow plate slides
    // between stops and keyboard focus stays on the same control).
    function vmRender() {
      const st = vm.state;
      if (!vbar.querySelector('.vb-h')) vbar.innerHTML = `<div class="vb-h"><span>Voice mode</span><span>hands-free</span></div><div class="vb-mid"></div><p class="vb-tx"></p><div class="vb-acts"></div>`;
      const mid = vbar.querySelector('.vb-mid');
      if (['paused', 'blocked', 'tap'].includes(st)) {
        mid.innerHTML = `<p class="vb-state${st === 'blocked' ? ' cream' : ''}">${st === 'blocked' ? '<b>Microphone blocked.</b> Allow it for this site in the browser settings, or type instead.' : st === 'tap' ? 'Tap Talk when you’re ready.' : '<b>Paused.</b> Nothing was sent.'}</p>`;
      } else {
        if (!mid.querySelector('.vb-stops')) mid.innerHTML = `<div class="vb-stops">${STOPS.map(() => '<span></span>').join('')}</div>`;
        const box = mid.querySelector('.vb-stops');
        box.style.setProperty('--i', STOPS.findIndex(([k]) => k === st));
        box.querySelectorAll('span').forEach((s, k) => {
          const [key, label] = STOPS[k];
          s.className = key === st ? 'on' : '';
          s.innerHTML = key === 'speaking' && st === 'speaking' ? (vm.who ? `<i style="background:${vm.who.line?.color || '#2EAA67'}"></i>${esc(vm.who.name.split(' ')[0])}` : 'Narrator') : label;
        });
      }
      vbar.querySelector('.vb-tx').innerHTML = vm.said ? `“${esc(vm.said)}”` : st === 'listening' ? 'Say something…' : '&nbsp;';
      const had = vbar.contains(document.activeElement) ? document.activeElement.dataset.vb : null;
      const fwd = st === 'listening' ? `<button type="button" class="vb-go press" data-vb="send">Send now</button>` : ['speaking', 'tap', 'paused'].includes(st) ? `<button type="button" class="vb-go press" data-vb="talk">${st === 'paused' ? 'Resume' : 'Talk'}</button>` : '';
      vbar.querySelector('.vb-acts').innerHTML = `${['paused', 'tap', 'blocked'].includes(st) ? '' : `<button type="button" class="press" data-vb="pause">Pause</button>`}<button type="button" class="press" data-vb="type">Type instead</button><button type="button" class="press" data-vb="end">End</button>${fwd}`;
      if (had) (vbar.querySelector(`[data-vb="${had}"]`) || vbar.querySelector('.vb-go') || vbar.querySelector('[data-vb]'))?.focus();
    }
    const say = (t) => {
      const lv = root.querySelector('#vbSay');
      if (lv) lv.textContent = t;
    };
    function vmSet(state, part) {
      vm.state = state;
      if (part !== undefined) vm.who = part?.narr ? null : part?.who || null;
      vmRender();
      say({ listening: 'Listening', thinking: 'Thinking', speaking: vm.who ? `${vm.who.name} speaking` : 'Speaking', paused: 'Paused', blocked: 'Microphone blocked', tap: 'Tap Talk to speak' }[state] || '');
    }
    function vmListen() {
      if (!vm.on || destroyed) return;
      vm.said = '';
      vmSet('listening');
      vm.rec = listen({
        onInterim: (t) => {
          vm.heard = true;
          vm.said = t;
          const tx = vbar.querySelector('.vb-tx');
          if (tx) tx.textContent = `“${t}”`;
        },
        onFinal: (t) => {
          vm.rec = null;
          if (!vm.on) return;
          if (!t.trim()) return vmSet('paused'); // silence: pause, never send an empty line
          if (busy) return vmSet('thinking'); // a reply is still coming: it continues the loop
          vmSet('thinking');
          say(`You said: ${t}. Thinking`);
          input.value = t;
          send();
        },
        onError: (k) => {
          vm.rec = null;
          // iOS refuses to start listening again without a tap: that's "Tap to talk", not a blocked mic.
          vmSet(k === 'blocked' && !vm.heard ? 'blocked' : 'tap');
        },
      });
    }
    function vmAfterReply(m) {
      if (!vm.on || destroyed || vm.state === 'paused') return;
      if (!m) return vmSet('tap');
      vmSet('speaking');
      const ok = speakReply(m, () => vm.on && vm.state === 'speaking' && vmListen());
      if (!ok) vmListen();
    }
    function vmStart() {
      vm.on = true;
      root.querySelector('#composer').hidden = true;
      chips.hidden = true;
      vbar.hidden = false;
      if (!root.querySelector('#vbSay')) vbar.insertAdjacentHTML('afterend', '<p class="vh" aria-live="polite" id="vbSay"></p>');
      vmListen();
      vbar.querySelector('[data-vb]')?.focus();
    }
    vmStopAll = () => {
      vm.rec?.abort();
      vm.rec = null;
      stopParts();
    };
    function vmEnd(type = false) {
      vm.on = false;
      vmStopAll();
      vbar.hidden = true;
      root.querySelector('#composer').hidden = false;
      chips.hidden = false;
      renderChips();
      (type ? input : root.querySelector('#micBtn') || input).focus();
    }
    vbar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vb]');
      if (!b) return;
      const k = b.dataset.vb;
      if (k === 'end') return vmEnd();
      if (k === 'type') return vmEnd(true);
      if (k === 'pause') return vmStopAll(), vmSet('paused');
      if (k === 'send') return vm.rec?.stop();
      if (k === 'talk') return busy ? vmSet('thinking') : (stopParts(), vmListen());
    });
    root.addEventListener('keydown', (e) => {
      if (!vm.on || e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') vmEnd();
      // Space on a focused button presses that button instead.
      else if (e.key === ' ' && !e.target.closest('button')) e.preventDefault(), vm.state === 'paused' ? vmListen() : (vmStopAll(), vmSet('paused'));
      else if (e.key.toLowerCase() === 't') vmEnd(true);
    });

    // ---------- scene pictures ----------
    function picsHTML(m) {
      if (!m.pics?.length) return '';
      return m.pics
        .filter((p) => (p.alt || 0) === (m.alt || 0)) // pictures belong to the version they show
        .map((p) => (picSrc(p) ? `<figure class="pic" data-pic="${p.id}"><button type="button" class="pic-open" data-picid="${p.id}" aria-label="Open picture: ${esc(altOf(p))}"><img class="pic-img" src="${esc(picSrc(p))}" alt="${esc(altOf(p))}"></button><figcaption><span>${esc(p.caption || STYLES[p.style]?.label || 'Scene')}</span><button type="button" class="pic-more press" data-picmore="${p.id}" aria-label="Picture options">${icon('more', 18)}</button></figcaption></figure>` : ''))
        .join('');
    }
    const picOwner = (pid) => chat.messages.find((x) => x.pics?.some((p) => p.id === pid));
    function pictureSheet(m) {
      const pc = picConn();
      let style = chat.picStyle || picPrefs().style;
      const who = (ix ? speakerOf(m) : ch).name;
      openSheet({
        label: 'Picture this',
        html: `<h2 class="sheet-title">Picture this</h2>
          <p class="sheet-p">${pc ? `Paints this moment with ${esc(who)}’s look${hereOf(chat) ? `, ${esc(hereOf(chat).name)}` : ''}${clockOn(chat) ? `, ${esc(partOfDay(chat.clock.min))}` : ''}. ${isDemoPics(pc) ? 'Demo pictures are free placeholders.' : `One picture, billed by ${esc(providerName(pc))}.`}` : 'Pictures need an image model: an OpenAI or OpenRouter connection set under Connections › Pictures.'}</p>
          ${pc ? `<div class="ck-chips" role="radiogroup" aria-label="Style">${Object.entries(STYLES).map(([k, s]) => `<button type="button" class="press" role="radio" aria-checked="${style === k}" data-style="${k}">${s.label}</button>`).join('')}</div>
          <div class="ck-tog">${toggleRow('picAuto', 'Paint each new station', 'A picture whenever the Route map gets a new station. Each one is billed.', !!chat.picAuto)}</div>` : ''}
          <button type="button" class="pic-go press" id="picGo">${icon(pc ? 'image' : 'link', 18)}${pc ? 'Paint it' : 'Set up Pictures'}</button>`,
        onMount(s, close) {
          s.querySelector('.ck-chips')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-style]');
            if (!b) return;
            style = b.dataset.style;
            s.querySelectorAll('[data-style]').forEach((x) => x.setAttribute('aria-checked', x === b));
          });
          const tog = s.querySelector('#picAuto');
          if (tog) bindSwitch(tog, async (on) => ((chat.picAuto = on), await saveChat(chat)));
          s.querySelector('#picGo').addEventListener('click', async () => {
            close();
            if (!pc) return void (location.hash = '#/connections');
            chat.picStyle = style;
            await saveChat(chat, false);
            runPaint(m, style);
          });
        },
      });
    }
    // The plate shows the scene being described line by line, like a departure board, then the picture.
    async function runPaint(m, style) {
      const el = log.querySelector(`.msg[data-id="${CSS.escape(m.id)}"] .msg-col`);
      if (!el) return;
      const ctlP = new AbortController();
      const plate = document.createElement('figure');
      plate.className = 'pic painting';
      plate.innerHTML = `<div class="pic-board" aria-hidden="true"><span class="pic-wait">Describing the scene…</span></div><figcaption><span class="pic-status" role="status">Painting · ${esc(STYLES[style]?.label || '')}</span><button type="button" class="pic-cancel press">Cancel</button></figcaption>`;
      const bubble = el.querySelector('.bubble');
      bubble.after(plate);
      if (nearBottom()) toBottom(true);
      plate.querySelector('.pic-cancel').addEventListener('click', () => ctlP.abort());
      const board = plate.querySelector('.pic-board');
      let timer = 0;
      try {
        const rec = await paint({
          chat,
          cast: ix ? ix.people : [ch],
          m,
          persona: me(),
          textConn: connectionFor(ch),
          style,
          signal: ctlP.signal,
          onPrompt: (p) => {
            const words = p.toUpperCase().split(/\s+/);
            const lines = [];
            for (let k = 0; k < words.length; k += 6) lines.push(words.slice(k, k + 6).join(' '));
            board.innerHTML = '';
            if (reducedMotion()) return void (board.innerHTML = lines.map((l) => `<span>${esc(l)}</span>`).join(''));
            let k = 0;
            timer = setInterval(() => {
              if (k >= lines.length) return clearInterval(timer);
              const s = document.createElement('span');
              s.textContent = lines[k++];
              board.appendChild(s);
            }, 220);
          },
        });
        clearInterval(timer);
        (m.pics ||= []).push(rec);
        keepScene(chat, rec, m); // saved to this chat's Scenes too
        await saveChat(chat);
        if (destroyed) return;
        const i = chat.messages.indexOf(m);
        if (i >= 0) rerenderMsg(i);
        log.querySelector(`[data-pic="${rec.id}"]`)?.classList.add('fresh');
        toast('Painted');
      } catch (e) {
        clearInterval(timer);
        if (e.name === 'AbortError') return plate.remove();
        plate.classList.add('failed');
        board.removeAttribute('aria-hidden');
        board.innerHTML = `<b>Couldn’t paint this one.</b><span>${esc(e.message || '')}${e.hint ? ' ' + esc(e.hint) : ''}</span>`;
        const cap = plate.querySelector('figcaption');
        cap.innerHTML = `<span role="status">Couldn’t paint</span><button type="button" class="pic-cancel press">Paint again</button>`;
        cap.querySelector('button').addEventListener('click', () => (plate.remove(), runPaint(m, style)));
      }
    }
    async function picAction(pid, what) {
      const m = picOwner(pid);
      const p = m?.pics.find((x) => x.id === pid);
      if (!p) return;
      const who = ix ? speakerOf(m) : ch;
      if (what === 'bg') {
        chat.bgPic = chat.bgPic === p.key ? null : p.key;
        await saveChat(chat);
        setScene();
        toast(chat.bgPic ? 'Set as this chat’s background' : 'Background picture removed');
      } else if (what === 'portrait') {
        who.avatarImage = await squareOf(picSrc(p));
        await saveCharacter(who);
        renderAll();
        toast(`${who.name}’s portrait updated`);
      } else if (what === 'again') runPaint(m, p.style);
      else if (what === 'delete') {
        if (!(await confirmSheet({ title: 'Delete this picture?', body: 'It’s removed from this chat and from the app.', ok: 'Delete', danger: true }))) return;
        m.pics = m.pics.filter((x) => x !== p);
        removeScene(chat, p.key);
        if (chat.bgPic === p.key) (chat.bgPic = null), setScene();
        await saveChat(chat);
        await gcPictures();
        rerenderMsg(chat.messages.indexOf(m));
      }
    }
    const picItems = (pid) => {
      const m = picOwner(pid);
      const p = m?.pics.find((x) => x.id === pid);
      const who = m && (ix ? speakerOf(m) : ch);
      return [
        { icon: 'image', label: chat.bgPic === p?.key ? 'Remove as background' : 'Use as background', on: () => picAction(pid, 'bg') },
        // Only for characters shown as a letter.
        ...(who && !who.avatarImage && who.preset === 'initial' ? [{ icon: 'user', label: `Use as ${who.name}’s portrait`, on: () => picAction(pid, 'portrait') }] : []),
        { icon: 'refresh', label: 'Paint again (new picture)', on: () => picAction(pid, 'again') },
        { icon: 'trash', label: 'Delete picture', on: () => picAction(pid, 'delete') },
      ];
    };
    log.addEventListener('click', (e) => {
      const chap = e.target.closest('.chap');
      if (chap) return chapterMenu(chap);
      const cg = e.target.closest('[data-chapgo]');
      if (cg) return goChapter(cg.dataset.chapgo);
      const more = e.target.closest('[data-picmore]');
      if (more) return openMenu(more, picItems(more.dataset.picmore));
      const opener = e.target.closest('.pic-open');
      if (!opener) return;
      e.stopImmediatePropagation();
      const img = opener.querySelector('img');
      const pid = opener.dataset.picid;
      const p = picOwner(pid)?.pics.find((x) => x.id === pid);
      const lb = document.createElement('div');
      lb.className = 'lightbox pic-lb';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Picture');
      lb.innerHTML = `<img src="${esc(img.getAttribute('src'))}" alt="${esc(img.alt)}"><div class="pic-lb-bar"><details><summary>${icon('chev', 16)}What was painted</summary><p>${esc(p?.prompt || '')}</p></details><div class="pic-lb-acts">${picItems(pid).map((x, k) => `<button type="button" class="press" data-k="${k}">${icon(x.icon, 16)}${esc(x.label)}</button>`).join('')}<button type="button" class="press" data-close>${icon('x', 16)}Close</button></div></div>`;
      const shut = () => (lb.remove(), removeEventListener('keydown', esc1), opener.isConnected && opener.focus());
      // Escape closes; Tab stays inside the picture view.
      const esc1 = (k) => {
        if (k.key === 'Escape') return shut();
        if (k.key !== 'Tab') return;
        const f = [...lb.querySelectorAll('button, summary')];
        const i = f.indexOf(document.activeElement);
        if (k.shiftKey && i <= 0) (k.preventDefault(), f[f.length - 1].focus());
        else if (!k.shiftKey && i === f.length - 1) (k.preventDefault(), f[0].focus());
      };
      lb.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-k]');
        if (b) return shut(), picItems(pid)[+b.dataset.k].on();
        if (ev.target.closest('[data-close]') || ev.target === lb || ev.target.tagName === 'IMG') shut();
      });
      addEventListener('keydown', esc1);
      document.body.appendChild(lb);
      lb.querySelector('[data-close]').focus();
    }, true);

    // ---------- world map ----------
    // The background follows where the story is (a place's scene), else the character's own.
    // The sign repaints when the place, station, chapter or story time changes; a new station ticks the number.
    function paintSign() {
      const b = root.querySelector('#signBtn');
      if (!b) return;
      const old = b.querySelector('.num')?.textContent;
      b.innerHTML = signHTML();
      const n = b.querySelector('.num');
      if (old && n && old !== n.textContent && !reducedMotion()) n.classList.add('tick');
      labelSign();
    }
    // The sign's name for screen readers: where you are and when; open/folded only when there's a picture.
    function labelSign() {
      const b = root.querySelector('#signBtn');
      if (!b) return;
      const s = signInfo();
      b.setAttribute('aria-label', `Where you are: ${s.title}${s.sub ? `, ${s.sub}` : ''}`);
      if (winPics().length) b.setAttribute('aria-expanded', String(!root.querySelector('#win').classList.contains('fold')));
      else b.removeAttribute('aria-expanded');
    }
    // The window folds to its sign while you read back through older messages, while you type on a
    // phone (the keyboard needs the room) and when you tap the sign; it opens again at the bottom.
    const winEl = root.querySelector('#win');
    fitPics(winEl);
    let autoFold = false;
    let stuck = true; // the log was at its bottom: keep it there while the window opens or folds
    const foldNow = () => {
      const f = !!chat.winFold || autoFold;
      winEl.classList.toggle('fold', f);
      labelSign();
    };
    const setAuto = (v) => {
      if (autoFold === v) return;
      autoFold = v;
      foldNow();
    };
    const typingOnPhone = () => document.activeElement === input && matchMedia('(pointer: coarse)').matches;
    log.addEventListener('scroll', () => {
      const gap = log.scrollHeight - log.scrollTop - log.clientHeight;
      stuck = gap < 24;
      if (gap > 260) setAuto(true);
      else if (stuck && !typingOnPhone()) setAuto(false);
    }, { passive: true });
    new ResizeObserver(() => stuck && toBottom()).observe(log);
    input.addEventListener('focus', () => typingOnPhone() && setAuto(true));
    input.addEventListener('blur', () => setTimeout(() => !typingOnPhone() && stuck && setAuto(false), 120));
    root.querySelector('#signBtn').addEventListener('click', async () => {
      const open = winEl.classList.contains('fold');
      chat.winFold = !open;
      autoFold = false;
      foldNow();
      if (open && !winPics().length) toast(ix ? 'This group has no picture yet. Add one in Edit group, or tap ⋯ under a painted scene › Use as background.' : `${ch.name} has no picture yet. Add one in Edit, or tap ⋯ under a painted scene › Use as background.`);
      else if (open && !winEl.classList.contains('has-pic')) toast('This picture was saved too small to show here. Upload it again in Edit, or re-import the card, to get a bigger copy.');
      await saveChat(chat, false);
    });
    foldNow();

    function setScene() {
      const w = root.querySelector('#win');
      if (!w) return;
      const k = winKey();
      if (w.dataset.k !== k) {
        w.dataset.k = k;
        const pic = w.querySelector('#winPic');
        pic.innerHTML = winPicHTML();
        w.classList.toggle('has-pic', !!winPics().length);
        w.classList.remove('framed');
        fitPics(w);
        if (!reducedMotion()) pic.classList.remove('slide'), void pic.offsetWidth, pic.classList.add('slide');
      }
      paintSign();
      soundNow();
    }
    // Arriving from the World map: the scene starts at the new place.
    {
      const last = chat.messages[chat.messages.length - 1];
      if (last?.dir === 'travel' && last.go) {
        // The flag goes only once the reply really starts, so leaving early doesn't lose it.
        setTimeout(() => {
          if (destroyed || busy || !chat.messages.includes(last)) return;
          delete last.go;
          saveChat(chat, false);
          generate('reply');
        }, 400);
        toast(last.time || 'Travelled', {
          action: 'Undo',
          ms: 6000,
          onAction: async () => {
            if (busy) ctl?.abort();
            untravel(chat, last);
            await saveChat(chat);
            renderAll();
            setScene();
            updateClock();
          },
        });
      }
    }

    // ---------- adventure mode ----------
    function rollHTML(m, enter = false) {
      if (!m.roll) return '';
      const big = m.roll.result === 'crit' || m.roll.result === 'fumble';
      return `<div class="roll-row${big ? ' big' : ''}${enter ? ' enter' : ''}" data-roll="${m.id}" data-for="${m.id}"><span class="roll-n num" aria-hidden="true">${m.roll.n}</span><span class="roll-w"><span class="vh">d20 rolled ${m.roll.n}: </span>${RESULT[m.roll.result]}</span></div>`;
    }
    // The number flips like a split-flap board while the reply is on its way, then settles.
    function flipRoll(el) {
      if (!el) return;
      const n = el.querySelector('.roll-n');
      const w = el.querySelector('.roll-w');
      const final = n.textContent;
      if (reducedMotion()) return el.classList.add('fade');
      // Hidden by opacity only, so the log still announces the result right away.
      w.style.opacity = '0';
      let k = 0;
      const t = setInterval(() => {
        n.textContent = 1 + Math.floor(Math.random() * 20);
        n.classList.toggle('flip');
        if (++k >= 12) {
          clearInterval(t);
          n.textContent = final;
          n.classList.remove('flip');
          n.classList.add('settle');
          w.style.opacity = '';
          w.classList.add('in');
        }
      }, 58);
    }
    function movesHTML(m, i) {
      if (!advOn(chat) || !m.moves?.length || m.movesAlt !== m.alt || i !== chat.messages.length - 1) return '';
      return `<div class="mv" role="group" aria-label="Suggested moves" data-for="${m.id}">${m.moves
        .map((x, k) => `<button type="button" class="mv-b press" data-move="${k}"><span class="mv-n" aria-hidden="true">${k + 1}</span><span class="mv-t">${esc(x.text)}</span>${x.risky ? '<span class="mv-d">d20</span>' : ''}${x.risky ? '<span class="vh">, risky: rolls a d20</span>' : ''}</button>`)
        .join('')}</div>`;
    }
    async function runMoves(conn, target) {
      try {
        const moves = await suggestMoves({ chat, cast: ix ? ix.people : [ch], persona: me(), conn });
        if (!moves.length || destroyed) return;
        target.moves = moves;
        target.movesAlt = target.alt;
        await saveChat(chat, false);
        const i = chat.messages.indexOf(target);
        if (i === chat.messages.length - 1 && !busy) {
          const stay = nearBottom();
          rerenderMsg(i);
          if (stay) toBottom(true);
        }
      } catch (e) {
        console.warn('moves failed', e);
      }
    }
    log.addEventListener('click', (e) => {
      const b = e.target.closest('[data-move]');
      if (!b || busy) return;
      const last = chat.messages[chat.messages.length - 1];
      const mv = last?.moves?.[+b.dataset.move];
      if (!mv) return;
      send(mv.risky, `*${mv.text}*`);
    });
    root.querySelector('#diceBtn').addEventListener('click', (e) => {
      const b = e.currentTarget;
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    });

    // ---------- story time ----------
    function updateClock() {
      paintSign();
      const b = root.querySelector('#clockBtn');
      if (!b) return;
      b.hidden = !clockOn(chat);
      if (!clockOn(chat)) return;
      const t = chipText(chat.clock);
      b.setAttribute('aria-label', `Story time: ${longText(chat.clock)}, ${partOfDay(chat.clock.min)}`);
      if (b.textContent !== t) (b.textContent = t), b.classList.remove('tick'), void b.offsetWidth, b.classList.add('tick');
    }
    function openClock() {
      clockSheet(chat, {
        save: () => saveChat(chat),
        onChange: updateClock,
        onSkip: async (label, note) => {
          const m = { id: uid(), role: 'user', dir: 'time', time: label, alts: [note], alt: 0, at: Date.now() };
          chat.messages.push(m);
          log.querySelector('.empty')?.remove();
          log.insertAdjacentHTML('beforeend', msgHTML(m, chat.messages.length - 1, true));
          toBottom(true);
          renderChips();
          await saveChat(chat);
        },
      });
    }
    root.querySelector('#clockBtn').addEventListener('click', openClock);
    updateClock();

    // Sync brought newer messages into this chat (updated in place): redraw when it's safe.
    const onSynced = (e) => {
      if (destroyed) return removeEventListener('chatbox-synced', onSynced);
      if (!busy && e.detail?.chatIds?.includes(chat.id) && !input.value.trim()) renderAll(), toBottom();
    };
    addEventListener('chatbox-synced', onSynced);

    // While you were away: after a long gap, the character sometimes leaves you a message first.
    // Checked once per absence; about three times in five it happens.
    async function maybeAway() {
      if (S.settings.awayNotes === false || busy || destroyed || input.value.trim() || !connectionFor(ch)) return;
      const last = chat.messages[chat.messages.length - 1];
      if (!last || chat.messages.length < 2 || last.error || chat.messages.slice(-2).some((x) => x.dir === 'away')) return;
      const lastAt = last.at || chat.updatedAt || 0;
      const gone = Date.now() - lastAt;
      if (gone < AWAY_MS || (chat.awayAt || 0) > lastAt) return;
      chat.awayAt = Date.now();
      if (Math.random() > 0.6) return saveChat(chat, false);
      const you = me().name?.trim() || 'the user';
      const span = awaySpan(gone);
      const note = scene
        ? `${you} has been away for ${span} and has just come back. Write a short scene of what the characters did meanwhile, ending with one of them leaving ${you} a short message. Time has passed: do not carry on the earlier moment as if no time had gone by.`
        : `${you} has been away for ${span} and has just come back. Send ${you} a short message now that they're back: one to three sentences, in character, about what you did meanwhile or how the wait felt. Time has passed: do not carry on the earlier moment as if no time had gone by.`;
      const m = { id: uid(), role: 'user', dir: 'away', away: { ms: gone }, alts: [note], alt: 0, at: Date.now() };
      chat.messages.push(m);
      log.querySelector('.empty')?.remove();
      log.querySelectorAll('.msg-tools').forEach((x) => x.remove());
      log.insertAdjacentHTML('beforeend', msgHTML(m, chat.messages.length - 1, true));
      toBottom(true);
      await saveChat(chat, false);
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
        .flatMap((m) => parseScene(textOf(m), castNames()).filter((b) => b.kind === 'say' && b.name.toLowerCase() === key).map((b) => b.text));
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
      // Stage directions (Steering, While you were away) hold a note for the AI, not a message: no menu.
      if (!m || m.dir || busy || menuOpen) return;
      menuOpen = true;
      el.classList.add('lifted');
      const lines = quoteLines(m);
      openMenu(
        el.querySelector('.bubble'),
        [
          { icon: 'edit', label: 'Edit message', on: () => editMessage(i) },
          { icon: 'copy', label: 'Copy', on: () => copyText(textOf(m)).then(() => toast('Copied')) },
          ...(ttsSupported ? [{ icon: 'speaker', label: 'Read aloud', on: () => (m.role === 'assistant' ? speakReply(m) : speak(textOf(m))) }] : []),
          ...(lines.length ? [{ icon: 'star', label: m.quotes?.length ? `Star a line (${m.quotes.length} starred)` : 'Star a line', on: () => starLineSheet(m, i, lines) }] : []),
          { icon: 'star', label: m.star ? 'Remove star from reply' : lines.length ? 'Star whole reply' : 'Star to Logbook', on: () => toggleStar(m, i) },
          { icon: 'pin', label: 'Pin to notes', on: () => pin(m) },
          ...(m.role === 'assistant' ? [{ icon: 'refresh', label: 'Rewrite…', on: () => rewriteSheet(i) }] : []),
          ...(m.role === 'assistant' && m.alts.length > 1 && !m.first ? [{ icon: 'layers', label: `Compare versions (${m.alts.length})`, on: () => compareSheet(i) }] : []),
          ...(m.role === 'assistant' ? [{ icon: 'image', label: 'Picture this', on: () => pictureSheet(m) }] : []),
          { icon: 'route', label: (chat.route || []).some((s) => s.msgId === m.id) ? 'On the route map' : 'Mark on route map', on: () => ((chat.route || []).some((s) => s.msgId === m.id) ? (location.hash = `#/route/${encodeURIComponent(chat.id)}`) : markSheet(m)) },
          ...((chat.chapters || []).some((c) => c.msgId === m.id) ? [] : [{ icon: 'book', label: 'Start a chapter here', on: () => chapterNameSheet({ m }) }]),
          markOf(m) ? { icon: 'pin', label: 'Remove bookmark', on: () => unbookmark(i) } : { icon: 'pin', label: 'Bookmark…', on: () => bookmarkSheet(i) },
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
            delete m.moves; // they followed the old text
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
        const blocks = m.speaker && !hasCastLines(text, ix.people) ? splitTurn(text, speakerOf(m).name) : parseScene(text, castNames());
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
      // Kept as written (paragraphs too); a very long message is cut at 1,500 characters.
      const t = textOf(m).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      chat.notes.push({ id: uid(), text: t.length > 1500 ? t.slice(0, 1497) + '…' : t, at: Date.now() });
      await save();
      setNotes();
      updateTokens();
      toast('Pinned to notes', { action: 'View', onAction: () => (location.hash = `#/memory/${chat.id}`) });
    }
    async function remove(i) {
      const [m] = chat.messages.splice(i, 1);
      if (chat.summary && i < chat.summary.upto) chat.summary.upto--;
      if (chat.chron && i < chat.chron.upto) chat.chron.upto--;
      const el = log.querySelector(`.msg[data-i="${i}"]`);
      if (el) await motion(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 180, easing: 'ease-in' }).finished.catch(() => {});
      renderAll();
      await save();
      updateTokens();
      setTimeout(() => gcPictures(), 6000); // its pictures go once Undo is no longer offered
      toast('Message deleted', {
        action: 'Undo',
        onAction: async () => {
          chat.messages.splice(i, 0, m);
          if (chat.summary && i < chat.summary.upto) chat.summary.upto++;
          if (chat.chron && i < chat.chron.upto) chat.chron.upto++;
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
        ...(ix ? [] : [{ icon: 'image', label: 'Window', on: sceneSheet }]),
        { icon: 'layers', label: scenesOf(chat).length ? `Scenes (${scenesOf(chat).length})` : 'Scenes', on: () => scenesSheet(chat, { title: ch.name, onWindow: () => setScene() }) },
        { icon: 'spark', label: 'Memory and notes', on: () => (location.hash = `#/memory/${encodeURIComponent(chat.id)}`) },
        { icon: 'layers', label: 'Final prompt', on: () => (location.hash = `#/final/${encodeURIComponent(chat.id)}`) },
        ...(ix ? [] : [{ icon: 'download', label: 'Export card (PNG)', on: async () => download(await exportCardPng(ch), slug(ch.name) + '.card.png') }]),
        { icon: 'clock', label: clockOn(chat) ? `Story time: ${longText(chat.clock)}` : 'Story time', on: openClock },
        ...(sttSupported && ttsSupported ? [{ icon: 'mic', label: 'Voice mode (hands-free)', on: () => vmStart() }] : []),
        ...(ttsSupported ? [{ icon: 'speaker', label: ix ? 'Voices' : `${ch.name}’s voice`, on: voicesMenu }] : []),
        { icon: 'route', label: hereOf(chat) ? `World map: ${hereOf(chat).name}` : 'World map', on: () => (location.hash = `#/map/${encodeURIComponent(chat.id)}`) },
        { icon: 'dice', label: advOn(chat) ? 'Quests and items' : 'Adventure mode', on: () => (location.hash = `#/adventure/${encodeURIComponent(chat.id)}`) },
        { icon: 'route', label: 'Route map', on: () => (location.hash = `#/route/${encodeURIComponent(chat.id)}`) },
        { icon: 'book', label: 'Chapters', on: chaptersSheet },
        ...(chat.messages.filter((m) => !m.dir).length >= 2 ? [{ icon: 'restart', label: 'Recap so far', on: () => showRecap(true) }] : []),
        { icon: 'heart', label: 'Bonds', on: () => (location.hash = `#/bonds/${encodeURIComponent(chat.id)}`) },
        { icon: 'book', label: 'Diary', on: () => (location.hash = `#/diary/${encodeURIComponent(chat.id)}`) },
        '-',
        { icon: 'user', label: `You: ${me().name?.trim() || 'You'}`, on: personaSheet },
        { icon: 'download', label: 'Export as story', on: exportStory },
        { icon: 'search', label: 'Find in this chat', on: openFind },
        { icon: 'pin', label: `Bookmarks${(chat.marks || []).length ? ` (${chat.marks.length})` : ''}`, on: bookmarksSheet },
        { icon: 'speaker', label: 'Sound', on: () => soundSheet({ chat, ch, ix, onChange: updSnd }) },
        { icon: 'sliders', label: 'Reading text', on: textSheet },
        { icon: 'talk', label: 'Reply style', on: () => replyStyleSheet(() => updateTokens()) },
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
      const c = await branchChat(chat, i);
      location.hash = `#/chat/${c.id}`;
      toast('Branched here. The original is under Chats.', { action: 'Back', ms: 5000, onAction: () => (location.hash = `#/chat/${chat.id}`) });
    }

    // ---------- Rewrite a reply: a new version made from it, the original one swipe away ----------
    const REWRITE = {
      shorter: { label: 'Shorter', note: 'Same moment, fewer words', ask: 'Make it noticeably shorter (about half), keeping the key action and the best lines.' },
      longer: { label: 'Longer', note: 'More detail and feeling', ask: 'Make it longer and richer: more detail, inner feeling and texture, without moving the story further than the original does.' },
      vivid: { label: 'More vivid', note: 'Sharper senses and images', ask: 'Make it more vivid: concrete sensory details, sharper verbs and images. Keep about the same length.' },
      dialogue: { label: 'More dialogue', note: 'Let them talk more', ask: 'Shift the balance toward dialogue: more spoken lines, less narration, the same events.' },
      format: { label: 'Fix formatting', note: 'Actions and speech marked right', ask: '' },
      own: { label: 'Your own', note: 'Say how to rewrite it' },
    };
    function rewriteSheet(i) {
      openSheet({
        label: 'Rewrite',
        html: `<h2 class="sheet-title">Rewrite</h2><p class="sheet-p">Makes a new version; the original stays a swipe away.</p>
          <div class="rw-grid">${Object.entries(REWRITE).map(([k, r]) => `<button type="button" class="rw-t press" data-rw="${k}"${k === 'own' ? ' aria-expanded="false"' : ''}><b>${r.label}</b><small>${r.note}</small></button>`).join('')}</div>
          <form id="rwOwn" class="rw-own" hidden><textarea class="input area" id="rwIn" rows="2" maxlength="400" placeholder="e.g. Make her colder and more guarded" aria-label="How to rewrite it"></textarea><button type="submit" class="btn-primary press"><span>Rewrite</span></button></form>`,
        onMount(s, close) {
          const form = s.querySelector('#rwOwn');
          const inp = s.querySelector('#rwIn');
          autosize(inp, 160);
          s.addEventListener('click', (e) => {
            const t = e.target.closest('[data-rw]');
            if (!t) return;
            if (t.dataset.rw === 'own') {
              form.hidden = !form.hidden;
              t.setAttribute('aria-expanded', String(!form.hidden));
              t.classList.toggle('on', !form.hidden);
              if (!form.hidden) setTimeout(() => inp.focus(), 60);
              return;
            }
            close();
            rewriteReply(i, t.dataset.rw);
          });
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const v = inp.value.trim();
            if (!v) return inp.focus();
            close();
            rewriteReply(i, 'own', v);
          });
        },
      });
    }
    async function rewriteReply(i, key, custom = '') {
      if (busy) return toast('Wait for the reply to finish first.');
      const m = chat.messages[i];
      if (!m || m.role !== 'assistant') return;
      const conn = connectionFor(ch);
      if (!conn) return toast('Add a connection first.', { action: 'Add', onAction: () => (location.hash = '#/connection/new') });
      const sp = speakerOf(m);
      const orig = textOf(m);
      const before = [...chat.messages.slice(0, i)].reverse().find((x) => x.role === 'user' && !x.dir);
      const fmt = proseOn() ? 'Actions and narration go in *asterisks*; spoken words in "double quotes".' : 'Narration is plain text; spoken words go in "double quotes".';
      const how =
        key === 'own'
          ? custom
          : key === 'format'
          ? `Fix only the formatting: ${fmt} Close any unpaired marks and break walls of text into short paragraphs. Do not change the wording.`
          : REWRITE[key].ask;
      const label = key === 'own' ? (custom.length > 22 ? custom.slice(0, 21) + '…' : custom) : REWRITE[key].label;
      const system = `You rewrite one reply in an ongoing roleplay story, written as ${scene ? 'the narrator voicing the whole cast' : sp.name}. Keep the same events, facts, names, voice and point of view unless the instruction says otherwise. ${fmt} Every character is an adult. Reply with the rewritten message only: no notes, no name in front.`;
      const content = (before ? `For context, the user's last message was:\n${named(textOf(before), sp, 'you', me()).slice(0, 1500)}\n\n` : '') + `The reply to rewrite:\n${named(orig, sp, 'you', me())}\n\nInstruction: ${how}`;
      const keepAlt = m.alt;
      m.alts.push('');
      m.alt = m.alts.length - 1;
      const at = m.alt;
      (m.altNote ||= {})[at] = label;
      rerenderMsg(i);
      setBusy(true);
      setStatus('typing');
      ctl = new AbortController();
      const mt = meter();
      let out = '';
      let raf = 0;
      try {
        await complete(conn, {
          system,
          messages: [{ role: 'user', content }],
          signal: ctl.signal,
          stream: true,
          maxTokens: Math.max(conn.maxTokens || 600, Math.ceil(estimateTokens(orig) * (key === 'longer' ? 2.2 : 1.4)) + 60),
          temperature: key === 'format' ? 0.2 : conn.temperature,
          character: { ...sp, demoText: () => orig },
          onUsage: mt.onUsage,
          onDelta(d) {
            out += d;
            m.alts[at] = out.replace(/^\s*\**[^*:\n]{1,30}\**:\s*/, '');
            if (!raf) raf = requestAnimationFrame(() => ((raf = 0), !destroyed && rerenderMsg(i)));
          },
        });
      } catch (e) {
        if (e.name !== 'AbortError') toast(e.message || 'Couldn’t rewrite it.', { kind: 'err' });
      }
      ctl = null;
      cancelAnimationFrame(raf);
      setBusy(false);
      setStatus('idle');
      const ok = !!out.trim();
      if (!ok) {
        m.alts.splice(at, 1);
        delete m.altNote[at];
        m.alt = keepAlt;
      } else mt.commit(estimateTokens(system + content), estimateTokens(out), (a, o, c) => recordFare(conn, sp.id, a, o, c)).catch(() => {});
      if (!destroyed) rerenderMsg(i);
      await saveChat(chat, false);
      if (ok && !destroyed)
        toast(`${label} version added`, {
          action: 'Undo',
          ms: 6000,
          onAction: async () => {
            if (m.alts.length - 1 !== at) return;
            m.alts.pop();
            delete m.altNote[at];
            m.alt = keepAlt;
            rerenderMsg(i);
            await saveChat(chat, false);
          },
        });
    }

    // ---------- Compare versions: a deck of every version of a reply ----------
    function compareSheet(i) {
      const m = chat.messages[i];
      if (!m || m.alts.length < 2) return;
      const sp = speakerOf(m);
      let cur = m.alt;
      const n = m.alts.length;
      const tag = (k) => `${k + 1}${m.altNote?.[k] ? ` · ${esc(m.altNote[k])}` : k === 0 ? ' · First' : ''}`;
      clearToasts();
      openSheet({
        label: 'Versions',
        html: `<h2 class="sheet-title">Versions</h2><p class="sheet-p" id="cvSay" aria-live="polite"></p>
          <div class="cv-deck" id="cvDeck" tabindex="0" aria-label="Versions, swipe to compare">${m.alts
            .map((t, k) => `<article class="cv-card" data-k="${k}" aria-label="Version ${k + 1}"><span class="cv-tag">${tag(k)}${k === m.alt ? '<em>In the chat</em>' : ''}</span><div class="cv-body">${formatMessage(showAi(named(t, sp, 'you', me())))}</div></article>`)
            .join('')}</div>
          <div class="cv-dots" aria-hidden="true">${m.alts.map((_, k) => `<i data-d="${k}"></i>`).join('')}</div>
          <button type="button" class="btn-primary press" id="cvUse"><span>Use this version</span></button>`,
        onMount(s, close) {
          const deck = s.querySelector('#cvDeck');
          const cards = [...deck.children];
          const mark = () => {
            s.querySelector('#cvSay').textContent = `Swipe to compare · ${cur + 1} of ${n}${cur === m.alt ? ' · in the chat' : ''}`;
            s.querySelectorAll('[data-d]').forEach((d, k) => d.classList.toggle('on', k === cur));
            s.querySelector('#cvUse').disabled = cur === m.alt;
          };
          requestAnimationFrame(() => (deck.scrollLeft = cards[cur].offsetLeft - deck.offsetLeft - 4));
          deck.addEventListener('scroll', () => {
            const mid = deck.scrollLeft + deck.clientWidth / 2;
            const k = cards.reduce((b, c, j) => (Math.abs(c.offsetLeft - deck.offsetLeft + c.offsetWidth / 2 - mid) < Math.abs(cards[b].offsetLeft - deck.offsetLeft + cards[b].offsetWidth / 2 - mid) ? j : b), 0);
            if (k !== cur) (cur = k), mark();
          }, { passive: true });
          deck.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const k = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
            cards[k].scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
          });
          s.querySelector('#cvUse').addEventListener('click', async () => {
            m.alt = cur;
            rerenderMsg(i);
            await saveChat(chat, false);
            close();
            toast(`Version ${cur + 1} is in the chat`);
          });
          mark();
        },
      });
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
      const mt = meter();
      try {
        await complete(conn, {
          system: built.system,
          messages: msgs,
          onUsage: mt.onUsage,
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
        mt.commit(built.total, estimateTokens(out), (i, o, c) => recordFare(conn, sp.id, i, o, c)).catch(() => {});
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
      const heads = chapterHeadings(chat);
      for (const m of chat.messages) {
        if (heads.has(m.id)) out.push(heads.get(m.id), '');
        if (m.error) continue;
        if (m.dir) {
          if (m.dir === 'skip' || m.dir === 'away') out.push('* * *', '');
          if (m.dir === 'travel') out.push('* * *', '', `*${m.time}*`, '');
          if (m.dir === 'time') out.push('* * *', '', `*${m.time}*`, '');
          continue;
        }
        const who = m.role === 'assistant' ? speakerOf(m) : ix ? ix.people[0] : ch;
        const t = named(textOf(m), who, 'you', me()).trim();
        if (!t) continue;
        if (m.role === 'user') out.push(`**${m.as ? speakerOf({ speaker: m.as }).name : you}:** ${t}`, '');
        else if (scene) for (const b of parseScene(t, castNames())) out.push(b.kind === 'narr' ? b.text.trim() : `**${b.name}:** ${b.text.trim()}`, '');
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
            const nScenes = scenesOf(S.chats.get(cid) || {}).length;
            if (!(await confirmSheet({ title: 'Delete this chat?', body: `Its messages, notes and summary go too${nScenes ? `, and its ${nScenes === 1 ? 'one painted scene' : `${nScenes} painted scenes`}` : ''}. Other chats with this character stay.`, ok: 'Delete chat', danger: true }))) return;
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
      openWindowSheet({
        value: { win: ch.win || 'card', scene: ch.scene || 'none' },
        pic: ch.avatarImage,
        name: ch.name,
        letter: ch.line?.letter,
        color: ch.line?.color || '#0A0A0A',
        num: signInfo().num,
        async onSave(d) {
          Object.assign(ch, { win: d.win, scene: d.scene });
          await saveCharacter(ch);
          setScene();
          toast('Window saved');
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
    // The mark button: tap wraps the selection (or puts a pair at the caret) in *, " or ';
    // hold it to pick another mark.
    bindMarkButton(root.querySelector('#actBtn'), {
      color: () => (ix ? '#ECECEC' : lineAccent(ch.line?.color)),
      onTap(mark) {
        const s = input.selectionStart;
        const e = input.selectionEnd;
        const v = input.value;
        input.value = v.slice(0, s) + mark.k + v.slice(s, e) + mark.k + v.slice(e);
        input.focus();
        input.setSelectionRange(s + 1, e + 1);
        fit();
        sendBtn.disabled = !input.value.trim();
      },
    });

    const onChip = (e) => {
      const st = e.target.closest('[data-steer]');
      if (st) return steer(st.dataset.steer);
      const b = e.target.closest('[data-chip]');
      if (!b || busy) return;
      if (b.dataset.chip === 'write') return writeForMe();
      if (b.dataset.chip === 'watch') return watchSheet();
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
            ${linkRow(ix ? `#/interchange/${ix.id}` : `#/edit/${ch.id}`, 'card', ix ? (scene ? 'Edit carriage' : 'Edit interchange') : 'Edit character', ix ? 'Picture, cast, world and scene' : 'Sheet, picture and first message')}
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
      const cmp = e.target.closest('[data-compare]');
      if (cmp) return compareSheet(+cmp.closest('.msg').dataset.i);
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
    } else {
      if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
      if (recapDue(chat, S.settings) && connectionFor(ch)) showRecap(false);
      setTimeout(() => maybeAway(), 700);
    }
    soundNow();
    // Arrival: the line colour draws under the header once as the chat opens.
    if (!reducedMotion()) {
      const cEl = root.querySelector('#chat');
      cEl.classList.add('arrive');
      setTimeout(() => cEl.classList.remove('arrive'), 1300);
    }
    {
      const fb = root.querySelector('#findbar');
      const inp = root.querySelector('#fbIn');
      let t = 0;
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          find.q = inp.value.trim();
          markAll(find.q);
          showHit(find.hits.length - 1); // start from the newest match
        }, 160);
      });
      fb.addEventListener('submit', (e) => (e.preventDefault(), showHit(find.at - 1)));
      root.querySelector('#fbUp').addEventListener('click', () => showHit(find.at - 1));
      root.querySelector('#fbDown').addEventListener('click', () => showHit(find.at + 1));
      root.querySelector('#fbClose').addEventListener('click', closeFind);
      inp.addEventListener('keydown', (e) => e.key === 'Escape' && closeFind());
    }
    root.querySelector('#wbStop')?.addEventListener('click', () => stopWatch(true));
    root.querySelector('#sndBtn').addEventListener('click', () => soundSheet({ chat, ch, ix, onChange: updSnd }));
  }

  return {
    html,
    depth: 1,
    mount,
    unmount() {
      watchOff?.();
      destroyed = true;
      silence();
      ctl?.abort();
      vmStopAll?.();
      stopParts();
      stopSpeaking();
    },
  };
}
