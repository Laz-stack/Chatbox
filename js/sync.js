// Sync: keep characters, chats, lorebooks, personas, groups, pictures and settings in a private
// file in your Google Drive (the hidden app folder), so they survive a cleared browser and
// follow you to other devices.
//
// Sign-in uses Google Identity Services with a client ID you create once (Depot › Sync shows how).
// Each sync downloads the Drive copy, merges it record by record with this device, saves the result
// here and uploads it back. A record changed on only one side takes that side; changed on both, the
// newer edit wins. Deletions travel as "tombstones" so a deleted chat doesn't come back.
import * as db from './db.js';
import { S, saveSettings, saveCharacters, saveConnections, savePersona, saveInterchanges, saveLore, saveImages } from './store.js';

const FILE = 'chatbox-sync.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TOMB_DAYS = 60;
// Settings that belong to this device, not to you.
const LOCAL_SETTINGS = ['sync', 'activeConnectionId', 'helperId', 'lastBackup', 'includeKeysInBackup', 'seenChatTips', 'migrated', 'diaryWho', 'personaId', 'voiceURI', 'readAloud', 'text'];

export const syncPrefs = () => ({ clientId: '', auto: true, keys: false, ...(S.settings.sync || {}) });
export const syncOn = () => !!S.settings.sync?.connected;

// ---------- sign-in ----------
let token = null; // { value, exp }
try {
  const t = JSON.parse(sessionStorage.getItem('chatbox-sync-token') || 'null');
  if (t?.exp > Date.now()) token = t;
} catch {}
const tokenOk = () => token && token.exp > Date.now() + 60e3;
export const signedIn = tokenOk;

let gis = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gis ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => ((gis = null), rej(new Error('Could not reach Google sign-in. Check your connection.')));
    document.head.appendChild(s);
  });
  return gis;
}

