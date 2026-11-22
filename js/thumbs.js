// Small copies of pictures for the places they're shown small (avatars in lists, chat headers,
// bubbles, group pictures). A character picture can be ~1 MP; drawing it at 32px everywhere means the
// whole image is decoded and held many times over. Here each picture gets one 192px copy, made once
// in the background and kept in memory only (nothing extra is stored or synced). Until it's ready the
// full picture is used, then images already on screen switch over.
const cache = new Map();
const queue = new Set();
let busy = false;
const MAX = 192;

// The small copy of a picture if it's ready; otherwise the picture itself (and a copy is queued).
export function small(src) {
  if (!src || typeof src !== 'string') return src;
  const hit = cache.get(src);
  if (hit) return hit;
  if (src.startsWith('data:image/') && src.length > 40000) {
    queue.add(src);
    if (!busy) setTimeout(run, 300);
  }
  return src;
}

async function make(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  if (s >= 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.86);
}

async function run() {
  if (busy) return;
  busy = true;
  try {
    for (const src of [...queue]) {
      queue.delete(src);
      if (cache.has(src)) continue;
      const t = await make(src).catch(() => src);
      cache.set(src, t);
      if (t === src) continue;
      // Pictures already on screen at a small size switch to the copy.
      for (const el of document.querySelectorAll('img[data-small]')) if (el.getAttribute('src') === src) el.setAttribute('src', t);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    busy = false;
    if (queue.size) setTimeout(run, 100);
  }
}
