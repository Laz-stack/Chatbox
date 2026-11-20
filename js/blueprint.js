// Character Builder ("Blueprint"): a structured sheet in the owner's template. The filled sheet is
// what the model receives as the character (compileSheet); the old free-text prompt is "Extra notes".
// Random / Enhance / per-section reroll use the active connection; Demo gets a built-in generator.
import { PROVIDERS } from './providers.js';
import { helperComplete } from './helper.js';
import { S } from './store.js';

// A character's Mature details apply only while 18+ content is on in Depot.
export const matureOn = (ch) => !!ch?.mature && !!S.settings.mature;

// short: one-line input. long fields grow as you type. mature: hidden unless Mature details is on.
export const SECTIONS = [
  { key: 'basic', title: 'Basic info', head: 'BASIC INFO', fields: [
    { k: 'age', label: 'Age', short: true, num: true, ph: '18 or older' },
    { k: 'gender', label: 'Gender', short: true, ph: 'e.g. Woman' },
    { k: 'sexuality', label: 'Sexuality', short: true, ph: 'e.g. Bisexual' },
    { k: 'ethnicity', label: 'Ethnicity', short: true, ph: 'e.g. Half-Javanese, half-Dutch' },
    { k: 'languages', label: 'Languages', short: true, ph: 'e.g. Indonesian, English' },
  ] },
  { key: 'look', title: 'Appearance', head: 'APPEARANCE', fields: [
    { k: 'eyes', label: 'Eyes', ph: 'e.g. Dark brown, sleepy-lidded' },
    { k: 'hair', label: 'Hair', ph: 'e.g. Copper bob, black roots growing out' },
    { k: 'skin', label: 'Skin', ph: 'e.g. Warm tan, freckles across the nose' },
    { k: 'body', label: 'Body', ph: "e.g. Short and wiry, a cyclist's legs" },
    { k: 'notable', label: 'Notable features', ph: 'e.g. Chipped front tooth, ink-stained fingers' },
    { k: 'genitals', label: 'Genitals', mature: true, ph: 'Only with Mature details on' },
    { k: 'vibe', label: 'Vibe', ph: "e.g. Like she's about to tell you a secret" },
  ] },
  { key: 'attire', title: 'Attire', head: 'ATTIRE', fields: [
    { k: 'style', label: 'Style', ph: 'e.g. Oversized flannels over band tees' },
    { k: 'accessories', label: 'Accessories', ph: 'e.g. Brass compass necklace, three ear cuffs' },
  ] },
  { key: 'mind', title: 'Personality', head: 'PERSONALITY', fields: [
    { k: 'traits', label: 'Traits', ph: 'e.g. Curious, stubborn, quietly loyal' },
    { k: 'outwardly', label: 'Outwardly', ph: 'e.g. Teasing, quick with a joke' },
    { k: 'inwardly', label: 'Inwardly', ph: 'e.g. Afraid of being forgettable' },
    { k: 'likes', label: 'Likes', ph: 'e.g. Night trains, cheap noodles, old maps' },
    { k: 'dislikes', label: 'Dislikes', ph: 'e.g. Small talk, being rushed' },
    { k: 'habits', label: 'Habits', ph: 'e.g. Doodles on receipts' },
    { k: 'quirks', label: 'Quirks', ph: 'e.g. Names every stray cat she meets' },
    { k: 'hobbies', label: 'Hobbies', ph: 'e.g. Film photography, fixing radios' },
  ] },
  { key: 'story', title: 'History / background', head: 'HISTORY / BACKGROUND', fields: [
    { k: 'origin', label: 'Origin', ph: 'e.g. A harbour town on the north coast' },
    { k: 'current', label: 'Current life', ph: 'e.g. Rents a room above a repair shop' },
    { k: 'occupation', label: 'Occupation / education', ph: 'e.g. Radio repair apprentice, night classes' },
    { k: 'dreams', label: 'Dreams', ph: 'e.g. To map every train line in the country' },
    { k: 'secrets', label: 'Secrets', ph: 'e.g. Still writes to a pen pal who stopped replying' },
    { k: 'connection', label: 'Connection with {{user}}', tall: true, ph: 'e.g. Your neighbour across the hall; borrows your charger' },
  ] },
  { key: 'psych', title: 'Psychology', head: 'PSYCHOLOGY', fields: [
    { k: 'mental', label: 'Mental health', ph: 'e.g. Anxious under pressure, steady otherwise' },
    { k: 'fear', label: 'Fear / phobia', ph: 'e.g. Deep water' },
    { k: 'stress', label: 'Stress tells', ph: 'e.g. Talks faster, cracks her knuckles' },
    { k: 'attachment', label: 'Attachment style', short: true, ph: 'e.g. Anxious, working on it' },
    { k: 'craves', label: 'Love language (craves)', short: true, ph: 'e.g. Quality time' },
    { k: 'gives', label: 'Love language (gives)', short: true, ph: 'e.g. Acts of service' },
  ] },
  { key: 'voice', title: 'Speech', head: 'SPEECH', fields: [
    { k: 'voice', label: 'Voice', ph: 'e.g. Low, a little hoarse' },
    { k: 'speech', label: 'Style', ph: 'e.g. Short sentences, lots of "okay but—"' },
    { k: 'speechQuirks', label: 'Quirks', ph: 'e.g. Hums when thinking' },
  ] },
  { key: 'misc', title: 'Miscellaneous', head: 'MISCELLANEOUS', fields: [
    { k: 'scent', label: 'Scent', short: true, ph: 'e.g. Rain on hot asphalt' },
    { k: 'song', label: 'Song theme', short: true, ph: 'e.g. A lo-fi cover of an old city pop song' },
  ] },
];
export const FIELDS = SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.key })));
export const fieldsOf = (sectionKey, mature) => SECTIONS.find((s) => s.key === sectionKey).fields.filter((f) => mature || !f.mature);
export const filled = (sheet, k) => !!String(sheet?.[k] ?? '').trim();
export const hasSheet = (ch) => FIELDS.some((f) => filled(ch.sheet, f.k));

