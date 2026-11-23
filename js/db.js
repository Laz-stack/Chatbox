// Tiny key-value store on IndexedDB, with an in-memory fallback
// (private browsing in some browsers blocks IndexedDB).

const DB = 'chatbox';
const STORE = 'kv';
let dbp = null;
let memory = null;

function open() {
  if (memory) return Promise.resolve(null);
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) {
        rej(e);
      }
    }).catch((e) => {
      console.warn('IndexedDB unavailable, data will not persist', e);
      memory = new Map();
      return null;
    });
  }
  return dbp;
}

export const persistent = () => !memory;

// The phone's storage is full: say so in words, and what to do.
export class StorageFull extends Error {
  constructor() {
    super('Your phone’s storage for Chatbox is full. Delete some pictures or old chats (or make a backup and clear some), then try again.');
    this.name = 'StorageFull';
  }
}
const friendly = (e) => (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) ? new StorageFull() : e);

// Ask the browser to keep Chatbox's data even when space runs low (it may say no; nothing changes then).
export async function keepData() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {}
}

function req(mode, fn) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        if (!db) return res(fn(null));
        const t = db.transaction(STORE, mode);
        const s = t.objectStore(STORE);
        const r = fn(s);
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
        t.onerror = () => rej(friendly(t.error));
        t.onabort = () => rej(friendly(t.error));
      })
  );
}

export async function get(k) {
  await open();
  if (memory) return structuredClone(memory.get(k));
  return req('readonly', (s) => s.get(k));
}

// Tell Sync that something changed (it waits a little, then syncs if anything really did).
const dirty = (k) => k !== 'syncmeta' && typeof dispatchEvent === 'function' && dispatchEvent(new Event('chatbox-dirty'));

export async function set(k, v) {
  await open();
  dirty(k);
  if (memory) return void memory.set(k, structuredClone(v));
  return req('readwrite', (s) => s.put(v, k));
}

export async function del(k) {
  await open();
  dirty(k);
  if (memory) return void memory.delete(k);
  return req('readwrite', (s) => s.delete(k));
}

export async function entries() {
  await open();
  if (memory) return [...memory.entries()];
  // Keys and values from one read, so a write landing in between can't pair them up wrongly.
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly');
    const s = t.objectStore(STORE);
    const k = s.getAllKeys();
    const v = s.getAll();
    t.oncomplete = () => res(k.result.map((key, i) => [key, v.result[i]]));
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export async function keys() {
  await open();
  if (memory) return [...memory.keys()];
  return req('readonly', (s) => s.getAllKeys());
}

export async function clear() {
  await open();
  if (memory) return void memory.clear();
  return req('readwrite', (s) => s.clear());
}
