// Scene pictures: the AI writes what the moment looks like (the characters' looks, the place, the
// time of day) and an image model paints it. Pictures are saved in the app (S.images) and
// attached to the message they show.
import { S, connection, saveImages } from './store.js';
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

export const picPrefs = () => ({ connId: null, model: '', style: 'painterly', ...(S.settings.pictures || {}) });
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
export async function describe({ chat, cast, m, persona, conn, signal }) {
  const you = persona?.name?.trim() || 'the user';
  const place = hereOf(chat);
  const when = clockOn(chat) ? `${partOfDay(chat.clock.min)} (${hhmm(chat.clock.min)}), ${chat.clock.weather}` : '';
  const text = named(textOf(m), cast[0], you, persona).replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 1600);
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') return `${place ? place.name + ', ' : ''}${when ? when + '. ' : ''}${text.replace(/[*"“”]/g, '').split(/(?<=[.!?])\s/)[0].slice(0, 200)}`;
  const looks = cast.map((p) => ({ name: p.name, looks: compileSheet(p).slice(0, 700) }));
  const brief = { characters: looks, user: { name: you, looks: String(persona?.about || '').slice(0, 300) }, place: place ? `${place.name}: ${place.note}` : '', time: when, moment: text };
  const ask =
    'Write a prompt for an illustration of this exact moment. Return {"prompt":"...","caption":"..."}. ' +
    'prompt: 50 to 90 words, present tense, concrete and visual: who is in frame and what they look like (hair, clothes, build, from their sheets), what they are doing, the setting, light and mood. Landscape framing. ' +
    'No names of real artists, no text or lettering in the image. Everyone is an adult. caption: 1 to 4 words naming the place or moment.';
  const out = await helperComplete(conn, 'track', { system: 'You write prompts for an illustrator. Reply with ONE JSON object and nothing else.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 300, temperature: 0.6, signal });
  const j = extractJson(out);
  return String(j.prompt || '').trim() + (j.caption ? `\n§${String(j.caption).trim().slice(0, 40)}` : '');
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
  const url = await generateImage(pc, { model: picModel(pc), prompt: full, signal });
  // Keep the picture even when it can't be shrunk here (a link without CORS): it was already paid for.
  const data = url.startsWith('data:image/svg') ? url : await shrink(url).catch(() => url);
  const key = 'pic:' + uid();
  S.images = { ...(S.images || {}), [key]: data };
  await saveImages();
  const place = hereOf(chat);
  const when = clockOn(chat) ? `Day ${chat.clock.day} · ${hhmm(chat.clock.min)}` : '';
  return { id: uid(), key, prompt, caption: [cap || place?.name, when].filter(Boolean).join(' · '), style, at: Date.now(), alt: m.alt || 0 };
}
export const picSrc = (p) => S.images?.[p.key] || '';
export const isDemoPics = (c = picConn()) => c?.provider === 'demo';

// Pictures nothing points to any more (a deleted message or chat) are removed from storage.
export async function gcPictures() {
  const used = new Set();
  for (const c of S.chats.values()) {
    if (c.bgPic) used.add(c.bgPic);
    for (const m of c.messages || []) for (const p of m.pics || []) used.add(p.key);
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
    let touched = !!c.bgPic;
    c.bgPic = null;
    for (const m of c.messages || []) if (m.pics?.length) (m.pics = []), (touched = true);
    if (touched) await saveChatFn(c);
  }
  return gcPictures();
}
export const altOf = (p) => (p.prompt || 'A painted scene').split(/(?<=[.!?])\s/)[0].slice(0, 120);
