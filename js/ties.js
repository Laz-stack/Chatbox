// Cast relationships: in group chats, how each character sees each of the others.
// A "tie" is one direction: chat.ties["<from>><to>"] = { warmth −100..100, word, why, set, log }.
// The background read (js/chronicle.js) updates them; the AI is told where things stand.

export const WORDS = ['friend', 'old friends', 'family', 'mentor', 'protective', 'crush', 'admires', 'curious', 'unaware', 'wary', 'rival', 'resents', 'distrusts', 'enemy'];
const STEP = 15; // most a single read moves a tie
const clampW = (v) => Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));
export const tieKey = (from, to) => `${from}>${to}`;
export const tieOf = (chat, from, to) => chat.ties?.[tieKey(from, to)] || null;
export const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);

// Every unordered pair in the cast.
export function pairs(cast) {
  const out = [];
  for (let i = 0; i < cast.length; i++) for (let j = i + 1; j < cast.length; j++) out.push([cast[i], cast[j]]);
  return out;
}

// What the background read is shown, and asked.
export function tiesBrief(chat, cast) {
  if (cast.length < 2) return null;
  const now = {};
  for (const [a, b] of pairs(cast))
    for (const [x, y] of [[a, b], [b, a]]) {
      const t = tieOf(chat, x.id, y.id);
      now[`${x.name} → ${y.name}`] = t ? `${t.word} (${t.warmth})` : 'not set yet';
    }
  return now;
}
export const tiesAsk = (names) =>
  `\nAlso return "ties":[{"from":"...","to":"...","warmth":0,"word":"...","why":"..."}] for pairs of cast members (${names.join(', ')}) who dealt with each other in this part. ` +
  `One entry per direction (how "from" sees "to"). warmth −100 (hostile) to 100 (very close); change gradually, at most 15 a part unless something major happened; if "not set yet", judge from who they are. ` +
  `word: 1 or 2 words such as ${WORDS.slice(0, 10).join(', ')}. why: under 10 words. At most 8 entries; leave ties empty if nothing changed between them.`;

// Apply the read's ties. Returns [{ key, d }] for undo.
export function applyTies(chat, list, cast, msgId) {
  const byName = (n) => {
    const s = String(n || '').trim().toLowerCase();
    return cast.find((p) => p.name.trim().toLowerCase() === s) || cast.find((p) => p.name.split(/\s+/)[0].toLowerCase() === s.split(/\s+/)[0]);
  };
  const changes = [];
  for (const r of Array.isArray(list) ? list.slice(0, 8) : []) {
    const a = byName(r.from);
    const b = byName(r.to);
    if (!a || !b || a.id === b.id) continue;
    chat.ties ||= {};
    const k = tieKey(a.id, b.id);
    const prev = chat.ties[k];
    const want = clampW(r.warmth);
    const warmth = prev ? Math.max(prev.warmth - STEP, Math.min(prev.warmth + STEP, want)) : want;
    const word = String(r.word || '').trim().toLowerCase().slice(0, 20) || prev?.word || 'neutral';
    const why = String(r.why || '').trim().slice(0, 80);
    if (prev && warmth === prev.warmth && word === prev.word) continue;
    const d = prev ? warmth - prev.warmth : 0;
    const t = { ...(prev || {}), warmth, word, why: why || prev?.why || '', at: Date.now(), log: [{ msgId, at: Date.now(), d, word, why, first: !prev }, ...(prev?.log || [])].slice(0, 20) };
    if (prev?.word !== word) t.fresh = true;
    chat.ties[k] = t;
    changes.push({ key: k, d, word: prev?.word || null, first: !prev });
  }
  return changes;
}

// Take back what one reply's read changed (regenerate / delete).
export function undoTies(chat, changes) {
  for (const x of changes || []) {
    const t = chat.ties?.[x.key];
    // A tie you set by hand stays as you set it.
    if (!t || t.set) continue;
    if (x.first) {
      delete chat.ties[x.key];
      continue;
    }
    t.warmth = clampW(t.warmth - x.d);
    if (x.word) t.word = x.word;
    t.log = (t.log || []).slice(1);
  }
}

// Set by hand from the Bonds page.
export function setTie(chat, from, to, { warmth, word, why }, msgId) {
  chat.ties ||= {};
  const k = tieKey(from, to);
  const prev = chat.ties[k];
  const w = clampW(warmth);
  chat.ties[k] = { ...(prev || {}), warmth: w, word: word || prev?.word || 'neutral', why: why ?? prev?.why ?? '', set: true, at: Date.now(), log: [{ msgId, at: Date.now(), d: prev ? w - prev.warmth : 0, word, why: 'set by you', first: !prev }, ...(prev?.log || [])].slice(0, 20) };
}

// The prompt layer (group chats only). With one speaker per reply, only the lines involving
// them; reasons only for strong feelings, to keep it short.
export function tiesLayer(chat, people, speakerId = null) {
  if (!people || people.length < 2 || !chat.ties) return '';
  const rows = [];
  for (const a of people)
    for (const b of people) {
      if (a.id === b.id || (speakerId && a.id !== speakerId && b.id !== speakerId)) continue;
      const t = tieOf(chat, a.id, b.id);
      if (t) rows.push([Math.abs(t.warmth), `- ${a.name} → ${b.name}: ${t.word} (${signed(t.warmth)})${t.why && Math.abs(t.warmth) >= 20 ? `, ${t.why}` : ''}`]);
    }
  rows.sort((x, y) => y[0] - x[0]);
  return rows.length ? `How the characters see each other (−100 hostile to 100 close; one line per direction). Let it show in how they talk to and about each other:\n${rows.slice(0, 12).map((r) => r[1]).join('\n')}` : '';
}

// Ties as they stood at a point in the chat (for Branch from here).
export function tiesAt(ties, ids) {
  const out = {};
  for (const [k, t0] of Object.entries(ties || {})) {
    const t = structuredClone(t0);
    t.log = (t.log || []).filter((l) => {
      if (!l.msgId || ids.has(l.msgId)) return true;
      if (l.d) t.warmth = Math.max(-100, Math.min(100, t.warmth - l.d));
      return false;
    });
    if (t.log.some((l) => l.first) || t.set) out[k] = t;
  }
  return out;
}
