// Story time from the chat: the helper reads the recent messages (and the time skips in them) and
// estimates where the story's clock is now: which day since the start, the time, the weather.
import { textOf } from './store.js';
import { helperJson } from './helper.js';
import { PROVIDERS } from './providers.js';
import { WEATHER, hhmm, newClock } from './clock.js';

const str = (v) => (v == null ? '' : String(v).trim());

export async function readTime({ chat, cast, persona, conn, signal }) {
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') throw new Error('Reading the time needs an AI connection (Depot › Connections).');
  const you = persona?.name?.trim() || 'the user';
  const nameOf = (m) => (m.dir ? 'Time note' : m.role === 'user' ? you : cast.find((p) => p.id === m.speaker)?.name || cast[0]?.name || 'Narrator');
  const c = chat.clock || newClock();
  const recent = chat.messages
    .filter((m) => !m.error)
    .slice(-18)
    .map((m) => `${nameOf(m)}: ${str(m.dir ? m.time || textOf(m) : textOf(m)).replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 900)}`)
    .join('\n\n');
  const brief = { clock_now: { day: c.day, time: hhmm(c.min), weather: c.weather }, story_so_far: str(chat.summary?.text).slice(0, 1500), recent_chat: recent };
  const ask =
    `Estimate the story's clock at the END of recent_chat, from what it says or shows: time of day words (dawn, noon, dusk, late at night), meals, sleeping and waking, travel, "hours later", "the next morning". ` +
    `clock_now is the app's current guess and may be wrong. Count days from the start of the story (Day 1). ` +
    `Return {"day":1,"time":"HH:MM","weather":"...","why":"..."}. time: 24-hour. weather: one of ${Object.keys(WEATHER).join(', ')}, or "" if nothing suggests a change. why: under 14 words, what in the chat tells you.`;
  const res = await helperJson(conn, 'track', { system: 'You keep the clock for an ongoing story. Reply with ONE JSON object and nothing else.', messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: 1500, temperature: 0.2, signal });
  const m = str(res?.time).match(/^(\d{1,2}):(\d{2})/);
  if (!m) throw new Error('The chat doesn’t say clearly what time it is yet.');
  return {
    day: Math.max(1, Math.min(999, Math.round(Number(res.day)) || c.day)),
    min: (Math.min(23, +m[1]) * 60 + Math.min(59, +m[2])) % 1440,
    weather: WEATHER[res.weather] ? res.weather : c.weather,
    why: str(res.why).slice(0, 120),
  };
}
