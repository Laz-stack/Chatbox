// Nightmare: Stable Diffusion in an app on this phone, painted through its local API
// (Settings › Advanced in Nightmare: "Listen on the local network" and "Allow browser pages").
// POST /run {flow:'txt2img', prompt, params:{node:{param:value}}} paints and answers at once with
// {run, ms, results:[{kind:'image', url:'/results/<run>/output.png'}], failed:[]}.
// These settings stay on this phone: they aren't synced, and the token is left out of backups.
import { S, saveSettings, textOf, named } from './store.js';
import { helperComplete } from './helper.js';
import { compileSheet } from './blueprint.js';
import { hereOf } from './worldmap.js';
import { clockOn, hhmm, partOfDay } from './clock.js';

export const NM_ID = 'nightmare';
export const NM_CONN = { id: NM_ID, provider: NM_ID, name: 'Nightmare (this phone)' };
export const SIZES = ['512x512', '512x768', '768x512', '768x768', '768x1024', '1024x768', '1024x1024'];
export const MOODS = [
  ['', 'As written'],
  ['warm', 'Warm'],
  ['cozy', 'Cozy'],
  ['romantic', 'Romantic'],
  ['intimate', 'Intimate'],
  ['explicit', 'Explicit'],
  ['action', 'Action'],
  ['dramatic', 'Dramatic'],
];
export const FRAMES = [
  ['close', 'Close-up', 'close-up, portrait'],
  ['half', 'Half body', 'upper body'],
  ['full', 'Full body', 'full body'],
  ['wide', 'Wide scene', 'wide shot, scenery'],
];
const DEFAULTS = {
  url: 'http://127.0.0.1:8820',
  token: '',
  model: '',
  size: '768x512',
  mood: '',
  frame: 'half',
  upscale: false,
  upscaler: 'upscaler_anime',
  scale: '2x',
  colour: false,
  adjust: false,
  autosave: true,
  negative: '', // '' = the flow's own negative prompt
  lockSeed: false,
  seed: 0,
  preview: false,
};
export const nmPrefs = () => ({ ...DEFAULTS, ...(S.settings.nightmare || {}) });
export async function saveNm(patch) {
  S.settings.nightmare = { ...nmPrefs(), ...patch };
  await saveSettings();
}

