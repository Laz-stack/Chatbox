// Import anything people share: a ZIP, a card PNG/JSON (V2/V3), or a SillyTavern lorebook.
// readFiles() turns the files into a plan the review screen shows; applyPlan() saves what was chosen.
import { pngTextChunks, b64utf8 } from './cards.js';
import { complete, PROVIDERS } from './providers.js';
import { extractJson } from './blueprint.js';
import { S, blankCharacter, saveCharacter, saveChat, newChat, LINE_COLORS, saveInterchange, saveLore, saveImages } from './store.js';
import { resizeImage, uid } from './util.js';

// ---------- ZIP (no dependencies: stored or deflate, via the browser's DecompressionStream) ----------
async function unzip(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('This ZIP looks damaged.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const xlen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, start, csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push({ name: name.split('/').pop(), path: name, data });
  }
  return out;
}

// ---------- cards and lorebooks ----------
const str = (v) => (v == null ? '' : String(v));
const isCard = (j) => j && typeof j === 'object' && ((j.data && j.data.name != null) || (j.name != null && (j.first_mes != null || j.description != null)));
const isLorebook = (j) => j && typeof j === 'object' && j.entries && !isCard(j);
const cardData = (j) => (j.data && typeof j.data === 'object' ? j.data : j);

// SillyTavern / V2 character_book entries -> our Lorebook entries.
function loreFrom(book, bookName) {
  const list = Array.isArray(book.entries) ? book.entries : Object.values(book.entries || {});
  return list
    .map((e) => {
      const keys = [].concat(e.key || e.keys || []).map((k) => str(k).trim()).filter(Boolean);
      const text = str(e.content).trim();
      if (!text) return null;
      return {
        title: str(e.comment || e.name || keys[0] || '').trim().slice(0, 80),
        keys: [...new Set(keys)].slice(0, 60),
        text: text.slice(0, 6000),
        always: !!e.constant,
        on: !(e.disable || e.enabled === false),
        book: bookName,
      };
    })
    .filter(Boolean);
}

// Names a multi-character card is about: "A | B | C", "A & B", "A, B and C", or double spaces.
function castNames(d, meta = {}) {
  const sources = [str(meta.janitor_character_chatname), str(d.name)];
  for (const s of sources) {
    const parts = s.split(/\s*\|\s*|\s*&\s*|\s*,\s*|\s+and\s+|\s*\/\s*|\s{2,}/).map((x) => x.trim()).filter((x) => x && x.length <= 30);
    if (parts.length >= 2) return parts;
  }
  return [];
}

