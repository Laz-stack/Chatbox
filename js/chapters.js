// Chapters and the "Previously" recap.
// - Chapters: the story's longer arcs. Each starts at a message. The background read (chronicle.js)
//   names chapter 1 and marks a new one when the story clearly moves into a new arc; you can start,
//   rename or remove one by hand. They show as breaks in the chat, in the Chapters sheet, on the
//   Route map and as headings in the exported story. Never sent to the AI as messages.
// - Recap: when you come back to a chat after a while, a short "Previously" card says where things
//   stand, written by the Helper from the summary and the last part of the story.
import { PROVIDERS } from './providers.js';
import { helperComplete } from './helper.js';
import { extractJson } from './blueprint.js';
import { textOf, named } from './store.js';
import { uid } from './util.js';
import { clockOn, hhmm } from './clock.js';
import { hereOf } from './worldmap.js';
import { changeText } from './chronicle.js';

const str = (v) => (v == null ? '' : String(v).trim());
const cleanTitle = (t) => str(t).replace(/^["“'*]+|["”'*.]+$/g, '').replace(/^chapter\s+\d+\s*[:·.-]\s*/i, '').slice(0, 60);
export const MIN_GAP = 12; // a new chapter needs at least this many messages since the last one began

// ---------- chapters ----------
export function sortChapters(chat) {
  const pos = new Map(chat.messages.map((m, i) => [m.id, i]));
  chat.chapters = (chat.chapters || []).filter((c) => pos.has(c.msgId)).sort((x, y) => pos.get(x.msgId) - pos.get(y.msgId));
  return chat.chapters;
}
// The chapter a message index is in (or null before the first chapter).
export function chapterAt(chat, idx) {
  const pos = new Map(chat.messages.map((m, i) => [m.id, i]));
  let cur = null;
  for (const c of chat.chapters || []) if (pos.has(c.msgId) && pos.get(c.msgId) <= idx) cur = c;
  return cur;
}
export const chapterNo = (chat, c) => (chat.chapters || []).indexOf(c) + 1;
// Message range [from, to] (1-based) of each chapter.
export function chapterSpans(chat) {
  const list = sortChapters(chat);
  const pos = new Map(chat.messages.map((m, i) => [m.id, i]));
  return list.map((c, k) => ({ c, n: k + 1, from: pos.get(c.msgId) + 1, to: k + 1 < list.length ? pos.get(list[k + 1].msgId) : chat.messages.length }));
}

export function addChapter(chat, msgId, title, auto = false) {
  chat.chapters ||= [];
  if (chat.chapters.some((c) => c.msgId === msgId)) return null;
  const c = { id: uid(), msgId, title: cleanTitle(title) || 'Untitled', auto, at: Date.now() };
  chat.chapters.push(c);
  sortChapters(chat);
  return c;
}
export function renameChapter(chat, id, title) {
  const c = (chat.chapters || []).find((x) => x.id === id);
  if (c && cleanTitle(title)) (c.title = cleanTitle(title)), (c.auto = false);
  return c;
}
export function removeChapter(chat, id) {
  chat.chapters = (chat.chapters || []).filter((c) => c.id !== id);
}
// Taken back with the reply that made it (regenerate / delete), unless you renamed it.
export function undoChapter(chat, id) {
  const c = (chat.chapters || []).find((x) => x.id === id);
  if (c?.auto) removeChapter(chat, id);
}

// For the background read.
export const chaptersBrief = (chat) => ({ chapters_so_far: (chat.chapters || []).map((c) => c.title) });
export const chaptersAsk = (chat) =>
  !(chat.chapters || []).length
    ? `\nChapters: also return "chapter_one":"..." naming the story's opening chapter, 2 to 5 words like a book chapter title (for example "Last Train Home").`
    : `\nChapters: if, and only if, this part clearly starts a new chapter of the story (a new arc after the last one resolved, a big jump in time, or the story moving on to a new place and situation for good), also return "chapter":{"msg":n,"title":"..."} with the [#n] where it begins and a 2 to 5 word title. Chapters are long: most parts don't start one. Otherwise leave it out.`;

// Apply what a read said. Returns the new chapter, or null.
export function applyChapter(chat, res, a, b) {
  chat.chapters ||= [];
  if (!chat.chapters.length && res?.chapter_one && chat.messages[0]) return addChapter(chat, chat.messages[0].id, res.chapter_one, true);
  const ch = res?.chapter;
  if (!ch || !cleanTitle(ch.title)) return null;
  const n = Math.round(Number(ch.msg)) - 1;
  if (!(n >= a && n < b) || !chat.messages[n]) return null;
  // Not too close to the chapter it would follow.
  const last = chapterAt(chat, n);
  const lastAt = last ? chat.messages.findIndex((m) => m.id === last.msgId) : -1;
  if (last && n - lastAt < MIN_GAP) return null;
  if (!chat.chapters.length) addChapter(chat, chat.messages[0].id, 'The Beginning', true);
  return addChapter(chat, chat.messages[n].id, ch.title, true);
}

// The exported story: "## Chapter 2: The Night Market" before a chapter's first message.
export function chapterHeadings(chat) {
  const out = new Map();
  chapterSpans(chat).forEach(({ c, n }) => out.set(c.msgId, `## Chapter ${n}: ${c.title}`));
  return out;
}

// ---------- recap ----------
export const RECAP_MS = 6 * 3600e3; // away this long before a recap shows
export const recapsOn = (settings) => settings.recaps !== false;
const isDemo = (conn) => !conn || PROVIDERS[conn.provider]?.format === 'demo';
const lastAt = (chat) => [...chat.messages].reverse().find((m) => m.at)?.at || chat.updatedAt || 0;

// Show a recap on opening: enough story to recap, and you've been away a while.
export function recapDue(chat, settings, now = Date.now()) {
  if (!recapsOn(settings)) return false;
  const said = chat.messages.filter((m) => !m.dir && !m.error && textOf(m).trim());
  if (said.length < 6) return false;
  const t = lastAt(chat);
  return !!t && now - t >= RECAP_MS && (chat.recap?.seenAt || 0) < t;
}
// The cached recap is still about the story as it stands.
export const recapFresh = (chat) => !!chat.recap?.text && chat.recap.upto === chat.messages.length;

// Up to three facts, from what the story already keeps: the last station, an open quest, the biggest bond change.
export function recapFacts(chat, cast) {
  const facts = [];
  const st = (chat.route || []).at(-1);
  if (st) facts.push({ text: st.title, k: 'Last station' });
  const q = (chat.quests || []).filter((x) => x.state === 'open').at(-1);
  if (q) facts.push({ text: q.title, k: 'Open quest' });
  let best = null;
  for (const p of cast) {
    const l = (chat.bonds?.[p.id]?.log || []).find((x) => x.d);
    if (!l) continue;
    const size = Object.values(l.d).reduce((s, v) => s + Math.abs(v), 0);
    if (!best || size > best.size) best = { size, text: `${changeText(l.d)}${l.why ? ` · ${l.why}` : ''}`, k: p.name };
  }
  if (best) facts.push({ text: best.text, k: best.k });
  const place = hereOf(chat);
  if (facts.length < 3 && place) facts.push({ text: place.name, k: 'Where you are' });
  return facts.slice(0, 3);
}
// "Chapter 2 · Day 2, 01:40 · rain"
export function recapMeta(chat) {
  const parts = [];
  const cur = chapterAt(chat, chat.messages.length - 1);
  if (cur) parts.push(`Chapter ${chapterNo(chat, cur)}`);
  if (clockOn(chat)) parts.push(`Day ${chat.clock.day}, ${hhmm(chat.clock.min)}`, chat.clock.weather);
  return parts.filter(Boolean);
}

function recent(chat, cast, persona, n = 16) {
  const you = persona?.name?.trim() || 'User';
  return chat.messages
    .slice(-n)
    .filter((m) => !m.dir && !m.error)
    .map((m) => `${m.role === 'user' ? you : cast.find((p) => p.id === m.speaker)?.name || cast[0]?.name || 'Narrator'}: ${named(textOf(m), cast[0], you, persona).slice(0, 900)}`)
    .join('\n\n');
}
// Write the recap prose (cached on the chat until the story moves on).
export async function writeRecap({ chat, cast, persona, conn, signal }) {
  if (recapFresh(chat)) return chat.recap;
  const you = persona?.name?.trim() || 'you';
  let text;
  if (isDemo(conn)) {
    const lastAi = [...chat.messages].reverse().find((m) => m.role === 'assistant' && !m.dir);
    const line = textOf(lastAi || {}).replace(/[*"“”_`]/g, '').split(/(?<=[.!?])\s/)[0].slice(0, 160);
    text = `You were with ${cast[0]?.name || 'them'}. Last thing that happened: ${line || 'a quiet moment'} (Demo recap. Add your API key for real ones.)`;
  } else {
    const cur = chapterAt(chat, chat.messages.length - 1);
    const brief = {
      cast: cast.map((p) => p.name),
      user: you,
      story_so_far: chat.summary?.text || '',
      chapter_now: cur?.title || '',
      recent_story: recent(chat, cast, persona),
    };
    const ask =
      `Write a "previously" recap for ${you}, who is coming back to this story after a break. Return {"recap":"..."}. ` +
      `2 or 3 sentences, under 60 words, speaking to the user as "you": where things stand right now, what just happened, and what is unresolved. Concrete names and details, no flourish, no headings.`;
    const out = await helperComplete(conn, 'recap', { system: 'You write short recaps of an ongoing roleplay story. Reply with ONE JSON object and nothing else. Every character is an adult.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 1500, temperature: 0.5, signal });
    try {
      const j = extractJson(out);
      text = str(j.recap || Object.values(j).find((v) => typeof v === 'string' && v.length > 20));
    } catch {
      text = /\{/.test(out) ? '' : str(out);
    }
    text = text.replace(/\*/g, '').slice(0, 600);
    if (!text) throw new Error('The recap came back empty. Try again.');
  }
  chat.recap = { text, upto: chat.messages.length, at: Date.now(), seenAt: chat.recap?.seenAt || 0 };
  return chat.recap;
}
