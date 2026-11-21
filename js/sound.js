// Sound: ambience, your own music, and signal sounds. Everything but your music is made here
// with Web Audio (filtered noise and small tones), so there is nothing to download or license.
// - Ambience follows the chat: the weather (in-world time), where the story is (World map, the
//   character's scene) and the time of day. It fades between scenes.
// - Music: an audio file you pick, for a character or for one chat. Kept on this device only.
// - Signal sounds: a soft click when a reply finishes, a two-note chime for a new station, a
//   rising three-note chime for a new chapter. Off by default; vibration optional (Android).
// Speech (read aloud, voice mode) ducks ambience and music while it talks.
import { S } from './store.js';
import * as db from './db.js';
import { clockOn, partOfDay } from './clock.js';
import { hereOf } from './worldmap.js';
import { uid } from './util.js';

export const soundSupported = !!(window.AudioContext || window.webkitAudioContext);
export const soundPrefs = () => ({ amb: false, ambVol: 0.5, music: true, musVol: 0.6, sfx: false, haptics: false, ...(S.settings.sound || {}) });

let ctx = null;
let master, ambBus, musBus, sfxBus;
function ac() {
  if (!soundSupported) return null;
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.connect(ctx.destination);
    ambBus = ctx.createGain();
    musBus = ctx.createGain();
    sfxBus = ctx.createGain();
    for (const b of [ambBus, musBus, sfxBus]) b.connect(master);
    applyVolumes();
    // Speech ducks the beds; a hidden page goes quiet.
    setInterval(duck, 300);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else if (cur || music.el) ctx.resume();
    });
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  return ctx;
}
export function applyVolumes() {
  if (!ctx) return;
  const p = soundPrefs();
  const t = ctx.currentTime;
  ambBus.gain.setTargetAtTime(p.amb ? p.ambVol * 0.9 : 0, t, 0.25);
  musBus.gain.setTargetAtTime(p.music ? p.musVol : 0, t, 0.25);
  sfxBus.gain.setTargetAtTime(0.5, t, 0.05);
}
let ducked = false;
function duck() {
  const on = 'speechSynthesis' in window && speechSynthesis.speaking;
  if (on === ducked || !ctx) return;
  ducked = on;
  master.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.3);
}

