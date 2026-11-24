// Carriage (an Interchange in "One scene" mode): the AI narrates one shared scene and voices every
// character in it; side characters ("passengers") may turn up and can be saved as lines.
import { compileSheet } from './blueprint.js';

// The steering bar. `note` is what the AI receives; `label` is what the log shows.
export const STEER = {
  happens: { label: 'Something happens', icon: 'spark', note: 'Something unexpected happens that changes the scene.' },
  arrives: { label: 'Someone arrives', icon: 'user', note: 'Someone new arrives and joins the scene.' },
  talk: { label: 'Let them talk', icon: 'talk', note: 'The characters carry on among themselves for a moment, without the user.' },
  skip: { label: 'Skip ahead', icon: 'skip', note: 'Skip ahead in time to the next moment that matters. Open with one short line saying how much time has passed.' },
};

const firstName = (n) => (n || '').trim().split(/\s+/)[0].toLowerCase();

// The system text for a scene: how to write, then the cast's sheets.
export function sceneSystem({ people, scene, passengers = true, you, fill }) {
  const ex = people[0]?.name || 'Mika';
  const cast = people
    .map((p) => `### ${p.name}\n${fill(compileSheet(p), p) || `${p.name}.`}${p.tagline ? `\nIn a few words: ${p.tagline}` : ''}`)
    .join('\n\n');
  return (
    `You narrate one shared scene and voice every character in it except ${you}, who is played by the user.` +
    (scene?.trim() ? `\nThe scene: ${fill(scene, people[0])}` : '') +
    `\n\nHow to write each reply:` +
    `\n- Separate blocks with a blank line.` +
    `\n- Narration has no name in front.` +
    `\n- Speech starts with the speaker's name and a colon, for example: ${ex}: *looks up* "Oh, it's you." Put actions in *asterisks*. Start every paragraph that has speech with the speaker's name again, even when the same character keeps talking.` +
    `\n- Let the characters talk to and react to each other, not only to ${you}. Usually 2 to 6 blocks; not everyone has to speak every time.` +
    `\n- Never write ${you}'s dialogue, actions, thoughts or feelings. Stop when it is ${you}'s turn.` +
    `\n- Lines in [square brackets] from the user are stage directions: follow them, never quote them.` +
    (passengers
      ? `\n- Minor side characters may appear when the scene calls for it. Give each a short name (like "Old Tomas") and keep using it the same way: Name: line. Keep them minor.`
      : `\n- Only the cast speaks. Do not add new named characters.`) +
    `\n\nThe cast:\n\n${cast}`
  );
}

// "Mika: *waves* hi" → a speech block. Names are 1–4 words, start with a capital letter, no digits first.
const SPEAKER = /^\s*(?:\*\*)?([\p{Lu}][\p{L}\p{N}'’.\- ]{0,30}?)(?:\*\*)?\s*:(?!\d)\s*(?:\*\*\s*)?(.*)$/u;
const NOT_NAMES = /^(note|scene|setting|time|location|ooc|narration|narrator)$/i;

// Parse a reply into blocks: { kind: 'narr', text } or { kind: 'say', name, text }.
// Consecutive speech from one speaker is merged so the name tab isn't repeated.
export function parseScene(text, cast = []) {
  const blocks = [];
  let cur = null;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      cur = null;
      continue;
    }
    const mm = line.match(SPEAKER);
    const name = mm?.[1].trim();
    if (mm && name.split(/\s+/).length <= 4 && !NOT_NAMES.test(name)) {
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === 'say' && prev.name.toLowerCase() === name.toLowerCase()) (prev.text += '\n' + mm[2]), (cur = prev);
      else blocks.push((cur = { kind: 'say', name, text: mm[2] }));
      continue;
    }
    if (mm && NOT_NAMES.test(name)) {
      blocks.push((cur = { kind: 'narr', text: /^narrat/i.test(name) ? mm[2] : line.trim() }));
      continue;
    }
    if (cur) cur.text += '\n' + line;
    else blocks.push((cur = { kind: 'narr', text: line }));
  }
  return attribute(blocks.filter((b) => b.text.trim() || b.kind === 'say'), cast);
}

