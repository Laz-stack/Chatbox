// Make a character from a picture: a model that can see pictures writes the character sheet
// (the look precisely from the picture, the rest made up to fit); the editor opens filled in.
import { S, blankCharacter, connection, activeConnection } from './store.js';
import { PROVIDERS, complete } from './providers.js';
import { FIELDS, extractJson, generate } from './blueprint.js';

let picked = null; // the chosen picture, handed from the Build sheet to the page
export const setPicked = (p) => (picked = p);
export const getPicked = () => picked;
// The hint survives picking another picture.
let hintText = '';
export const setHint = (h) => (hintText = h);
export const getHint = () => hintText;

// Can this model look at pictures? 'yes' | 'maybe' | 'no'.
// Only a short list of models we're sure can't see gets a hard no; everything unsure may try.
export function canSee(conn) {
  if (!conn) return 'none';
  if (conn.provider === 'demo') return 'yes';
  const m = String(conn.model || '').toLowerCase();
  if (/^(claude-2|claude-instant)|gpt-3\.5|deepseek-(r1|chat|reasoner)|o3-mini|o1-mini/.test(m.replace(/^.*\//, ''))) return 'no';
  if (/mimo-v2\.6-pro|mimo-7b/.test(m)) return 'no';
  if (/(claude-(3|4|sonnet|opus|haiku|fable)|gpt-4o|gpt-4\.1|gpt-5|gemini|pixtral|llava|vision|-vl\b|qwen.*vl)/.test(m)) return 'yes';
  return 'maybe';
}
export const pictureConn = () => activeConnection();

// A smaller copy for sending (cheaper, faster), as JPEG.
export async function prepare(file) {
  const url = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('That picture couldn’t be read.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('That file isn’t a picture this browser can open.'));
    i.src = url;
  });
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; // transparent pictures get a white backing, not black
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

const LOOK_KEYS = ['eyes', 'hair', 'skin', 'body', 'attire', 'outfit', 'clothes', 'accessories', 'features'];
// Which written fields describe the look (for the tags on the picture).
export const lookFields = (sheet) => FIELDS.filter((f) => f.section === 'look' || f.section === 'attire' || LOOK_KEYS.includes(f.k)).filter((f) => String(sheet[f.k] || '').trim()).map((f) => ({ label: f.label, value: String(sheet[f.k]).trim() }));

export class RefusedError extends Error {}

export async function writeFromPicture({ conn, dataUrl, hint = '', signal }) {
  const keys = FIELDS.filter((f) => !f.mature).map((f) => f.k);
  const ch = blankCharacter();
  if (conn.provider === 'demo') {
    const r = await generate({ conn, ch, keys, hint, mode: 'random' });
    Object.assign(ch.sheet, r.values);
    ch.name = r.name || 'Vesna Kade';
    ch.tagline = 'Written from your picture (demo)';
  } else {
    const ask =
      `Write a roleplay character from this picture. Return ONE JSON object with keys: name, tagline, ${keys.join(', ')}. ` +
      `Describe the look (eyes, hair, skin, body, clothes, distinguishing features) exactly as the picture shows it. Make up everything else so it fits what the picture suggests` +
      (hint ? `, and follow this note from the user: "${hint.replace(/"/g, "'").slice(0, 400)}"` : '') +
      `. tagline: under 10 words. Values are short: a vivid phrase or one to two sentences. ` +
      (S.settings.mature ? '' : 'Mature details are OFF: no sexual details anywhere. ') +
      `The character is a fictional adult (18 or older). If the picture shows a real, recognisable person, do not identify or name them: invent a different person inspired only by the general look. ` +
      `If the picture shows someone who looks under 18, or you can't write from it, return {"refused":"<short reason>"} instead.`;
    const parts =
      PROVIDERS[conn.provider]?.format === 'anthropic'
        ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } }, { type: 'text', text: ask }]
        : [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url: dataUrl } }];
    const text = await complete(conn, { system: 'You write character sheets for a roleplay chat app. Reply with ONE JSON object and nothing else. Every character is a fictional adult.', messages: [{ role: 'user', content: parts }], stream: false, maxTokens: Math.max(conn.maxTokens || 600, 1800), temperature: 0.9, signal });
    let out;
    try {
      out = extractJson(text);
    } catch {
      throw new RefusedError('The model didn’t write a character from this picture.');
    }
    if (out.refused) throw new RefusedError(String(out.refused).slice(0, 200));
    for (const k of keys) if (out[k] != null && String(out[k]).trim()) ch.sheet[k] = k === 'age' ? String(Math.max(18, parseInt(out[k], 10) || 21)) : String(out[k]).trim().slice(0, 600);
    ch.name = String(out.name || '').trim().slice(0, 60);
    ch.tagline = String(out.tagline || '').trim().slice(0, 80);
    if (!Object.keys(ch.sheet).length) throw new RefusedError('The model didn’t write a character from this picture.');
  }
  ch.line.letter = (ch.name[0] || '').toUpperCase();
  return ch;
}
