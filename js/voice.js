// Voice mode: speech recognition (talk instead of typing) and per-character voices, using the
// phone's own speech engines (free, nothing leaves the device except what you send to the AI).
import { S } from './store.js';
import { ttsSupported, voices } from './tts.js';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const sttSupported = !!SR;

// Listen once. Interim words stream to onInterim; the final text to onFinal. Stops by itself after
// `silenceMs` without speech. Returns { stop(sendNow) }.
export function listen({ onInterim, onFinal, onEnd, onError, silenceMs = 8000 }) {
  const r = new SR();
  r.lang = navigator.language || 'en-US';
  r.interimResults = true;
  // Android Chrome repeats words in continuous mode: listen in one go there.
  r.continuous = !/Android/i.test(navigator.userAgent);
  r.maxAlternatives = 1;
  let text = '';
  const finals = [];
  let done = false;
  let silence = setTimeout(() => r.stop(), silenceMs);
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(silence);
    onFinal?.(text.trim());
    onEnd?.();
  };
  r.onresult = (e) => {
    clearTimeout(silence);
    silence = setTimeout(() => r.stop(), Math.min(silenceMs, 2200)); // a pause after speaking ends the turn
    // Finished phrases are kept by position, so a repeated result can't double them.
    let mid = '';
    for (let i = e.resultIndex || 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finals[i] = e.results[i][0].transcript.trim();
      else mid += e.results[i][0].transcript;
    }
    text = [...finals.filter(Boolean), mid.trim()].filter(Boolean).join(' ');
    onInterim?.(text.trim());
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    done = true;
    clearTimeout(silence);
    onError?.(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'blocked' : e.error || 'error');
  };
  r.onend = finish;
  try {
    r.start();
  } catch (e) {
    done = true;
    onError?.('start');
  }
  return {
    stop: () => {
      clearTimeout(silence);
      try {
        r.stop();
      } catch {}
    },
    abort: () => {
      done = true;
      clearTimeout(silence);
      try {
        r.abort();
      } catch {}
    },
  };
}

// ---------- voices ----------
export const voiceOf = (who) => ({ uri: '', pitch: 1, rate: 1, ...(who?.voice || {}) });
const pickVoice = (uri) => voices().find((x) => x.voiceURI === uri) || voices().find((x) => x.voiceURI === S.settings.voiceURI) || null;
export const voiceMissing = (who) => !!who?.voice?.uri && ttsSupported && voices().length > 0 && !voices().some((x) => x.voiceURI === who.voice.uri);

// Speak parts in order: [{ text, who, narr }]. Narration keeps its words (only the *marks* go);
// a character's part skips *actions* so their voice says only what they say.
let queue = null;
export function speakParts(parts, { onPart, onEnd } = {}) {
  if (!ttsSupported) return false;
  speechSynthesis.cancel();
  const items = parts
    .map((p) => ({ ...p, clean: (p.narr ? p.text.replace(/\*/g, '') : p.text.replace(/\*[^*]*\*/g, ' ')).replace(/[`_]/g, '').replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.clean);
  if (!items.length) return onEnd?.(), false;
  const token = {};
  queue = token;
  let k = 0;
  const next = () => {
    if (queue !== token) return;
    if (k >= items.length) return (queue = null), onEnd?.();
    const p = items[k++];
    const v = voiceOf(p.narr ? null : p.who);
    const u = new SpeechSynthesisUtterance(p.clean);
    const vv = pickVoice(p.narr ? '' : v.uri);
    if (vv) u.voice = vv;
    u.pitch = p.narr ? 1 : v.pitch;
    u.rate = p.narr ? 1 : v.rate;
    u.onend = next;
    u.onerror = next;
    onPart?.(p);
    speechSynthesis.speak(u);
  };
  next();
  return true;
}
export function stopParts() {
  queue = null;
  if (ttsSupported) speechSynthesis.cancel();
}
// A short sample in a voice (the voice picker's Play).
export function preview(text, v) {
  stopParts();
  const u = new SpeechSynthesisUtterance(String(text || 'Hello. This is how I sound.').replace(/\*[^*]*\*/g, ' ').slice(0, 160));
  const vv = pickVoice(v.uri);
  if (vv) u.voice = vv;
  u.pitch = v.pitch;
  u.rate = v.rate;
  speechSynthesis.speak(u);
}