// ---------- building blocks ----------
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.loopStart = Math.random();
  s.start(0, Math.random() * 2);
  return s;
}
function mk(type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}
const gainN = (v) => {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
};
const chain = (...n) => (n.reduce((a, b) => (a.connect(b), b)), n[n.length - 1]);
// A slow wobble on a parameter (waves, gusts).
function lfo(param, rate, depth) {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  const g = gainN(depth);
  o.connect(g).connect(param);
  o.start();
  return o;
}
// Something that happens now and then (a drop, a cup, a cricket): fn(time) at random gaps.
function every(min, max, fn) {
  let t = null;
  const tick = () => {
    if (!ctx || ctx.state !== 'running') return (t = setTimeout(tick, 400));
    fn(ctx.currentTime + 0.02);
    t = setTimeout(tick, (min + Math.random() * (max - min)) * 1000);
  };
  t = setTimeout(tick, Math.random() * max * 1000);
  return { stop: () => clearTimeout(t) };
}
function blip(out, t, { freq = 1000, type = 'sine', dur = 0.08, vol = 0.1, to = null }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = gainN(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function burst(out, t, { lo = 1000, hi = 4000, dur = 0.03, vol = 0.1 }) {
  const s = noise();
  const f = mk('bandpass', lo + Math.random() * (hi - lo), 1.2);
  const g = gainN(0);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.stop(t + dur + 0.05);
}

// ---------- layers: each returns { out, stops[] } ----------
const LAYERS = {
  rain(muffled) {
    const out = gainN(1);
    const n = noise();
    chain(n, mk('highpass', 500), mk('lowpass', muffled ? 900 : 5200), gainN(muffled ? 0.32 : 0.22), out);
    const drops = every(0.03, 0.16, (t) => burst(out, t, { lo: muffled ? 600 : 1800, hi: muffled ? 1200 : 5200, dur: 0.02 + Math.random() * 0.03, vol: muffled ? 0.05 : 0.08 }));
    return { out, stops: [n, drops] };
  },
  storm(muffled) {
    const r = LAYERS.rain(muffled);
    const thunder = every(14, 30, (t) => {
      const s = noise();
      const g = gainN(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      chain(s, mk('lowpass', 140), g, r.out);
      s.stop(t + 5);
    });
    return { out: r.out, stops: [...r.stops, thunder] };
  },
  wind(soft) {
    const out = gainN(1);
    const n = noise();
    const f = mk('bandpass', 500, 0.9);
    const g = gainN(soft ? 0.1 : 0.16);
    chain(n, mk('lowpass', 1400), f, g, out);
    const a = lfo(f.frequency, 0.07, 260);
    const b = lfo(g.gain, 0.05, soft ? 0.05 : 0.08);
    return { out, stops: [n, a, b] };
  },
  murmur() {
    // A room full of people: low voices, the odd cup.
    const out = gainN(1);
    const n = noise();
    const f = mk('bandpass', 420, 0.6);
    chain(n, mk('lowpass', 900), f, gainN(0.2), out);
    const w = lfo(f.frequency, 0.3, 90);
    const cups = every(1.8, 6, (t) => blip(out, t, { freq: 2600 + Math.random() * 1600, dur: 0.18, vol: 0.025, type: 'triangle' }));
    return { out, stops: [n, w, cups] };
  },
  street() {
    const out = gainN(1);
    const n = noise();
    chain(n, mk('lowpass', 220), gainN(0.35), out);
    const pass = every(5, 12, (t) => {
      const s = noise();
      const f = mk('bandpass', 300, 1);
      f.frequency.setValueAtTime(260, t);
      f.frequency.exponentialRampToValueAtTime(900, t + 1.6);
      f.frequency.exponentialRampToValueAtTime(240, t + 3.2);
      const g = gainN(0);
      g.gain.linearRampToValueAtTime(0.12, t + 1.6);
      g.gain.linearRampToValueAtTime(0, t + 3.4);
      chain(s, f, g, out);
      s.stop(t + 3.6);
    });
    return { out, stops: [n, pass] };
  },
  sea() {
    const out = gainN(1);
    const n = noise();
    const g = gainN(0.12);
    chain(n, mk('lowpass', 1100), g, out);
    const w = lfo(g.gain, 0.09, 0.1);
    return { out, stops: [n, w] };
  },
  crickets() {
    const out = gainN(1);
    const c = every(0.6, 2.4, (t) => {
      const f = 4200 + Math.random() * 900;
      for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) blip(out, t + k * 0.06, { freq: f, dur: 0.035, vol: 0.018 });
    });
    return { out, stops: [c] };
  },
  birds() {
    const out = gainN(1);
    const b = every(2, 7, (t) => {
      const f = 2200 + Math.random() * 1800;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) blip(out, t + k * 0.13, { freq: f, to: f * (1.2 + Math.random() * 0.4), dur: 0.09, vol: 0.022 });
    });
    return { out, stops: [b] };
  },
  fire() {
    const out = gainN(1);
    const n = noise();
    chain(n, mk('lowpass', 420), gainN(0.16), out);
    const pops = every(0.08, 0.6, (t) => burst(out, t, { lo: 900, hi: 3500, dur: 0.012, vol: 0.06 + Math.random() * 0.06 }));
    return { out, stops: [n, pops] };
  },
  room() {
    const out = gainN(1);
    const n = noise();
    chain(n, mk('lowpass', 260), gainN(0.09), out);
    return { out, stops: [n] };
  },
};

// ---------- what this chat sounds like ----------
// A fixed sound for one chat (Sound sheet chips), instead of Auto.
export const AMB_PRESETS = {
  rain: { label: 'Rain', layers: [['street'], ['rain', false]] },
  cafe: { label: 'Café', layers: [['murmur']] },
  street: { label: 'Street', layers: [['street'], ['wind', true]] },
  sea: { label: 'Sea', layers: [['sea'], ['wind', true]] },
  night: { label: 'Night', layers: [['wind', true], ['crickets']] },
  fire: { label: 'Fire', layers: [['fire'], ['room']] },
  room: { label: 'Quiet room', layers: [['room']] },
};
const has = (s, re) => re.test(s);
export function ambienceFor(chat, ch) {
  const fixed = AMB_PRESETS[chat?.amb];
  if (fixed) return { key: 'preset:' + chat.amb, label: fixed.label, layers: fixed.layers };
  const place = hereOf(chat);
  const words = `${place?.name || ''} ${place?.note || ''}`.toLowerCase();
  const sceneKey = place?.scene || ch?.scene || '';
  let base = '';
  if (has(words, /caf[eé]|coffee|bar\b|pub|tavern|inn\b|restaurant|diner|bakery|canteen|club/)) base = 'cafe';
  else if (has(words, /beach|sea\b|shore|coast|harbou?r|dock|pier|ocean|lake|river|boat|ship/)) base = 'sea';
  else if (has(words, /fire|hearth|camp|cabin|lodge|forge/)) base = 'fire';
  else if (has(words, /forest|wood|garden|park|field|meadow|mountain|trail|grove|countryside|village/)) base = 'forest';
  else if (has(words, /street|city|road|alley|station|platform|downtown|square|market|bridge|plaza|town/)) base = 'street';
  else if (has(words, /room|home|apartment|flat|house|bedroom|office|library|hall|castle|kitchen|study|shop|inside|indoors/)) base = 'room';
  else if (sceneKey === 'none') return { key: 'quiet', label: 'Quiet', layers: [] }; // Window › Sounds like › Quiet
  else base = { cafe: 'cafe', rain: 'street', night: 'forest', sakura: 'forest', room: 'room' }[sceneKey] || 'room';
  const indoor = base === 'cafe' || base === 'room' || base === 'fire';
  const weather = clockOn(chat) ? chat.clock.weather : sceneKey === 'rain' ? 'rain' : 'clear';
  const night = clockOn(chat) ? /night|late/i.test(partOfDay(chat.clock.min)) : sceneKey === 'night';
  const layers = [];
  const add = (k, arg) => layers.push([k, arg]);
  if (base === 'cafe') add('murmur');
  if (base === 'street') add('street');
  if (base === 'sea') add('sea');
  if (base === 'fire') add('fire'), add('room');
  if (base === 'room') add('room');
  if (weather === 'rain' || weather === 'storm') add(weather, indoor);
  else if (weather === 'snow' || weather === 'fog') add('wind', true);
  else if (!indoor && base !== 'street') add('wind', true);
  if (!indoor && night && weather !== 'rain' && weather !== 'storm' && weather !== 'snow') add('crickets');
  if (!indoor && !night && (base === 'forest') && weather === 'clear') add('birds');
  const label = [
    { rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog' }[weather],
    { cafe: 'Café', street: 'Street', sea: 'Sea', fire: 'Fireside', forest: night ? 'Night' : 'Outdoors', room: 'Room' }[base],
  ]
    .filter(Boolean)
    .join(' · ');
  return { key: layers.map((l) => l.join(':')).join('+'), label, layers };
}

// ---------- ambience: one bed at a time, crossfaded ----------
let cur = null; // { key, label, gain, stops }
function stopBed(bed, fade = 1.2) {
  if (!bed) return;
  const t = ctx.currentTime;
  bed.gain.gain.cancelScheduledValues(t);
  bed.gain.gain.setTargetAtTime(0, t, fade / 3);
  setTimeout(() => {
    for (const s of bed.stops) s.stop ? s.stop() : null;
    bed.gain.disconnect();
  }, fade * 1000 + 300);
}
export function setAmbience(spec) {
  if (!soundPrefs().amb || !spec?.layers?.length) return stopAmbience();
  if (!ac()) return;
  if (cur?.key === spec.key) return;
  stopBed(cur);
  const g = gainN(0);
  g.connect(ambBus);
  const stops = [];
  for (const [k, arg] of spec.layers) {
    const l = LAYERS[k]?.(arg);
    if (!l) continue;
    l.out.connect(g);
    stops.push(...l.stops);
  }
  g.gain.setTargetAtTime(1, ctx.currentTime, 0.7);
  cur = { key: spec.key, label: spec.label, gain: g, stops };
}
export function stopAmbience() {
  if (ctx && cur) stopBed(cur);
  cur = null;
}
export const ambienceNow = () => cur?.label || '';

// ---------- music: your own file, for a character or a chat ----------
const music = { el: null, key: '', node: null, url: '' };
export async function saveMusic(file) {
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(file.name)) throw new Error('That isn’t an audio file.');
  if (file.size > 40e6) throw new Error('That file is over 40 MB. Pick a shorter one.');
  const key = 'music:' + uid();
  await db.set(key, file);
  return { key, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) };
}
export const removeMusic = (key) => key && db.del(key);
// Which music plays here: the chat's own pick, else the character's.
export const musicFor = (chat, ch) => (chat?.music?.off ? null : chat?.music?.key ? chat.music : ch?.music?.key ? ch.music : null);
export async function playMusic(m) {
  if (!m?.key || !soundPrefs().music) return stopMusic();
  if (music.key === m.key && music.el) return;
  stopMusic(0.6);
  const blob = await db.get(m.key).catch(() => null);
  if (!blob || !ac()) return;
  const el = new Audio();
  el.loop = true;
  el.src = music.url = URL.createObjectURL(blob);
  const node = ctx.createMediaElementSource(el);
  const g = gainN(0);
  node.connect(g).connect(musBus);
  g.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  Object.assign(music, { el, key: m.key, node: g });
  el.play().catch(() => {});
}
export function stopMusic(fade = 1) {
  if (!music.el) return;
  const { el, node, url } = music;
  Object.assign(music, { el: null, key: '', node: null, url: '' });
  node.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
  setTimeout(() => (el.pause(), node.disconnect(), URL.revokeObjectURL(url)), fade * 1000 + 300);
}
export const musicPlaying = () => !!music.el;

