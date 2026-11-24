// Small copies of pictures for the places they're shown small (avatars in lists, chat headers,
// bubbles, group pictures). A character picture can be ~1 MP; drawing it at 32px everywhere means the
// whole image is decoded and held many times over. Here each picture gets one 192px copy, made once
// in the background and kept in memory only (nothing extra is stored or synced). Until it's ready the
// full picture is used, then images already on screen switch over.
// Keyed by a short fingerprint of the picture (not the picture itself), and capped.
const cache = new Map();
const CAP = 240;
const key = (src, max) => `${max}:${src.length}:${src.slice(-48)}:${src.slice(64, 112)}`;
const queue = new Map(); // key -> { src, max }
let busy = false;

// A smaller copy of a picture (longest side `max`, 192 for avatars, larger for picture cards) if it's
// ready; otherwise the picture itself (and a copy is queued). Images marked data-small="<max>"
// (or data-small for 192) switch over when it's ready.
export function small(src, max = 192) {
  if (!src || typeof src !== 'string') return src;
  const k = key(src, max);
  const hit = cache.get(k);
  if (hit !== undefined) return hit || src; // '' = no smaller copy possible, use the picture
  if (src.startsWith('data:image/') && src.length > 40000) {
    queue.set(k, { src, max });
    if (!busy) setTimeout(run, 300);
  }
  return src;
}

async function make(src, max) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (s >= 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  // Big copies (picture cards) keep more detail than avatar-sized ones.
  return c.toDataURL('image/webp', max > 400 ? 0.93 : 0.86);
}

async function run() {
  if (busy) return;
  busy = true;
  try {
    for (const [k, { src, max }] of [...queue]) {
      queue.delete(k);
      if (cache.has(k)) continue;
      const t = await make(src, max).catch(() => src);
      cache.set(k, t === src ? '' : t);
      while (cache.size > CAP) cache.delete(cache.keys().next().value);
      if (t === src) continue;
      // Pictures already on screen at this size switch to the copy.
      for (const el of document.querySelectorAll('img[data-small]')) if (el.getAttribute('src') === src && (+el.dataset.small || 192) === max) el.setAttribute('src', t);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    busy = false;
    if (queue.size) setTimeout(run, 100);
  }
}
