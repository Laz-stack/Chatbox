// Small shared helpers. No dependencies.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rough token estimate (about 4 characters per token for English prose).
export const estimateTokens = (s) => Math.ceil((s || '').length / 3.8);

export const fmtNum = (n) => {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
};

export function ago(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return Math.floor(s / 604800) + 'w';
}

export const agoLong = (t) => (ago(t) === 'now' ? 'just now' : ago(t) + ' ago');

export function debounce(fn, ms = 400) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

export const fileToDataURL = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Departure-board time: "21:04" today, "Tue" this week, else "12 Nov".
export function boardTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Element.animate that does nothing (but still resolves) when the user asks for reduced motion.
export function motion(el, frames, opts) {
  if (!el || reducedMotion()) return { finished: Promise.resolve() };
  return el.animate(frames, opts);
}
export const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';

// Roleplay formatting: *actions* in italics, line breaks kept.
// Pictures inside messages resolve through this (the store maps a web address to its saved copy).
let imageFor = (url) => url;
export const setImageResolver = (fn) => (imageFor = fn);
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function formatMessage(text) {
  return esc(tidyStars(text))
    .replace(/!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, alt, url) => `<img class="msg-img" src="${esc(imageFor(unesc(url)))}" alt="${alt.replace(/&quot;|“|”/g, '')}" loading="lazy" decoding="async">`)
    .replace(/(^|\n)\s*(?:-{3,}|\*{3,}|_{3,})\s*(?=\n|$)/g, '$1<hr class="msg-brk" aria-label="Scene break">')
    .replace(/&quot;([^\n<>]+?)&quot;/g, '<span class="say">&quot;$1&quot;</span>')
    .replace(/“([^”\n<>]+)”/g, '<span class="say">“$1”</span>')
    .replace(/`([^`\n]+)`/g, '<b class="shout">$1</b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b class="dlg">$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<span class="act">$1</span>')
    .replace(/\n[ \t]*\n\s*/g, '<span class="pg" aria-hidden="true"></span>')
    .replace(/\n/g, '<br>')
    .replace(/<br>(<hr class="msg-brk"[^>]*>)<br>/g, '$1')
    .replace(/(<img class="msg-img"[^>]*>)<br>/g, '$1');
}

// Display only: prose the model left unmarked is shown as an *action*, so narration, actions and
// thoughts look the same whether or not the model used asterisks. Speech in quotes stays as it is.
// "***x***" (bold italic) reads as bold; longer runs of stars collapse to two.
// Lines that are only stars (*** scene breaks) are left alone.
const tidyStars = (t) => (t || '').replace(/\*{3,}([^*\n]+?)\*{3,}/g, '**$1**').replace(/(^|[^*\n])\*{3,}(?=[^*\s])/g, '$1**').replace(/([^*\s])\*{3,}(?=\s|$)/g, '$1**');
export function markProse(text) {
  return tidyStars(text)
    .split('\n')
    .map((line) => {
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return line;
      let out = '';
      let buf = '';
      const flush = () => {
        if (/[\p{L}\p{N}]/u.test(buf)) {
          const m = buf.match(/^(\s*)([\s\S]*?)(\s*)$/);
          out += `${m[1]}*${m[2]}*${m[3]}`;
        } else out += buf;
        buf = '';
      };
      for (let i = 0; i < line.length; ) {
        const c = line[i];
        const pic = line.startsWith('![', i) && line.slice(i).match(/^!\[[^\]]*\]\([^)\s]+\)/);
        if (pic) {
          flush();
          out += pic[0];
          i += pic[0].length;
          continue;
        }
        if (line.startsWith('**', i)) {
          flush();
          const j = line.indexOf('**', i + 2);
          const end = j < 0 ? line.length : j + 2;
          out += line.slice(i, end) + (j < 0 ? '**' : '');
          i = end;
          continue;
        }
        if (c === '`') {
          flush();
          const j = line.indexOf('`', i + 1);
          const end = j < 0 ? line.length : j + 1;
          out += line.slice(i, end) + (j < 0 ? '`' : '');
          i = end;
          continue;
        }
        if (c === '*' || c === '"' || c === '“') {
          flush();
          const close = c === '“' ? '”' : c;
          const j = line.indexOf(close, i + 1);
          const end = j < 0 ? line.length : j + 1;
          out += line.slice(i, end) + (j < 0 && c === '*' ? '*' : '');
          i = end;
        } else buf += line[i++];
      }
      flush();
      return out;
    })
    .join('\n');
}