// A paragraph with speech but no "Name:" still belongs to someone: the character it opens with
// ("Alden steps in. "No."") or, failing that, whoever was talking just before it.
// Paragraphs without speech stay narration.
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function attribute(blocks, cast) {
  const first = (n) => n.trim().split(/\s+/)[0];
  const same = (a, b) => a.toLowerCase() === b.toLowerCase() || first(a).toLowerCase() === first(b).toLowerCase();
  const out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.kind === 'narr' && /["“]|`[^`\n]+`/.test(b.text)) {
      const lead = b.text.replace(/^[\s*_]+/, '');
      const opener = cast.find((n) => new RegExp(`^(${reEsc(n.trim())}|${reEsc(first(n))})\\b`, 'i').test(lead));
      // "...," someone mutters / a student asks: a background voice, so it stays narration.
      const other = /(^|[,.!?”"]\s+)(someone|somebody|another \w+|an? \w+|the \w+|one of them|a voice)\s+(says|said|mutters|muttered|asks|asked|shouts|shouted|calls|called|snaps|snapped|whispers|whispered|adds|added|replies|replied|yells|yelled|hisses|hissed)\b/i.test(b.text);
      const name = opener || (prev?.kind === 'say' && !other ? prev.name : null);
      if (name) {
        if (prev?.kind === 'say' && same(prev.name, name)) prev.text += '\n\n' + b.text;
        else out.push({ kind: 'say', name, text: b.text });
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

// A reply written for one known speaker (Take turns, or older messages): paragraphs of plain prose
// are narration; paragraphs with speech ("…") or *actions* are that speaker's. Same block shape as parseScene.
// each: every spoken paragraph is its own block (a One narrator card, where each may be someone else).
export function splitTurn(text, name, each = false) {
  const blocks = [];
  for (const para of (text || '').split(/\n\s*\n/)) {
    const t = para.trim();
    if (!t) continue;
    const said = /["“”]|`[^`\n]+`/.test(t);
    const prev = blocks[blocks.length - 1];
    if (said && !each && prev?.kind === 'say') prev.text += '\n\n' + t;
    else blocks.push(said ? { kind: 'say', name, text: t } : { kind: 'narr', text: t });
  }
  return blocks;
}
// True when a reply already uses scene format for at least one of the cast ("Mika: …").
export const hasCastLines = (text, people) => {
  const names = people.flatMap((p) => [p.name.trim().toLowerCase(), firstName(p.name)]);
  return parseScene(text).some((b) => b.kind === 'say' && names.includes(b.name.trim().toLowerCase()));
};
// The same reply rewritten in scene format ("Name: …"), for a scene's history.
export const turnAsScene = (text, name) => splitTurn(text, name).map((b) => (b.kind === 'say' ? `${name}: ${b.text.replace(/\n\s*\n/g, ' ')}` : b.text)).join('\n\n');

// Who a parsed name refers to: a cast member, you, or a passenger.
export function resolveSpeaker(name, people, youName) {
  const n = (name || '').trim().toLowerCase();
  const p = people.find((x) => x.name.trim().toLowerCase() === n) || people.find((x) => firstName(x.name) === n);
  if (p) return { kind: 'line', who: p };
  if (youName && (n === youName.trim().toLowerCase() || n === firstName(youName))) return { kind: 'you' };
  return { kind: 'passenger', name: name.trim() };
}

// Passenger names in a reply, in order of first appearance.
export function passengersIn(text, people, youName) {
  const out = [];
  for (const b of parseScene(text)) {
    if (b.kind !== 'say') continue;
    const r = resolveSpeaker(b.name, people, youName);
    if (r.kind === 'passenger' && !out.some((x) => x.toLowerCase() === r.name.toLowerCase())) out.push(r.name);
  }
  return out;
}

// ---------- Demo: a canned scene so the mode can be tried without a key ----------
const NARR = [
  'The carriage lurches past the river. Rain streaks the windows sideways, and the heater under the seats ticks without giving off any warmth.',
  'The lights flicker once. Somewhere down the train, a door bangs open and shut in the wind.',
  'For a while nobody says anything. The rails hum, and the city slides by in smeared orange lights.',
];
const LINES = [
  ['pulls her scarf up to her nose', 'You said this would be warmer. I am holding you to that.'],
  ['checks the time and sighs', 'Two more stops. We can survive two more stops.'],
  ['leans closer, lowering her voice', 'Did you see that? I swear someone was watching us.'],
  ['laughs despite herself', 'Okay, okay. That was actually funny.'],
];
let demoN = 0;
export function demoScene(cast, last = '') {
  const k = demoN++;
  const a = cast[k % cast.length] || 'Mika';
  const b = cast[(k + 1) % cast.length] || a;
  const [actA, sayA] = LINES[k % LINES.length];
  const [actB, sayB] = LINES[(k + 1) % LINES.length];
  let out;
  if (/arrives/i.test(last))
    out = `At the far end, the connecting door rattles open. An old man with a fishing rod and a dented thermos steps through, shaking rain off his cap.\n\nOld Tomas: "Mind if I sit? The seats back there are soaked through."\n\n${a}: *scoots over at once* "Of course! Is that... soup?"`;
  else if (/skip ahead/i.test(last)) out = `Twenty minutes later.\n\nThe train has emptied out. Only the three of you are left, and the windows have fogged over completely.\n\n${a}: *draws a little face in the fog* "${sayA}"`;
  else out = `${NARR[k % NARR.length]}\n\n${a}: *${actA}* "${sayA}"\n\n${b}: *${actB}* "${sayB}"`;
  return out + '\n\n*(Demo scene. Add your API key in Settings to play it for real.)*';
}