// The text the model receives as the character: the sheet in the owner's format, then Extra notes.
export function compileSheet(ch) {
  const sheet = ch.sheet || {};
  const parts = [];
  for (const s of SECTIONS) {
    const lines = s.fields
      .filter((f) => (matureOn(ch) || !f.mature) && filled(sheet, f.k))
      .map((f) => `${f.label.toUpperCase().replace('{{USER}}', '{{user}}')}: ${String(sheet[f.k]).trim()}`);
    if (s.key === 'basic' && ch.name?.trim()) lines.unshift(`NAME: ${ch.name.trim()}`);
    if (lines.length) parts.push(`## ${s.head}\n${lines.join('\n')}`);
  }
  const notes = (ch.persona || '').trim();
  if (notes) parts.push(parts.length ? `## EXTRA NOTES\n${notes}` : notes);
  return parts.join('\n\n');
}

// ---------- generation ----------
const ADULT = 'Every character is an adult. Age must be a whole number of 18 or more. Never write about minors.';

export function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  if (a < 0) throw new Error("Couldn't read the reply. Nothing changed. Try again.");
  const b = t.lastIndexOf('}');
  if (b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {}
  }
  // Models often break JSON in two ways: raw line breaks inside a string (a diary with
  // paragraphs), or an answer cut off part-way (it ran out of tokens). Repair both.
  const fixed = repairJson(t.slice(a));
  try {
    return JSON.parse(fixed);
  } catch {
    throw new Error("Couldn't read the reply. Nothing changed. Try again.");
  }
}
// Escape control characters inside strings, drop anything after the object closes, and close
// whatever was left open (a string, arrays, objects) if the text stops early.
export function repairJson(src) {
  let out = '';
  const stack = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) (esc = false), (out += ch);
      else if (ch === '\\') (esc = true), (out += ch);
      else if (ch === '"') (inStr = false), (out += ch);
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '';
      else if (ch === '\t') out += '\\t';
      else if (ch < ' ') out += ' ';
      else out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      out += ch;
      if (!stack.length) return out;
      continue;
    }
    out += ch;
  }
  if (inStr) out += '"';
  // A dangling key or comma at the cut: trim back to the last complete value.
  out = out.replace(/,\s*"[^"]*"\s*:?\s*$/, '').replace(/[,:]\s*$/, '');
  while (stack.length) out += stack.pop();
  return out;
}

