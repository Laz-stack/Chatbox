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

function req(mode, fn) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        if (!db) return res(fn(null));
        const t = db.transaction(STORE, mode);
        const s = t.objectStore(STORE);
        const r = fn(s);
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      })
  );
}

export async function get(k) {
  await open();
  if (memory) return structuredClone(memory.get(k));
  return req('readonly', (s) => s.get(k));
}

export async function set(k, v) {
  await open();
  if (memory) return void memory.set(k, structuredClone(v));
  return req('readwrite', (s) => s.put(v, k));
}

export async function del(k) {
  await open();
  if (memory) return void memory.delete(k);
  return req('readwrite', (s) => s.delete(k));
}

export async function entries() {
  await open();
  if (memory) return [...memory.entries()];
  const keys = await req('readonly', (s) => s.getAllKeys());
  const vals = await req('readonly', (s) => s.getAll());
  return keys.map((k, i) => [k, vals[i]]);
}

export async function clear() {
  await open();
  if (memory) return void memory.clear();
  return req('readwrite', (s) => s.clear());
}
