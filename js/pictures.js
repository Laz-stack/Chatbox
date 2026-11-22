// Scene pictures: the AI writes what the moment looks like (the characters' looks, the place, the
// time of day) and an image model paints it. Pictures are saved in the app (S.images) and
// attached to the message they show.
import { S, connection, saveImages, recordPicture } from './store.js';
import { PROVIDERS, generateImage } from './providers.js';
import { extractJson, compileSheet } from './blueprint.js';
import { helperComplete } from './helper.js';
import { textOf, named } from './store.js';
import { uid } from './util.js';
import { hereOf } from './worldmap.js';
import { clockOn, hhmm, partOfDay } from './clock.js';

export const STYLES = {
  anime: { label: 'Anime', words: 'anime illustration, clean line art, soft cel shading, expressive faces' },
  painterly: { label: 'Painterly', words: 'painterly digital illustration, visible soft brush strokes, cinematic light' },
  comic: { label: 'Comic', words: 'comic book panel, bold ink lines, flat colours, dramatic framing' },
  realistic: { label: 'Realistic', words: 'realistic photographic look, natural light, shallow depth of field' },
};
export const MODEL_HINTS = { openai: 'gpt-image-1', openrouter: 'google/gemini-2.5-flash-image', custom: 'your image model', demo: '' };

export const picPrefs = () => ({ connId: null, model: '', style: 'painterly', price: null, ...(S.settings.pictures || {}) });
// The connection that paints, if one is set up and able to.
export function picConn() {
  const p = picPrefs();
  const c = p.connId ? connection(p.connId) : null;
  if (!c || PROVIDERS[c.provider]?.format === 'anthropic') return null;
  return c;
}
export const picModel = (c = picConn()) => picPrefs().model?.trim() || (c?.provider === 'demo' ? '' : c?.model || MODEL_HINTS[c?.provider] || '');
export const providerName = (c = picConn()) => (c ? c.name || PROVIDERS[c.provider]?.label || 'your provider' : 'your provider');

// What the moment looks like, as a short prompt for the image model.
// The plain version: the place, the time and the first sentence of the moment (demo, and the
// fallback when the model's reply can't be read).
function plainScene(text, place, when) {
  return `${place ? place.name + ', ' : ''}${when ? when + '. ' : ''}${text.replace(/[*"“”]/g, '').split(/(?<=[.!?])\s/)[0].slice(0, 200)}`;
}
// Read the model's reply: JSON, a JSON object cut off part-way, or plain prose. '' when there's nothing usable.
export function sceneFromReply(out) {
  const t = String(out || '').trim();
  try {
    const j = extractJson(t);
    if (String(j.prompt || '').trim()) return String(j.prompt).trim() + (j.caption ? `\n§${String(j.caption).trim().slice(0, 40)}` : '');
  } catch {}
  // Cut off (ran out of tokens): keep what was written of "prompt".
  const m = t.match(/"prompt"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (m && m[1].trim().length > 40) return m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
  // Prose instead of JSON.
  if (!t.includes('{') && t.length > 40) return t.replace(/^prompt\s*:\s*/i, '').replace(/\s+/g, ' ').slice(0, 700);
  return '';
}

// What the moment looks like, as a short prompt for the image model.
export async function describe({ chat, cast, m, persona, conn, signal }) {
  const you = persona?.name?.trim() || 'the user';
  const place = hereOf(chat);
  const when = clockOn(chat) ? `${partOfDay(chat.clock.min)} (${hhmm(chat.clock.min)}), ${chat.clock.weather}` : '';
  const text = named(textOf(m), cast[0], you, persona).replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 1600);
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') return plainScene(text, place, when);
  const looks = cast.map((p) => ({ name: p.name, looks: compileSheet(p).slice(0, 700) }));
  const brief = { characters: looks, user: { name: you, looks: String(persona?.about || '').slice(0, 300) }, place: place ? `${place.name}: ${place.note}` : '', time: when, moment: text };
  const ask =
    'Write a prompt for an illustration of this exact moment. Return {"prompt":"...","caption":"..."}. ' +
    'prompt: 50 to 90 words, present tense, concrete and visual: who is in frame and what they look like (hair, clothes, build, from their sheets), what they are doing, the setting, light and mood. Landscape framing. ' +
    'No names of real artists, no text or lettering in the image. Everyone is an adult. caption: 1 to 4 words naming the place or moment.';
  // Room to spare: models that think first spend tokens before the answer (only what's used is billed).
  const out = await helperComplete(conn, 'scene', { system: 'You write prompts for an illustrator. Reply with ONE JSON object and nothing else.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 1200, temperature: 0.6, signal });
  // A reply that can't be read still paints: from the moment itself.
  return sceneFromReply(out) || plainScene(text, place, when);
}

// Shrink a picture for storage (JPEG, longest side `max`).
async function shrink(url, max = 1024) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('The picture couldn’t be loaded.'));
    i.src = url;
  });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}
// A square from the middle (for a portrait).
export async function squareOf(url, size = 512) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 3, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.88);
}