// Must run from a tap (Google opens a small sign-in window).
export async function signIn(clientId = syncPrefs().clientId) {
  if (!clientId) throw new Error('Add your Google client ID first.');
  await loadGis();
  return new Promise((res, rej) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r?.error || !r?.access_token) return rej(new Error(r?.error_description || r?.error || 'Sign-in was cancelled.'));
        token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        try {
          sessionStorage.setItem('chatbox-sync-token', JSON.stringify(token));
        } catch {}
        res(token);
      },
      error_callback: (e) => rej(new Error(e?.type === 'popup_closed' ? 'Sign-in was closed before it finished.' : e?.message || 'Sign-in failed.')),
    });
    client.requestAccessToken({ prompt: S.settings.sync?.connected ? '' : 'consent' });
  });
}
export function signOut() {
  if (token && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
  try {
    sessionStorage.removeItem('chatbox-sync-token');
  } catch {}
}

class SyncError extends Error {
  constructor(msg, kind) {
    super(msg);
    this.kind = kind; // 'auth' | 'offline' | 'other'
  }
}
async function drive(url, opts = {}) {
  if (!tokenOk()) throw new SyncError('Sign-in expired.', 'auth');
  let r;
  try {
    r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token.value}`, ...(opts.headers || {}) } });
  } catch {
    if (!navigator.onLine) throw new SyncError('You’re offline. Sync will try again when you’re back.', 'offline');
    throw new SyncError('Couldn’t reach Google Drive. Try again in a moment.', 'other');
  }
  if (r.status === 401) {
    signOut();
    throw new SyncError('Sign-in expired.', 'auth');
  }
  if (r.status === 403) throw new SyncError('Google refused the request. Check that the Drive API is turned on for your client ID.', 'other');
  if (!r.ok) throw new SyncError(`Google Drive error ${r.status}.`, 'other');
  return r;
}
async function findFile() {
  const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
  const r = await drive(`${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime,version,size)`);
  return (await r.json()).files?.[0] || null;
}
async function download(id) {
  const r = await drive(`${API}/${id}?alt=media`);
  return r.json();
}
async function upload(id, body) {
  // Resumable upload: works for any size (pictures can make the file big).
  const meta = id ? {} : { name: FILE, parents: ['appDataFolder'] };
  const start = await drive(`${UPLOAD}${id ? '/' + id : ''}?uploadType=resumable`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(meta) });
  const loc = start.headers.get('Location');
  if (loc) return void (await drive(loc, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }));
  // No session address readable here: fall back to a one-request multipart upload (up to 5 MB).
  const b = 'chatbox' + Date.now();
  const multi = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  await drive(`${UPLOAD}${id ? '/' + id : ''}?uploadType=multipart`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multi });
}

// ---------- records ----------
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}
const settingsPart = () => Object.fromEntries(Object.entries(S.settings).filter(([k]) => !LOCAL_SETTINGS.includes(k)));
// Every synced thing on this device, as key -> data.
function collect(keys) {
  const out = new Map();
  S.characters.forEach((c) => out.set('char:' + c.id, c));
  for (const c of S.chats.values()) out.set('chat:' + c.id, c);
  S.personas.forEach((p) => out.set('persona:' + p.id, p));
  S.interchanges.forEach((x) => out.set('ix:' + x.id, x));
  S.lore.forEach((e) => out.set('lore:' + e.id, e));
  S.connections.forEach((c) => out.set('conn:' + c.id, keys ? c : { ...c, apiKey: '' }));
  Object.entries(S.images || {}).forEach(([k, v]) => out.set('img:' + k, v));
  out.set('settings:main', settingsPart());
  return out;
}
const hashAll = (map) => new Map([...map].map(([k, v]) => [k, hash(JSON.stringify(v))]));
// How this device sees a record: with keys off, a connection is compared without its key.
const viewHash = (k, d, keys) => hash(JSON.stringify(!keys && k.startsWith('conn:') && d ? { ...d, apiKey: '' } : d));
const loadMeta = async () => (await db.get('syncmeta')) || { hashes: {}, at: 0 };

// True when something here changed since the last sync.
export async function localChanges() {
  const meta = await loadMeta();
  const now = hashAll(collect(syncPrefs().keys));
  if (now.size !== Object.keys(meta.hashes).length) return true;
  for (const [k, h] of now) if (meta.hashes[k] !== h) return true;
  return false;
}

// Merge the Drive copy into this device. Returns the new remote file and what changed here.
function merge(local, lh, remote, meta, keys) {
  const rec = { ...(remote?.rec || {}) };
  const del = { ...(remote?.del || {}) };
  const now = Date.now();
  const take = new Map(); // key -> data to write here (null = delete here)
  const all = new Set([...local.keys(), ...Object.keys(rec), ...Object.keys(del)]);
  for (const k of all) {
    const l = local.get(k);
    const r = rec[k];
    const known = meta.hashes[k];
    const lc = l !== undefined && lh.get(k) !== known;
    const rh = r && viewHash(k, r.d, keys);
    const rc = r && rh !== known;
    if (l !== undefined && r) {
      if (lh.get(k) === rh) continue;
      const remoteWins = rc && (!lc || (r.d?.updatedAt || r.at || 0) > (l.updatedAt || 0));
      if (remoteWins) take.set(k, r.d);
      else rec[k] = { at: now, h: lh.get(k), d: l };
      delete del[k];
    } else if (l !== undefined) {
      if (del[k] && !lc) take.set(k, null);
      else {
        rec[k] = { at: now, h: lh.get(k), d: l };
        delete del[k];
      }
    } else if (r) {
      if (known && !rc) {
        delete rec[k];
        del[k] = now;
      } else take.set(k, r.d);
    }
  }
  // Deleted here since the last sync, and never seen remotely as changed.
  for (const k of Object.keys(meta.hashes)) if (!local.has(k) && !rec[k] && !del[k]) del[k] = now;
  for (const [k, t] of Object.entries(del)) if (now - t > TOMB_DAYS * 864e5) delete del[k];
  return { file: { app: 'chatbox-sync', v: 1, at: now, rec, del }, take };
}

// Write the merged records into this device.
async function apply(take) {
  const count = {};
  const dirty = new Set();
  // Update objects in place, so a screen holding one (an open chat) sees the new data.
  const into = (obj, d) => {
    for (const x of Object.keys(obj)) if (!(x in d)) delete obj[x];
    return Object.assign(obj, d);
  };
  const upsert = (arr, d, id) => {
    const i = arr.findIndex((x) => x.id === id);
    if (d === null) i >= 0 && arr.splice(i, 1);
    else if (i >= 0) into(arr[i], d);
    else arr.push(d);
  };
  for (const [k, d] of take) {
    const [kind, ...rest] = k.split(':');
    const id = rest.join(':');
    count[kind] = (count[kind] || 0) + 1;
    if (kind === 'char') upsert(S.characters, d, id), dirty.add('char');
    else if (kind === 'persona') upsert(S.personas, d, id), dirty.add('persona');
    else if (kind === 'ix') upsert(S.interchanges, d, id), dirty.add('ix');
    else if (kind === 'lore') upsert(S.lore, d, id), dirty.add('lore');
    else if (kind === 'conn') {
      const mine = S.connections.find((c) => c.id === id);
      upsert(S.connections, d && { ...d, apiKey: d.apiKey || mine?.apiKey || '' }, id);
      dirty.add('conn');
    } else if (kind === 'img') {
      if (d === null) delete S.images[id];
      else S.images[id] = d;
      dirty.add('img');
    } else if (kind === 'chat') {
      if (d === null) S.chats.delete(id), await db.del('chat:' + id);
      else {
        const cur = S.chats.get(id);
        S.chats.set(id, cur ? into(cur, d) : d);
        await db.set('chat:' + id, S.chats.get(id));
        (count.chatIds ||= []).push(id);
      }
    } else if (kind === 'settings' && d) {
      const keep = Object.fromEntries(LOCAL_SETTINGS.filter((x) => x in S.settings).map((x) => [x, S.settings[x]]));
      S.settings = { ...S.settings, ...d, ...keep };
      dirty.add('settings');
    }
  }
  await Promise.all([
    dirty.has('char') && saveCharacters(),
    dirty.has('persona') && savePersona(),
    dirty.has('ix') && saveInterchanges(),
    dirty.has('lore') && saveLore(),
    dirty.has('conn') && saveConnections(),
    dirty.has('img') && saveImages(),
    dirty.has('settings') && saveSettings(),
  ]);
  return count;
}

// ---------- sync ----------
let running = null;
export function syncNow() {
  running ||= run().finally(() => (running = null));
  return running;
}
export const syncing = () => !!running;

async function run() {
  const prefs = syncPrefs();
  const got = {};
  for (let attempt = 0; ; attempt++) {
    const file = await findFile();
    const remote = file ? await download(file.id) : null;
    if (remote && remote.app !== 'chatbox-sync') throw new SyncError('The file in Drive isn’t a Chatbox sync file.', 'other');
    const meta = await loadMeta();
    const local = collect(prefs.keys);
    const { file: next, take } = merge(local, hashAll(local), remote, meta, prefs.keys);
    const n = await apply(take);
    for (const [k, v] of Object.entries(n)) got[k] = Array.isArray(v) ? [...(got[k] || []), ...v] : (got[k] || 0) + v;
    // Another device uploaded while we merged: merge again on top of theirs.
    const now = await findFile();
    if ((now?.version || null) !== (file?.version || null) && attempt < 3) continue;
    const body = JSON.stringify(next);
    await upload(file?.id || now?.id, body);
    // This device now matches exactly what was uploaded (edits made meanwhile stay "changed").
    const hashes = Object.fromEntries(Object.entries(next.rec).map(([k, r]) => [k, viewHash(k, r.d, prefs.keys)]));
    await db.set('syncmeta', { hashes, at: next.at });
    const ids = got.chatIds || [];
    delete got.chatIds;
    S.settings.sync = { ...syncPrefs(), connected: true, last: { at: next.at, got, bytes: body.length }, error: null };
    await saveSettings();
    if (Object.keys(got).length) dispatchEvent(new CustomEvent('chatbox-synced', { detail: { got, chatIds: ids } }));
    return { got, bytes: body.length };
  }
}

// Record a failure so the Sync page and the Depot row can show it.
export async function noteError(e) {
  S.settings.sync = { ...syncPrefs(), error: { kind: e?.kind || 'other', msg: e?.message || 'Sync failed.', at: Date.now() } };
  await saveSettings();
}

export async function disconnect() {
  signOut();
  await db.del('syncmeta');
  S.settings.sync = { clientId: syncPrefs().clientId, auto: true, keys: false };
  await saveSettings();
}

// ---------- automatic sync ----------
// After changes (and on opening the app), while signed in. With sign-in expired, it waits:
// the Sync page and a one-time note offer "Sign in again".
let timer = 0;
let started = false;
async function autoSync() {
  if (!syncOn() || !syncPrefs().auto || running || !navigator.onLine) return;
  if (!tokenOk()) return;
  // After a failure, wait for a manual Sync now (offline retries when the connection returns).
  const err = syncPrefs().error;
  if (err && err.kind !== 'offline') return;
  if (!(await localChanges()) && Date.now() - (S.settings.sync?.last?.at || 0) < 5 * 60e3) return;
  try {
    await syncNow();
  } catch (e) {
    await noteError(e);
  }
}
export function startAutoSync() {
  if (started) return;
  started = true;
  addEventListener('chatbox-dirty', () => {
    clearTimeout(timer);
    timer = setTimeout(autoSync, 15000);
  });
  addEventListener('online', () => setTimeout(autoSync, 2000));
  setTimeout(autoSync, 3000);
}