// Rules: split the description into chunks ("===" lines, else "# " headings) and match chunk headings to names.
function splitByRules(desc, names) {
  const first = (s) => s.trim().split(/\s+/)[0].toLowerCase();
  let chunks = desc.split(/^\s*={3,}\s*$/m);
  if (chunks.length < 2) chunks = desc.split(/^(?=#\s+[^#])/m);
  const chars = [];
  const world = [];
  for (const c of chunks) {
    const head = c.match(/^\s*#{1,3}\s*([^\n#]+)$/m);
    const title = head ? head[1].trim() : '';
    const hit = title && names.find((n) => first(title) === first(n) || title.toLowerCase().startsWith(n.toLowerCase()));
    if (hit && !chars.some((x) => x.key === first(hit))) {
      const role = c.match(/^#+\s*Role:\s*([^\n]+)/im)?.[1] || '';
      chars.push({ key: first(hit), name: title.replace(/\s+/g, ' ').slice(0, 60), tagline: role.split(/[;.,]/)[0].trim().slice(0, 60), text: c.trim() });
    } else if (c.trim()) world.push(c.trim());
  }
  return { chars, world: world.join('\n\n') };
}

// AI fallback for messy multi-character cards: short sheets per character; the full text stays as world.
async function splitByAI(conn, d, names) {
  const system = 'You organize roleplay character cards. Reply with ONE JSON object and nothing else. Every character is an adult.';
  const ask =
    `This card describes several characters${names.length ? ` (${names.join(', ')})` : ''}. Return {"characters":[{"name":"...","tagline":"short role, under 10 words","sheet":"their appearance, personality, speech and relationships in 120 to 200 words, using only facts from the card"}]}. ` +
    'Only main characters, not background extras.';
  const text = await complete(conn, { system, messages: [{ role: 'user', content: `${str(d.description).slice(0, 30000)}\n\n${ask}` }], stream: false, maxTokens: 3000, temperature: 0.3 });
  const out = extractJson(text);
  return (out.characters || []).filter((c) => c?.name).map((c) => ({ key: str(c.name).toLowerCase(), name: str(c.name).slice(0, 60), tagline: str(c.tagline).slice(0, 80), text: str(c.sheet) }));
}

// Build the plan for one card. kind: 'single' | 'multi' (rules found sections) | 'unsure' (names, no sections).
function planCard(json, image, sourceName) {
  const d = cardData(json);
  const meta = json.metadata || {};
  const names = castNames(d, meta);
  const split = names.length >= 2 ? splitByRules(str(d.description), names) : { chars: [], world: '' };
  const kind = names.length < 2 ? 'single' : split.chars.length >= 2 ? 'multi' : 'unsure';
  const tags = [].concat(d.tags || []).map(str).filter(Boolean);
  const nsfw = !!meta.janitor_is_nsfw || tags.some((t) => /nsfw|18\+|explicit|smut|dead dove/i.test(t));
  const openings = [str(d.first_mes), ...[].concat(d.alternate_greetings || []).map(str)].filter((t) => t.trim());
  const title = str(meta.janitor_character_name || '').trim() || str(d.name).trim();
  return {
    id: uid(),
    sourceName,
    title: title.slice(0, 60) || 'Imported story',
    names,
    kind,
    cast: split.chars,
    world: split.world,
    card: d,
    image,
    tags,
    nsfw,
    creator: str(meta.janitor_creator_name || d.creator || '').replace(/^https?:\/\/\S+$/, '').trim(),
    openings,
    lore: d.character_book ? loreFrom(d.character_book, title) : [],
    blurb: str(d.creator_notes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
  };
}

const readImage = (bytes, name) => resizeImage(new File([bytes], name, { type: 'image/png' }), 512);

// Files in -> { cards: [plan], lore: [entries without a card], errors: [] }.
export async function readFiles(files) {
  const items = [];
  for (const f of files) {
    const buf = await f.arrayBuffer();
    if (/\.zip$/i.test(f.name) || new DataView(buf).getUint32(0, true) === 0x04034b50) items.push(...(await unzip(buf)));
    else items.push({ name: f.name, path: f.name, data: new Uint8Array(buf) });
  }
  const cards = [];
  const loose = [];
  const errors = [];
  const pngs = new Map();
  // PNGs first: a card's image (or a PNG card itself).
  for (const it of items.filter((x) => /\.png$/i.test(x.name))) {
    try {
      const chunks = pngTextChunks(it.data.buffer.slice(it.data.byteOffset, it.data.byteOffset + it.data.byteLength));
      const raw = chunks.ccv3 || chunks.chara;
      const image = await readImage(it.data, it.name);
      if (raw) pngs.set(it.name.replace(/\.png$/i, ''), { json: JSON.parse(b64utf8(raw)), image });
      else pngs.set(it.name.replace(/\.png$/i, ''), { image });
    } catch (e) {
      errors.push(`${it.name}: ${e.message}`);
    }
  }
  const jsons = items.filter((x) => /\.json$/i.test(x.name));
  for (const it of jsons) {
    let j;
    try {
      j = JSON.parse(new TextDecoder().decode(it.data));
    } catch {
      errors.push(`${it.name}: not readable JSON`);
      continue;
    }
    if (j?.app === 'chatbox') {
      errors.push(`${it.name}: this is a full Chatbox backup. Use Depot › Backup › Restore.`);
      continue;
    }
    const base = it.name.replace(/\.json$/i, '');
    if (isCard(j)) {
      const png = pngs.get(base);
      cards.push(planCard(j, png?.image || null, it.name));
      if (png) png.used = true;
    } else if (isLorebook(j)) loose.push(...loreFrom(j, j.name || base.replace(/_?sillytavern_?lorebook/i, '').replace(/[_-]+/g, ' ').trim() || 'Lorebook'));
    else errors.push(`${it.name}: not a card or a lorebook`);
  }
  // PNG cards with no JSON twin.
  for (const [base, png] of pngs) if (png.json && !png.used && !cards.some((c) => c.card.name === cardData(png.json).name)) cards.push(planCard(png.json, png.image, base + '.png'));
  // A lone image beside a single card is its picture.
  if (cards.length === 1 && !cards[0].image) cards[0].image = [...pngs.values()].find((x) => x.image)?.image || null;
  // Loose lorebooks belong to the card when there is exactly one.
  if (cards.length === 1 && loose.length) {
    cards[0].lore.push(...loose.map((e) => ({ ...e, book: cards[0].title })));
    loose.length = 0;
  }
  return { cards, lore: loose, errors };
}

// Ask the AI to find the characters in a messy card (only when the user asks for a Story and rules failed).
export async function resolveUnsure(plan, conn) {
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') return false;
  const cast = await splitByAI(conn, plan.card, plan.names);
  if (cast.length < 2) return false;
  plan.cast = cast;
  plan.world = str(plan.card.description);
  plan.kind = 'multi';
  return true;
}

// ---------- images inside openings: saved into the app when the site allows it ----------
const IMG = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
async function saveMessageImages(texts) {
  let saved = 0;
  let failed = 0;
  for (const t of texts)
    for (const m of t.matchAll(IMG)) {
      const url = m[1];
      if (S.images[url]) continue;
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) throw new Error();
        const blob = await r.blob();
        S.images[url] = await resizeImage(new File([blob], 'img', { type: blob.type || 'image/webp' }), 1024);
        saved++;
      } catch {
        failed++;
      }
    }
  if (saved) await saveImages();
  return { saved, failed };
}

// ---------- save ----------
export const nextColors = (n) => {
  const used = new Set(S.characters.map((c) => c.line?.color));
  const free = LINE_COLORS.filter((c) => !used.has(c) && c !== '#ECECEC' && c !== '#FDCD15');
  return Array.from({ length: n }, (_, i) => free[i] || LINE_COLORS[(S.characters.length + i) % LINE_COLORS.length]);
};

// mode: 'story' (split cast into a One-scene Carriage) or 'narrator' (one character plays everyone).
export async function applyPlan(plan, mode) {
  const d = plan.card;
  const images = await saveMessageImages(plan.openings);
  let target;
  let open;
  if (mode === 'story') {
    const colors = nextColors(plan.cast.length);
    const people = [];
    for (const [i, c] of plan.cast.entries()) {
      const ch = blankCharacter();
      Object.assign(ch, {
        name: c.name,
        tagline: c.tagline || `From ${plan.title}`,
        persona: c.text,
        line: { letter: c.name[0]?.toUpperCase() || 'C', color: colors[i] },
        preset: 'initial',
        mature: plan.nsfw,
        source: { story: plan.title, creator: plan.creator },
      });
      await saveCharacter(ch);
      await saveChat(newChat(ch.id), false);
      people.push(ch);
    }
    const ix = {
      id: 'ix-' + uid(),
      name: plan.title,
      members: people.map((p) => p.id),
      scene: '',
      world: [plan.world, d.scenario && `# Scenario\n${d.scenario}`, d.system_prompt].filter((x) => str(x).trim()).join('\n\n'),
      openings: plan.openings,
      cover: plan.image,
      tags: plan.tags,
      nsfw: plan.nsfw,
      creator: plan.creator,
      blurb: plan.blurb,
      mode: 'scene',
      passengers: true,
      createdAt: Date.now(),
    };
    await saveInterchange(ix);
    await saveChat(newChat(ix.id), false);
    target = ix.id;
    open = `#/chat/${ix.id}`;
  } else {
    const ch = blankCharacter();
    Object.assign(ch, {
      name: (plan.names.length >= 2 ? plan.title : str(d.name)).slice(0, 60),
      tagline: plan.names.length >= 2 ? plan.names.join(', ').slice(0, 80) : str(plan.blurb).split(/[.!?]/)[0].slice(0, 80),
      persona: [str(d.description), d.personality && `Personality: ${d.personality}`, d.system_prompt, d.mes_example && `Example dialogue:\n${d.mes_example}`].filter((x) => str(x).trim()).join('\n\n'),
      scenario: str(d.scenario),
      firstMessage: plan.openings[0] || '',
      greetings: plan.openings.slice(1),
      avatarImage: plan.image,
      preset: plan.image ? 'mika' : 'initial',
      mature: plan.nsfw,
      tags: plan.tags,
      creator: plan.creator,
      source: { story: plan.title, creator: plan.creator },
    });
    await saveCharacter(ch);
    await saveChat(newChat(ch.id), false);
    target = ch.id;
    open = `#/chat/${ch.id}`;
  }
  // Lorebook: tied to what was imported, grouped under the card's name; repeats are skipped.
  let added = 0;
  for (const e of plan.lore) {
    // Already there (the same card imported again): link it to this import too.
    const same = S.lore.find((x) => x.book === e.book && x.title === e.title && x.text === e.text);
    if (same) {
      if (same.scope === 'lines' && !same.lines.includes(target)) same.lines.push(target), added++;
      continue;
    }
    S.lore.push({ id: 'lore-' + uid(), createdAt: Date.now(), ...e, scope: 'lines', lines: [target] });
    added++;
  }
  if (added) await saveLore();
  return { open, lore: added, images };
}

// Lorebooks dropped on their own.
export async function applyLooseLore(entries) {
  let added = 0;
  for (const e of entries) {
    if (S.lore.some((x) => x.book === e.book && x.title === e.title && x.text === e.text)) continue;
    S.lore.push({ id: 'lore-' + uid(), createdAt: Date.now(), ...e, scope: 'all', lines: [] });
    added++;
  }
  if (added) await saveLore();
  return added;
}
