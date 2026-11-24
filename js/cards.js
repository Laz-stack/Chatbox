// Character card import/export.
import { compileSheet } from './blueprint.js';
// Reads Tavern-style cards (V1/V2/V3 JSON, or PNG with a "chara"/"ccv3" text chunk)
// and writes V2 cards as JSON or as a PNG with the card embedded.
import { blankCharacter, LINE_COLORS, S } from './store.js';
import { resizeImage, originalImage, cleanTagline } from './util.js';
import { faceDataURL } from './avatar.js';
import { cleanCharacter } from './safe.js';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const b64FromBytes = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const utf8b64 = (str) => b64FromBytes(new TextEncoder().encode(str));
export const b64utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)));

export function pngTextChunks(buf) {
  const v = new DataView(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (v.getUint8(i) !== sig[i]) throw new Error('Not a PNG file.');
  const out = {};
  let p = 8;
  const dec = new TextDecoder('latin1');
  while (p + 8 <= buf.byteLength) {
    const len = v.getUint32(p);
    const type = dec.decode(new Uint8Array(buf, p + 4, 4));
    if (type === 'tEXt') {
      const data = new Uint8Array(buf, p + 8, len);
      const z = data.indexOf(0);
      if (z > 0) out[dec.decode(data.subarray(0, z))] = dec.decode(data.subarray(z + 1));
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}

function makeTextChunk(keyword, text) {
  const enc = new TextEncoder();
  const data = new Uint8Array([...enc.encode(keyword), 0, ...enc.encode(text)]); // text is base64 ASCII
  const typeAndData = new Uint8Array(4 + data.length);
  typeAndData.set(enc.encode('tEXt'), 0);
  typeAndData.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(typeAndData, 4);
  v.setUint32(8 + data.length, crc32(typeAndData));
  return out;
}

async function embedInPng(pngBlob, cardJson) {
  const buf = new Uint8Array(await pngBlob.arrayBuffer());
  // IEND is the last 12 bytes of a well-formed PNG.
  const iend = buf.length - 12;
  const chunk = makeTextChunk('chara', utf8b64(JSON.stringify(cardJson)));
  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, iend), 0);
  out.set(chunk, iend);
  out.set(buf.subarray(iend), iend + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

export function cardToCharacter(json, avatarImage = null) {
  const d = json?.data && typeof json.data === 'object' ? json.data : json;
  if (!d || typeof d !== 'object' || !d.name) throw new Error('This file does not look like a character card.');
  const persona = [
    d.description,
    d.personality && `Personality: ${d.personality}`,
    d.scenario && `Scenario: ${d.scenario}`,
    d.system_prompt && d.system_prompt,
    d.mes_example && `Example dialogue:\n${d.mes_example}`,
  ]
    .filter((x) => x && String(x).trim())
    .join('\n\n');
  const ext = d.extensions?.chatbox || {};
  const ch = blankCharacter();
  // A card can carry anything in its Chatbox extras: colours and keys are checked before use.
  return cleanCharacter({
    ...ch,
    name: String(d.name).slice(0, 60),
    tagline: cleanTagline(String(ext.tagline || d.creator_notes || '').split('\n').find((l) => l.trim().split(/\s+/).length > 3) || '', d.name).split(/(?<=[.!?])\s/)[0].slice(0, 80),
    persona,
    firstMessage: d.first_mes || '',
    line: ext.line || { letter: String(d.name).trim()[0]?.toUpperCase() || 'C', color: ch.line.color },
    preset: ext.preset || ch.preset,
    scene: ext.scene || ch.scene,
    avatarImage,
  }, ch.line.color);
}

export function characterToCard(ch) {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: ch.name,
      description: compileSheet(ch),
      personality: '',
      scenario: '',
      first_mes: ch.firstMessage,
      mes_example: '',
      creator_notes: ch.tagline || '',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags: [],
      creator: '',
      character_version: '1',
      extensions: { chatbox: { tagline: ch.tagline, line: ch.line, preset: ch.preset, scene: ch.scene } },
    },
  };
}

export async function readCardFile(file) {
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  if (isPng) {
    const chunks = pngTextChunks(await file.arrayBuffer());
    const raw = chunks.ccv3 || chunks.chara;
    if (!raw) throw new Error('This PNG has no character card inside.');
    const json = JSON.parse(b64utf8(raw));
    const avatar = await originalImage(file);
    return cardToCharacter(json, avatar);
  }
  const json = JSON.parse(await file.text());
  if (json.app === 'chatbox') throw Object.assign(new Error('This is a full backup. Use Restore instead.'), { backup: json });
  if (Array.isArray(json)) return json.map((j) => cardToCharacter(j));
  return cardToCharacter(json);
}

async function avatarPngBlob(ch, size = 512) {
  const src = ch.avatarImage || (await faceDataURL(ch, size, 'happy', ch.line.color));
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = Math.max(size / img.width, size / img.height);
  g.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function exportCardPng(ch) {
  return embedInPng(await avatarPngBlob(ch), characterToCard(ch));
}

export const exportCardJson = (ch) => new Blob([JSON.stringify(characterToCard(ch), null, 2)], { type: 'application/json' });

export const exportAllCardsJson = () => new Blob([JSON.stringify(S.characters.map(characterToCard), null, 2)], { type: 'application/json' });

export { LINE_COLORS };
