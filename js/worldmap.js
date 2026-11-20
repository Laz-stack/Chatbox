// World map (per chat): places from the lorebook and the story, shown as stations on a line.
// Travelling to one leaves a divider in the log, tells the AI where the next scene starts, changes
// the chat's background, and moves Story time on. Background tracking notes where the scene is.
import { S } from './store.js';
import { PROVIDERS } from './providers.js';
import { extractJson } from './blueprint.js';
import { helperComplete } from './helper.js';
import { uid } from './util.js';
import { clockOn, advance } from './clock.js';

export const MAX_PLACES = 12;
export const MAP_SCENES = ['cafe', 'night', 'sakura', 'rain', 'room'];
const str = (v) => (v == null ? '' : String(v).trim());
export const normName = (s) => str(s).toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ');
export const mapOn = (chat) => !!chat?.map?.places?.length;
export const hereOf = (chat) => chat?.map?.places?.find((p) => p.id === chat.map.here) || null;
// Matches a place by name or by a name it had before you renamed it.
export const findPlace = (chat, name) => (chat.map?.places || []).find((p) => normName(p.name) === normName(name) || (p.aka || []).includes(normName(name))) || null;

// The lorebook entries this chat can see.
export function loreFor(ids) {
  return S.lore.filter((e) => e.on !== false && e.text?.trim() && !(S.settings.booksOff || []).includes(e.book || '') && (e.scope !== 'lines' || (e.lines || []).some((id) => ids.includes(id))));
}