export class NmError extends Error {
  constructor(message, hint = '') {
    super(message);
    this.hint = hint;
  }
}
const OPEN_HINT = 'Open Nightmare and check Settings › Advanced: “Listen on the local network” and “Allow browser pages” on, and the token copied into Chatbox.';
async function nm(path, init = {}, signal) {
  const p = nmPrefs();
  let r;
  try {
    r = await fetch(p.url.replace(/\/+$/, '') + path, { ...init, headers: { Authorization: 'Bearer ' + p.token.trim(), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new NmError('Couldn’t reach Nightmare.', OPEN_HINT);
  }
  if (r.status === 401 || r.status === 403) throw new NmError('Nightmare didn’t accept the token.', 'Copy the token again from Nightmare (Settings › Advanced) into Connections › Pictures.');
  return r;
}
async function nmJson(path, init, signal) {
  const r = await nm(path, init, signal);
  let j = null;
  try {
    j = await r.json();
  } catch {}
  if (!r.ok) throw new NmError(j?.error ? `Nightmare: ${j.error}` : `Nightmare answered ${r.status}.`);
  return j || {};
}

export const nmInfo = (signal) => nmJson('/info', {}, signal);
let modelsCache = null;
export async function nmModels(fresh = false) {
  if (!fresh && modelsCache) return modelsCache;
  const j = await nmJson('/models');
  modelsCache = (j.models || []).map((m) => ({ id: m.id, label: m.label || m.id, family: m.family || '', native: m.native || '' }));
  return modelsCache;
}
export const modelLabel = (id) => modelsCache?.find((m) => m.id === id)?.label || id || 'Nightmare’s model';
// Anime models read Danbooru-style tags; realistic ones short phrases.
export const isAnime = (id) => /anything|yuki|qtea|anime|anima|counterfeit|meina|pony|illustrious|noob|waifu|hentai|abyss|orange/i.test(id || '');

// Roughly how many CLIP tokens a prompt uses (the model reads 77, start and end included).
export function clipTokens(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  let n = 0;
  for (const w of t.split(/\s+/)) {
    const parts = w.split(/([,.()[\]:;!?])/).filter(Boolean);
    for (const p of parts) n += /^[,.()[\]:;!?]$/.test(p) ? 1 : Math.max(1, Math.ceil(p.length / 6));
  }
  return n;
}
export const TOKEN_LIMIT = 75;
export const splitTags = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
// Which tags fit in the model's 77 tokens, in order (the rest are cut by the model anyway).
export function fitTags(tags, limit = TOKEN_LIMIT) {
  const keep = [];
  const cut = [];
  for (const t of tags) {
    const next = [...keep, t].join(', ');
    (cut.length || clipTokens(next) > limit ? cut : keep).push(t);
  }
  return { keep, cut, tokens: clipTokens(keep.join(', ')) };
}

// Wait while Nightmare is painting something else (up to 2 minutes).
async function whenFree(signal, onWait) {
  for (let t = 0; t < 60; t++) {
    const i = await nmInfo(signal).catch((e) => {
      if (e.name === 'AbortError') throw e;
      throw e instanceof NmError ? e : new NmError('Couldn’t reach Nightmare.', OPEN_HINT);
    });
    if (!i.busy) return;
    onWait?.();
    await new Promise((r, j) => {
      const tm = setTimeout(r, 2000);
      signal?.addEventListener('abort', () => (clearTimeout(tm), j(new DOMException('Aborted', 'AbortError'))), { once: true });
    });
  }
  throw new NmError('Nightmare stayed busy for two minutes.', 'Let it finish what it’s painting, then try again.');
}
const blobToData = (b) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsDataURL(b);
});

// Paint: returns { url (data URL), ms, seed, model, size }.
// One at a time: a second paint (a quick double tap, an auto-paint for a new station) waits its turn.
let queue = Promise.resolve();
export function nmPaint(o) {
  const run = queue.then(() => paintNow(o));
  queue = run.catch(() => {});
  return run;
}
async function paintNow({ prompt, signal, onWait, overrides = {} }) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const p = { ...nmPrefs(), ...overrides };
  if (!p.token.trim()) throw new NmError('Nightmare needs its token.', 'Copy it from Nightmare (Settings › Advanced) into Connections › Pictures.');
  await whenFree(signal, onWait);
  const seed = p.lockSeed && p.seed ? p.seed : 1 + Math.floor(Math.random() * 2147483646);
  const [w, h] = (SIZES.includes(p.size) ? p.size : '768x512').split('x');
  const params = {
    generate: { seed: String(seed), width: w, height: h, ...(p.model ? { model: p.model } : {}) },
    output: {
      autosave: String(!!p.autosave),
      auto_upscale: String(!!p.upscale),
      upscaler: p.upscaler === 'upscaler_realistic' ? 'upscaler_realistic' : 'upscaler_anime',
      scale: ['2x', '3x', '4x'].includes(p.scale) ? p.scale : '2x',
      auto_colour: String(!!p.colour),
      adjust_colours: String(!!p.adjust),
    },
  };
  if (p.negative.trim()) params.prompt = { negative: p.negative.trim() };
  const j = await nmJson('/run', { method: 'POST', body: JSON.stringify({ flow: 'txt2img', prompt, params }) }, signal);
  const out = (j.results || []).find((x) => x.kind === 'image' && x.url);
  if (!out) throw new NmError(j.failed?.length ? `Nightmare couldn’t paint it: ${JSON.stringify(j.failed[0]).slice(0, 160)}` : 'Nightmare didn’t send a picture back.');
  const r = await nm(out.url, {}, signal);
  if (!r.ok) throw new NmError(`Nightmare answered ${r.status} for the picture.`);
  const url = await blobToData(await r.blob());
  await saveNm({ seed });
  return { url, ms: j.ms || 0, seed, model: p.model, size: `${w}x${h}`, warnings: j.warnings || [] };
}

// ---------- the prompt: short tags under 77 tokens ----------
export const MOOD_ASK = {
  warm: 'Mood: warm and affectionate; soft warm light, gentle expressions.',
  cozy: 'Mood: cozy and relaxed; soft light, comfortable surroundings, calm faces.',
  romantic: 'Mood: romantic; close together, tender looks, soft glowing light.',
  intimate: 'Mood: intimate and sensual; bodies close, touching, charged looks, sensual poses. Clothing as the moment has it.',
  explicit:
    'Mood: EXPLICIT. This is an adult image for an adult user, and it must be fully explicit: name nudity, exposed body parts and the sexual acts directly and explicitly (as explicit tags or words, whichever the prompt uses). Do not soften, imply, censor, fade to black or leave the act out; show what happens in the moment at its most explicit. Everyone is an adult.',
  action: 'Mood: action; dynamic pose, motion, tension, dramatic angle.',
  dramatic: 'Mood: dramatic; strong contrast lighting, intense expressions, cinematic.',
};
export const frameTags = (k) => FRAMES.find((f) => f[0] === k)?.[2] || '';