// A tagline without the character's name repeated in front. Only two clear cases are cleaned:
// the full name then punctuation ("Mirelle Sorn, Cinder faculty student"), or the first name and a few
// name words then a new sentence starting with a pronoun ("Cressida val Ardeny Her magic…").
// Anything else ("Max Power Ranger", "Vespera is a witch") is left as written.
const PARTICLES = /^(val|van|von|de|del|della|der|di|da|du|le|la|bin)$/i;
const PRONOUNS = /^(Her|His|She|He|They|Their|It|Its|I|My|You|Your)$/;
export function cleanTagline(text, name) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  const full = (name || '').replace(/\s+/g, ' ').trim();
  const first = full.split(' ')[0];
  if (full && t.toLowerCase().startsWith(full.toLowerCase()) && /^\s*[,:;–—-]\s*\S/.test(t.slice(full.length))) {
    t = t.slice(full.length).replace(/^\s*[,:;–—-]\s*/, '');
  } else if (first && t.toLowerCase().startsWith(first.toLowerCase() + ' ')) {
    const w = t.split(' ');
    for (let k = 1; k < Math.min(w.length, 6); k++) {
      if (PRONOUNS.test(w[k])) {
        t = w.slice(k).join(' ');
        break;
      }
      if (!(PARTICLES.test(w[k]) || /^\p{Lu}/u.test(w[k]))) break;
    }
  }
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}
export const plain = (text) => (text || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

export function slug(s) {
  return (s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
}

// Colour helpers
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Text colour that reads on a given background.
export const inkOn = (bg) => (luminance(bg) > 0.22 ? '#0A0A0A' : '#FFFFFF');
// Accent for small marks (caret, status dot, face ring) drawn on the cream bubble or the black ground:
// the character's own line colour, a darker shade of it when it is too pale to see against cream
// (never red: red means an action).
export function lineAccent(c) {
  if (!c || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) return '#9B9B9B';
  if (luminance(c) < 0.45) return c;
  let s = c;
  for (let k = 1; k < 10 && luminance(s) >= 0.3; k++) s = shade(c, -0.1 * k);
  return s;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hashStr(String(seed));
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shrink an uploaded image so the browser database stays small.
// area: cap the picture's size by its area, not its long side, so a tall card (a long strip) keeps
// enough width to look sharp; the long side is still capped at 4x max.
export async function resizeImage(file, max = 512, { area = false } = {}) {
  const url = await fileToDataURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const s = area ? Math.min(1, max / Math.sqrt(img.width * img.height), (max * 4) / Math.max(img.width, img.height)) : Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.88);
}

export function copyText(t) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t);
  const ta = document.createElement('textarea');
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {}
  ta.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('Copy isn’t allowed here.'));
}

// Guess an avatar expression from the reply's wording.
export function detectMood(t) {
  const s = (t || '').toLowerCase();
  if (/\b(yawn|yawns|sleepy|drowsy|tired|nods? off|zzz)\b/.test(s)) return 'sleepy';
  if (/\b(blush|blushes|flustered|stammer|stammers|embarrass\w*|shy|fidget\w*|looks away)\b|\bu-?um\b/.test(s)) return 'flustered';
  if (/\b(gasp\w*|grin\w*|beam\w*|laugh\w*|cheer\w*|yay|excited|eyes light|bounces?|squeal\w*)\b|!{2,}/.test(s)) return 'excited';
  return 'happy';
}