// First pass: pick the places out of the lorebook.
export async function makeMap({ chat, cast, ids, conn, signal }) {
  const lore = loreFor(ids).slice(0, 40);
  let res;
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') {
    const names = lore.map((e) => e.title).filter(Boolean).slice(0, 6);
    res = { places: (names.length ? names : ['The cafe', 'Station platform', 'Riverside park', 'Your flat']).map((n, i) => ({ name: n, note: 'A place from the demo story.', usual: i ? [] : [cast[0]?.name], scene: MAP_SCENES[i % MAP_SCENES.length] })) };
  } else {
    const brief = {
      cast: cast.map((p) => p.name),
      story_so_far: chat.summary?.text || '',
      lorebook: lore.map((e) => ({ title: e.title, text: str(e.text).slice(0, 500) })),
    };
    const ask =
      `Pick the PLACES from this lorebook (locations people can go to: buildings, rooms, districts, landmarks), at most ${MAX_PLACES}. Skip people, objects, factions and rules. ` +
      `Return {"places":[{"name":"...","note":"...","usual":["..."],"scene":"...","lore_title":"..."}],"here":"..."}. name: 1 to 4 words. note: one sentence under 16 words. usual: cast members who are usually found there (may be empty). scene: the closest background of ${MAP_SCENES.join(', ')}. here: the place the story is at now, if clear, else "".`;
    const text = await helperComplete(conn, 'map', { system: 'You build a map for an interactive story. Reply with ONE JSON object and nothing else.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 900, temperature: 0.3, signal });
    res = extractJson(text);
  }
  chat.map ||= { places: [], here: null, removed: [], suggest: [] };
  const byName = (n) => cast.find((p) => p.name.toLowerCase() === str(n).toLowerCase()) || cast.find((p) => p.name.split(/\s+/)[0].toLowerCase() === str(n).split(/\s+/)[0].toLowerCase());
  for (const p of Array.isArray(res?.places) ? res.places : []) {
    if (chat.map.places.length >= MAX_PLACES) break;
    if (!str(p.name) || findPlace(chat, p.name) || chat.map.removed.includes(normName(p.name))) continue;
    chat.map.places.push({ id: uid(), name: str(p.name).slice(0, 40), note: str(p.note).slice(0, 140), usual: (p.usual || []).map(byName).filter(Boolean).map((c) => c.id), scene: MAP_SCENES.includes(p.scene) ? p.scene : '', from: 'lore', visited: false, at: Date.now() });
  }
  const here = res?.here && findPlace(chat, res.here);
  if (here) (chat.map.here = here.id), (here.visited = true);
  return chat.map.places.length;
}

export function addPlace(chat, { name, note = '', scene = '', from = 'you', usual = [] }) {
  chat.map ||= { places: [], here: null, removed: [], suggest: [] };
  if (chat.map.places.length >= MAX_PLACES || !str(name) || findPlace(chat, name)) return null;
  chat.map.removed = chat.map.removed.filter((n) => n !== normName(name));
  const p = { id: uid(), name: str(name).slice(0, 40), note: str(note).slice(0, 140), usual, scene, from, visited: from === 'story', at: Date.now() };
  chat.map.places.push(p);
  return p;
}
export function removePlace(chat, id) {
  const p = chat.map.places.find((x) => x.id === id);
  if (!p) return null;
  chat.map.places = chat.map.places.filter((x) => x !== p);
  chat.map.removed.push(normName(p.name));
  if (chat.map.here === id) chat.map.here = null;
  return p;
}

// Travel: returns the divider message (a stage direction) for the log.
export function travel(chat, place, { you, cast }) {
  const from = hereOf(chat);
  const undo = { prevHere: chat.map.here, wasVisited: place.visited, minutes: clockOn(chat) ? 20 : 0 };
  chat.map.here = place.id;
  place.visited = true;
  if (undo.minutes) advance(chat.clock, undo.minutes);
  const usual = place.usual.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  const note = `${you} travels${from ? ` from ${from.name}` : ''} to ${place.name}.${place.note ? ` ${place.note}` : ''}${usual.length ? ` ${usual.join(' and ')} ${usual.length > 1 ? 'are' : 'is'} usually found there.` : ''} Start the next scene there, with whoever would plausibly be around.`;
  return { id: uid(), role: 'user', dir: 'travel', time: `Travelled to ${place.name}`, alts: [note], alt: 0, at: Date.now(), go: true, undo: { ...undo, place: place.id } };
}
// Take a trip back: the place you were, the clock, and the divider (plus any reply after it).
export function untravel(chat, m) {
  const u = m.undo;
  if (!u) return;
  const p = chat.map?.places.find((x) => x.id === u.place);
  if (p && !u.wasVisited) p.visited = false;
  if (chat.map) chat.map.here = u.prevHere;
  if (u.minutes && chat.clock) advance(chat.clock, -u.minutes);
  const i = chat.messages.indexOf(m);
  if (i >= 0) chat.messages.splice(i);
}

// ---------- background tracking ----------
export const mapBrief = (chat) => ({ places_known: chat.map.places.map((p) => p.name), place_at_start: hereOf(chat)?.name || '' });
export const mapAsk = () =>
  `\nMap: also return "place":{"name":"...","note":"..."}: where the scene is at the end of this part. Use a name from places_known when it is one of them; a new name only for a real new location (1 to 4 words, note under 16 words). "" if unclear.`;
export function applyMap(chat, place) {
  const name = str(place?.name);
  if (!name) return null;
  const prevHere = chat.map.here;
  let p = findPlace(chat, name);
  let created = false;
  if (!p) {
    if (chat.map.removed.includes(normName(name))) return null; // you removed it: it stays off the map
    if (chat.map.places.length >= MAX_PLACES) {
      if (!chat.map.suggest.includes(name)) chat.map.suggest = [...chat.map.suggest, name].slice(-6);
      return null;
    }
    p = addPlace(chat, { name, note: place.note, from: 'story' });
    created = true;
  }
  if (!p || (p.id === prevHere && !created)) return null;
  chat.map.here = p.id;
  const wasVisited = p.visited;
  p.visited = true;
  return { id: p.id, name: p.name, created, prevHere, wasVisited };
}
export function undoMap(chat, c) {
  if (!c || !chat.map) return;
  if (c.created) chat.map.places = chat.map.places.filter((p) => p.id !== c.id);
  else {
    const p = chat.map.places.find((x) => x.id === c.id);
    if (p && !c.wasVisited) p.visited = false;
  }
  chat.map.here = c.prevHere;
}

// The prompt layer.
export function mapLayer(chat, cast) {
  if (!mapOn(chat)) return '';
  const h = hereOf(chat);
  const others = chat.map.places.filter((p) => p !== h).map((p) => p.name);
  const usual = h ? h.usual.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean) : [];
  return (h ? `Current location: ${h.name}${h.note ? ` (${h.note})` : ''}.${usual.length ? ` Usually here: ${usual.join(', ')}.` : ''}` : 'Current location: not settled yet.') + (others.length ? ` Other known places: ${others.slice(0, 11).join(', ')}.` : '');
}