const clean = (v) => (v == null ? '' : String(Array.isArray(v) ? v.join(', ') : v).trim().slice(0, 600));
const fixAge = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? String(Math.max(18, Math.min(120, n))) : '';
};

// keys: which fields to write. Returns { values: {k: text}, name?: text }.
export async function generate({ conn, ch, keys, hint, mode = 'random', signal }) {
  const mature = matureOn(ch);
  keys = keys.filter((k) => mature || !FIELDS.find((f) => f.k === k)?.mature);
  const wantName = mode !== 'section' && !ch.name?.trim();
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') return demoGenerate({ keys, wantName, mature });

  const label = (k) => FIELDS.find((f) => f.k === k).label;
  const known = {};
  for (const f of FIELDS) if (filled(ch.sheet, f.k) && (mature || !f.mature)) known[f.k] = clean(ch.sheet[f.k]);
  const system =
    'You write character sheets for a roleplay chat app. Reply with ONE JSON object and nothing else. ' +
    'Values are short English strings: a vivid phrase or one to two sentences, specific rather than generic. ' +
    `${ADULT} ` +
    (mature ? 'Mature details are ON: you may describe sexuality and the genitals field frankly but tastefully. ' : 'Mature details are OFF: no sexual details anywhere, and never include a "genitals" key. ') +
    'Keep everything consistent with the facts you are given. Write "{{user}}" where the user is meant.';
  const brief = {
    task: mode === 'enhance' ? 'enhance' : 'write',
    hint: hint || '',
    name: ch.name?.trim() || '',
    tagline: ch.tagline?.trim() || '',
    extra_notes: (ch.persona || '').slice(0, 2500),
    known_fields: known,
    fields_to_write: Object.fromEntries(keys.map((k) => [k, label(k)])),
  };
  const instructions =
    mode === 'enhance'
      ? 'Return {"fill": {...}, "sharpen": {...}}. "fill": values for the fields_to_write that are empty in known_fields. ' +
        '"sharpen": for at most 6 fields that ARE in known_fields and could be clearly more vivid, an improved version that keeps the same facts. ' +
        (wantName ? 'Also include "name" in "fill".' : '')
      : `Return an object with exactly these keys: ${keys.join(', ')}${wantName ? ', name' : ''}. Build on the hint, known_fields and extra_notes. Do not repeat known values.`;
  const text = await helperComplete(conn, 'builder', {
    system,
    messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + instructions }],
    stream: false,
    maxTokens: Math.max(conn.maxTokens || 600, 1800),
    temperature: mode === 'enhance' ? 0.8 : 1,
    signal,
  });
  const out = extractJson(text);
  const pick = (obj) => {
    const v = {};
    for (const k of keys) if (obj && obj[k] != null && clean(obj[k])) v[k] = k === 'age' ? fixAge(obj[k]) : clean(obj[k]);
    return v;
  };
  if (mode === 'enhance') {
    const fill = pick(out.fill || {});
    const sharpen = {};
    for (const [k, v] of Object.entries(out.sharpen || {})) if (keys.includes(k) || FIELDS.some((f) => f.k === k)) if (clean(v) && (mature || !FIELDS.find((f) => f.k === k)?.mature)) sharpen[k] = k === 'age' ? fixAge(v) : clean(v);
    return { values: Object.fromEntries(Object.entries(fill).filter(([k]) => !filled(ch.sheet, k))), sharpen, name: wantName ? clean(out.fill?.name) : '' };
  }
  return { values: pick(out), name: wantName ? clean(out.name) : '' };
}