// Paint: returns the picture record { id, key, prompt, caption, style, at }.
export async function paint({ chat, cast, m, persona, textConn, style, signal, onPrompt }) {
  const pc = picConn();
  if (!pc) throw new Error('Set up Pictures first (Connections › Pictures).');
  const raw = await describe({ chat, cast, m, persona, conn: textConn, signal });
  const [prompt, cap] = raw.split('\n§');
  if (!prompt?.trim()) throw new Error('The scene couldn’t be described. Try again.'); // nothing is billed for the picture
  onPrompt?.(prompt);
  const st = STYLES[style] || STYLES.painterly;
  const full = `${st.words}. ${prompt}. Wide landscape composition. No text, captions, logos or watermarks.`;
  const { url, cost } = await generateImage(pc, { model: picModel(pc), prompt: full, signal });
  recordPicture(pc, picModel(pc) || 'demo pictures', cost ?? (pc.provider === 'demo' ? 0 : null), chat.characterId, picPrefs().price).catch(() => {});
  // Keep the picture even when it can't be shrunk here (a link without CORS): it was already paid for.
  const data = url.startsWith('data:image/svg') ? url : await shrink(url).catch(() => url);
  const key = 'pic:' + uid();
  S.images = { ...(S.images || {}), [key]: data };
  await saveImages();
  const place = hereOf(chat);
  const when = clockOn(chat) ? `Day ${chat.clock.day} · ${hhmm(chat.clock.min)}` : '';
  return { id: uid(), key, prompt, caption: [cap || place?.name, when].filter(Boolean).join(' · '), style, at: Date.now(), alt: m.alt || 0 };
}
// Paint on Perchance: Chatbox writes the prompt, the user paints it there and adds the picture back.
export const PERCHANCE_URL = 'https://perchance.org/ai-character-generator';
export async function perchancePrompt({ chat, cast, m, persona, conn, style, signal }) {
  const raw = await describe({ chat, cast, m, persona, conn, signal });
  const [prompt, cap] = raw.split('\n§');
  if (!prompt?.trim()) throw new Error('The scene couldn’t be described. Try again.');
  // Only the scene: Perchance's own art style and shape pickers set the look, and "no text" style
  // negatives in a prompt tend to draw what they forbid. The writer already describes everyone as adults.
  return { prompt: prompt.trim(), cap: (cap || '').trim() };
}
// The picture the user brought back, kept like a painted one.
export async function keepPicture({ chat, alt = 0, data, prompt, cap, style }) {
  const key = 'pic:' + uid();
  S.images = { ...(S.images || {}), [key]: data };
  await saveImages();
  const place = hereOf(chat);
  const when = clockOn(chat) ? `Day ${chat.clock.day} · ${hhmm(chat.clock.min)}` : '';
  return { id: uid(), key, prompt, caption: [cap || place?.name, when].filter(Boolean).join(' · '), style, at: Date.now(), alt, from: 'perchance' };
}
export const picSrc = (p) => S.images?.[p.key] || '';
export const isDemoPics = (c = picConn()) => c?.provider === 'demo';

// ---------- Scenes: every painted scene is kept in its chat's Scenes, even after its message is gone ----------
// chat.scenes: [{ id, key, prompt, caption, style, at, msgId }], newest last.
export function scenesOf(chat) {
  if (!chat?.messages) return [];
  if (!chat.scenes) {
    // Chats from before Scenes: start from the pictures still in the chat.
    chat.scenes = [];
    for (const m of chat.messages || []) for (const p of m.pics || []) chat.scenes.push({ id: p.id, key: p.key, prompt: p.prompt, caption: p.caption, style: p.style, at: p.at || m.at || 0, msgId: m.id });
  }
  return chat.scenes.filter((x) => S.images?.[x.key]);
}
export function keepScene(chat, rec, m) {
  scenesOf(chat);
  if (!chat.scenes.some((x) => x.key === rec.key)) chat.scenes.push({ id: rec.id, key: rec.key, prompt: rec.prompt, caption: rec.caption, style: rec.style, at: rec.at, msgId: m?.id || null });
}
export const removeScene = (chat, key) => (chat.scenes = (chat.scenes || []).filter((x) => x.key !== key));

// Pictures nothing points to any more (a deleted message or chat) are removed from storage.
export async function gcPictures() {
  const used = new Set();
  for (const c of S.chats.values()) {
    scenesOf(c); // an older chat's scenes count as kept before anything is removed
    if (c.bgPic) used.add(c.bgPic);
    for (const m of c.messages || []) for (const p of m.pics || []) used.add(p.key);
    for (const x of c.scenes || []) used.add(x.key);
  }
  const gone = Object.keys(S.images || {}).filter((k) => k.startsWith('pic:') && !used.has(k));
  if (!gone.length) return 0;
  for (const k of gone) delete S.images[k];
  await saveImages();
  return gone.length;
}
export function picStats() {
  const keys = Object.keys(S.images || {}).filter((k) => k.startsWith('pic:'));
  return { n: keys.length, bytes: keys.reduce((a, k) => a + (S.images[k]?.length || 0), 0) };
}
// Delete every scene picture (Connections › Pictures).
export async function clearPictures(saveChatFn) {
  for (const c of S.chats.values()) {
    let touched = !!c.bgPic || !!c.scenes?.length;
    c.bgPic = null;
    c.scenes = [];
    for (const m of c.messages || []) if (m.pics?.length) (m.pics = []), (touched = true);
    if (touched) await saveChatFn(c);
  }
  return gcPictures();
}
export const altOf = (p) => (p.prompt || 'A painted scene').split(/(?<=[.!?])\s/)[0].slice(0, 120);
