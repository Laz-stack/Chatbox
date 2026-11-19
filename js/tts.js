// Read-aloud with the browser's own speech voices. Actions in *asterisks* are skipped.
import { S } from './store.js';

export const ttsSupported = 'speechSynthesis' in window;

export function voices() {
  return ttsSupported ? speechSynthesis.getVoices() : [];
}

export function speak(text, onEnd) {
  if (!ttsSupported) return false;
  speechSynthesis.cancel();
  const clean = (text || '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  const u = new SpeechSynthesisUtterance(clean);
  const v = voices().find((x) => x.voiceURI === S.settings.voiceURI);
  if (v) u.voice = v;
  u.rate = 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (ttsSupported) speechSynthesis.cancel();
}