// Demo mode: a small built-in pool, so the buttons still work without an AI key.
const POOL = {
  name: ['Sina Arlett', 'Juno Hale', 'Rhea Okafor', 'Kai Morrow', 'Mira Sato', 'Theo Vance', 'Ines Laurent', 'Dara Quinn'],
  gender: ['Woman', 'Man', 'Non-binary', 'Woman', 'Man'],
  sexuality: ['Bisexual', 'Straight', 'Gay', 'Lesbian', 'Pansexual', 'Asexual, romantic'],
  ethnicity: ['Half-Javanese, half-Dutch', 'Nigerian-British', 'Japanese', 'Brazilian', 'Korean-Canadian', 'Irish', 'Moroccan-French'],
  languages: ['Indonesian, English, a little Dutch', 'English, Yoruba', 'Japanese, broken English', 'Portuguese, Spanish', 'English, Korean', 'English, a little Irish', 'French, Arabic'],
  eyes: ['Dark brown, sleepy-lidded', 'Grey, always narrowed a little', 'Hazel with a gold ring', 'Black, sharp and quick', 'Pale green, unsettlingly steady'],
  hair: ['Copper bob, black roots growing out', 'Long braids tied with wire', 'Buzzed short, bleached at the tips', 'Messy waves that never stay pinned', 'Silver streak through black hair'],
  skin: ['Warm tan, freckles across the nose', 'Deep brown, a scar on one knuckle', 'Pale, flushes easily', 'Olive, sun-worn', 'Light brown, ink smudges on the wrists'],
  body: ["Short and wiry, a cyclist's legs", 'Tall and broad-shouldered', 'Soft and sturdy', 'Lean, all elbows', 'Athletic, a swimmer’s build'],
  notable: ['Chipped front tooth', 'A tiny constellation tattoo behind one ear', 'Burn scar along the forearm', 'Dimples only on one side', 'Always has paint under the nails'],
  vibe: ["Like they're about to tell you a secret", 'Rainy-afternoon calm', 'Trouble in a good mood', 'Someone who has read every sign in the station', 'Warm, then suddenly very serious'],
  style: ['Oversized flannels over band tees', 'Pressed uniform, sleeves always rolled', 'Thrifted coats in loud colours', 'All black, one bright scarf', 'Workwear and too many pockets'],
  accessories: ['Brass compass necklace, three ear cuffs', 'Wired earbuds, never in use', 'A battered film camera', 'Stack of thin silver rings', 'Transit card on a lanyard'],
  traits: ['Curious, stubborn, quietly loyal', 'Dry, patient, secretly sentimental', 'Restless, generous, a little reckless', 'Precise, guarded, kind once you’re in', 'Warm, nosy, fearless about the wrong things'],
  outwardly: ['Teasing, quick with a joke', 'Calm and hard to read', 'Loud and easy to like', 'Polite to a fault', 'Blunt, but means well'],
  inwardly: ['Afraid of being forgettable', 'Lonely more often than they admit', 'Always making plans to leave', 'Proud, and tired of it', 'Hoping someone will notice'],
  likes: ['Night trains, cheap noodles, old maps', 'Thunderstorms, vinyl, strong tea', 'Rooftops, street food, crossword puzzles', 'Rain on windows, late shifts, cats', 'Second-hand books, early mornings'],
  dislikes: ['Small talk, being rushed', 'Loud chewing, broken promises', 'Crowds, fake smiles', 'Being told to calm down', 'Cold coffee, waiting'],
  habits: ['Doodles on receipts', 'Checks the time constantly', 'Hums while working', 'Keeps every ticket stub', 'Taps the table when thinking'],
  quirks: ['Names every stray cat', 'Talks to machines when fixing them', 'Can’t sleep without the window open', 'Counts stairs out loud', 'Always sits facing the door'],
  hobbies: ['Film photography, fixing radios', 'Bouldering, cooking for too many people', 'Collecting maps, night walks', 'Sketching strangers, sewing', 'Running, old video games'],
  origin: ['A harbour town on the north coast', 'A crowded apartment block in the capital', 'A mountain village two trains from anywhere', 'Grew up above the family shop', 'Moved cities every year as a kid'],
  current: ['Rents a room above a repair shop', 'Shares a flat with two loud roommates', 'Lives alone near the last station on the line', 'Back home, figuring things out', 'Saving up in a tiny studio'],
  occupation: ['Radio repair apprentice, night classes in design', 'Night-shift conductor', 'Barista and part-time illustrator', 'Nursing student', 'Courier on a battered bike'],
  dreams: ['To map every train line in the country', 'To open a place of their own', 'To be good at one thing, really good', 'To see the sea from somewhere new', 'To stop running'],
  secrets: ['Still writes to a pen pal who stopped replying', 'Failed out of the school everyone thinks they finished', 'Keeps a bag packed under the bed', 'Knows more about {{user}} than they let on', 'Was almost someone else entirely'],
  connection: ["{{user}}'s neighbour across the hall; borrows the charger and never gives it back", 'Rides the same last train as {{user}} every night', "{{user}}'s new coworker on the late shift", "An old friend of {{user}}'s who just moved back", 'Keeps ending up at the same café table as {{user}}'],
  mental: ['Anxious under pressure, steady otherwise', 'Mostly fine; bad weeks in winter', 'Overthinks, then overcorrects', 'Steady, with a temper they keep on a short leash', 'Restless; therapy helps'],
  fear: ['Deep water', 'Being forgotten', 'Hospitals', 'Heights', 'Silence after an argument'],
  stress: ['Talks faster, cracks their knuckles', 'Goes very quiet', 'Cleans everything in sight', 'Laughs at the wrong moment', 'Picks at their sleeves'],
  attachment: ['Anxious, working on it', 'Secure', 'Avoidant until they trust you', 'Fearful-avoidant', 'Secure, a little guarded'],
  craves: ['Quality time', 'Words of affirmation', 'Physical touch', 'Acts of service', 'Gifts, small and thoughtful'],
  gives: ['Acts of service', 'Quality time', 'Gifts', 'Words of affirmation', 'Physical touch'],
  voice: ['Low, a little hoarse', 'Bright and fast', 'Soft, with a laugh hiding in it', 'Flat until it suddenly isn’t', 'Warm, with a slight accent'],
  speech: ['Short sentences, lots of "okay but—"', 'Rambles, then apologises', 'Formal when nervous, sloppy when happy', 'Says little; every word counts', 'Answers questions with questions'],
  speechQuirks: ['Hums when thinking', 'Mixes two languages mid-sentence', 'Calls everyone by surnames', 'Never says goodbye, just "later"', 'Narrates what they’re doing'],
  scent: ['Solder and orange peel', 'Rain on hot asphalt', 'Coffee and cedar', 'Laundry soap and smoke', 'Old paper and mint'],
  song: ['A lo-fi cover of an old city pop song', 'A loud punk song from their teens', 'A slow piano piece on repeat', 'A song in a language you don’t speak', 'Something from the last train’s radio'],
};
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
function demoGenerate({ keys, wantName, mature }) {
  const values = {};
  for (const k of keys) {
    if (k === 'age') values.age = String(19 + Math.floor(Math.random() * 22));
    else if (k === 'languages' && keys.includes('ethnicity')) continue; // paired with ethnicity below
    else if (k === 'genitals') {
      if (mature) values.genitals = 'Left for you to write: Demo mode has no AI to describe this.';
    } else if (k !== 'ethnicity' && POOL[k]) values[k] = pickOne(POOL[k]);
  }
  // Ethnicity and languages are picked as a pair so they agree with each other.
  if (keys.includes('ethnicity')) {
    const i = Math.floor(Math.random() * POOL.ethnicity.length);
    values.ethnicity = POOL.ethnicity[i];
    if (keys.includes('languages')) values.languages = POOL.languages[i];
  }
  return { values, sharpen: {}, name: wantName ? pickOne(POOL.name) : '', demo: true };
}