// Everything for a chat (on opening it, or when its scene changes) and nothing when you leave.
export function chatSound(chat, ch) {
  setAmbience(ambienceFor(chat, ch));
  playMusic(musicFor(chat, ch));
}
export function silence() {
  stopAmbience();
  stopMusic();
}

// ---------- signal sounds and haptics ----------
const BUZZ = { reply: [10], station: [18, 60, 18], chapter: [24, 50, 24, 50, 40] };
export function signal(kind) {
  const p = soundPrefs();
  if (p.haptics && navigator.vibrate) navigator.vibrate(BUZZ[kind] || [10]);
  if (!p.sfx || !ac()) return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'reply') blip(sfxBus, t, { freq: 1500, dur: 0.05, vol: 0.12, type: 'triangle' });
  else if (kind === 'station') {
    // The two-note platform chime.
    blip(sfxBus, t, { freq: 659, dur: 0.7, vol: 0.18, type: 'triangle' });
    blip(sfxBus, t + 0.28, { freq: 880, dur: 0.9, vol: 0.18, type: 'triangle' });
  } else if (kind === 'chapter') {
    [523, 659, 784].forEach((f, k) => blip(sfxBus, t + k * 0.16, { freq: f, dur: 0.9, vol: 0.15, type: 'triangle' }));
    burst(sfxBus, t + 0.5, { lo: 1500, hi: 3000, dur: 0.25, vol: 0.05 });
  }
}
export function preview(kind) {
  ac();
  signal(kind);
}