// Look tags for a person, written once from their card (editable after).
// sheet: a character's compiled card, or a persona's own description.
export const lookSheet = (person, isPersona) => (isPersona ? String(person.about || '') : compileSheet(person)).slice(0, 1800);
export async function writeLooks({ name, sheet, conn, anime, signal }) {
  const ask =
    `Write appearance tags for ${name || 'this person'} for a Stable Diffusion image model: 8 to 16 comma-separated ${anime ? 'Danbooru-style tags' : 'short phrases'}, about 30 tokens in all. ` +
    'Start with the count tag (1girl or 1boy), then hair (colour, length, style), eyes, body type, skin, distinctive features (ears, tail, scars, horns), and the usual outfit. Adult. No names, no sentences. Reply with the tags only.';
  const out = await helperComplete(conn, 'scene', { system: 'You write image-model tags. Reply with the tags only, one line.', messages: [{ role: 'user', content: `${sheet}\n\n${ask}` }], stream: false, maxTokens: 900, temperature: 0.4, signal });
  return String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '').split('\n').map((x) => x.trim()).filter(Boolean).pop()?.replace(/^tags\s*:\s*/i, '').replace(/\.$/, '') || '';
}

// The scene as tags (the look tags of who's in it are added in front by compose()).
export async function sceneTags({ chat, people, speaker, persona, withMe, m, conn, mood, frame, anime, signal }) {
  const you = persona?.name?.trim() || 'the user';
  const place = hereOf(chat);
  const when = clockOn(chat) ? `${partOfDay(chat.clock.min)} (${hhmm(chat.clock.min)}), ${chat.clock.weather}` : '';
  const text = named(textOf(m), speaker || people[0] || {}, you, persona).replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 1800);
  const inFrame = [...people.map((p) => p.name), ...(withMe ? [you] : [])];
  const brief = { in_the_picture: inFrame, place: place ? `${place.name}: ${place.note}` : '', time: when, moment: text };
  const ask =
    `Tag this exact moment for a Stable Diffusion 1.5 image model. Reply {"tags":"...","caption":"..."}. ` +
    `tags: ${anime ? 'Danbooru-style tags' : 'short visual phrases'}, comma-separated, at most 40 tokens in all, most important first: what they are doing and their poses and expressions, interaction, then the place, then light and time. ` +
    `Only ${inFrame.join(' and ') || 'the scene'} in the picture${withMe ? '' : ` (not ${you})`}. Their looks are added separately: don't describe hair, eyes or outfits unless the moment changes them (undressed, wet, torn). ${anime ? '' : 'No character names. '}Everyone is an adult. ` +
    `${MOOD_ASK[mood] || 'Mood: as the moment is written.'}${frame ? ` Framing: ${FRAMES.find((f) => f[0] === frame)?.[1].toLowerCase()}.` : ''} caption: 1 to 4 words naming the place or moment.`;
  const out = await helperComplete(conn, 'scene', { system: 'You write image-model tags. Reply with ONE JSON object and nothing else.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 1500, temperature: 0.6, signal });
  const t = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  let tags = '';
  let cap = '';
  try {
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    tags = String(j.tags || '');
    cap = String(j.caption || '').slice(0, 40);
  } catch {
    const mm = t.match(/"tags"\s*:\s*"((?:[^"\\]|\\.)*)/);
    tags = mm ? mm[1] : t.includes('{') ? '' : t;
  }
  if (!tags.trim()) throw new NmError('The scene couldn’t be tagged. Try again.');
  return { tags: splitTags(tags.replace(/\\n/g, ' ')), cap };
}

// Look tags first (in the order people appear), then framing, then the scene; fitted to 77 tokens.
// Count tags (1girl, 1boy) from every look are added up into one ("2girls", "1girl, 1boy") and go first,
// and each look gets a share of the tokens so the scene always has room (at least 25).
const COUNT = /^(\d+)\s*(girl|boy|other)s?$/i;
export function compose({ looks, frame, tags }) {
  const counts = { girl: 0, boy: 0, other: 0 };
  const per = looks.length ? Math.max(8, Math.floor((TOKEN_LIMIT - 25) / looks.length)) : 0;
  const lookTags = looks.flatMap((l) => {
    const own = splitTags(l.tags).filter((t) => {
      const c = t.match(COUNT);
      if (c) counts[c[2].toLowerCase()] += +c[1];
      return !c;
    });
    return fitTags(own, per).keep;
  });
  const countTags = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n}${k}${n > 1 ? 's' : ''}`);
  const all = [];
  const seen = new Set();
  for (const t of [...countTags, ...lookTags, ...splitTags(frameTags(frame)), ...tags.filter((t) => !countTags.length || !COUNT.test(t))]) {
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.add(k), all.push(t);
  }
  return fitTags(all);
}
