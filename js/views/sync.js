// Depot › Sync: Google Drive sync. A status board (what's synced, when), toggles, Sync now;
// first-time setup with your own Google client ID; expired sign-in and offline states.
import { S, saveSettings } from '../store.js';
import { syncPrefs, syncOn, signedIn, signIn, syncNow, syncing, noteError, disconnect, startAutoSync } from '../sync.js';
import { esc, agoLong, copyText } from '../util.js';
import { topbar, icon, toggleRow, bindSwitch, toast, confirmSheet, arrow } from '../ui.js';

const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const KIND = { chat: 'chat', char: 'character', lore: 'lore entry', img: 'picture', persona: 'persona', ix: 'group', conn: 'connection', settings: 'settings' };
const plural = (n, w) => `${n} ${w === 'lore entry' ? (n === 1 ? w : 'lore entries') : n === 1 || w === 'settings' ? w : w + 's'}`;

// The Depot row's subtitle.
export function syncSummary() {
  const p = syncPrefs();
  if (!syncOn()) return 'Off · keep everything in your Google Drive';
  if (p.error?.kind === 'auth' || !signedIn()) return 'Sign in again to keep syncing';
  if (!navigator.onLine) return 'Offline · will sync when you’re back';
  if (p.error) return 'Last sync didn’t finish · tap to retry';
  return p.last ? `Google Drive · synced ${agoLong(p.last.at)}` : 'Google Drive · not synced yet';
}

export function syncView() {
  const p = syncPrefs();
  return syncOn() ? connectedView(p) : setupView(p);
}

function setupView(p) {
  const origin = location.origin;
  const html = `<div class="screen no-tab sy-screen">
    ${topbar({ back: '#/settings', title: 'Sync' })}
    <div class="sy-board">
      <div class="sy-head"><span>Setup</span><span>3 steps, once</span></div>
      <div class="sy-r"><b>1 · Create a client ID</b><small>In Google Cloud Console › APIs and Services › Credentials, create an OAuth client ID of type Web application.</small></div>
      <div class="sy-r"><b>2 · Allow this address</b><small>Add it under Authorized JavaScript origins:</small>
        <div class="sy-code"><span class="num">${esc(origin)}</span><button type="button" class="press" id="syCopy">${icon('copy', 15)}Copy</button></div></div>
      <div class="sy-r"><b>3 · Turn on the Drive API, paste the ID</b><small>Enable Google Drive API for the same project, then paste the client ID below.</small></div>
    </div>
    <div class="field"><div class="flabel"><label for="syId">Client ID</label></div><input class="input" id="syId" value="${esc(p.clientId)}" placeholder="1234-abc.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></div>
    <p class="fhint">Chatbox keeps one private file in a hidden app folder in your Drive. It can’t see your other files.</p>
    <div class="sticky-cta"><button type="button" class="btn-primary press" id="syGo" ${p.clientId ? '' : 'disabled'}><span>Connect Google Drive</span>${arrow(30)}</button></div>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const id = $('#syId');
      id.addEventListener('input', () => ($('#syGo').disabled = !id.value.trim()));
      $('#syCopy').addEventListener('click', () => copyText(origin).then(() => toast('Address copied')));
      $('#syGo').addEventListener('click', async () => {
        const go = $('#syGo');
        const clientId = id.value.trim();
        S.settings.sync = { ...syncPrefs(), clientId };
        await saveSettings();
        go.classList.add('busy');
        go.disabled = true;
        try {
          await signIn(clientId);
          go.querySelector('span').textContent = 'Syncing…';
          await syncNow();
          startAutoSync();
          toast('Connected. Everything is in your Drive.');
          dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (e) {
          toast(e.message || 'Could not connect.', { kind: 'err' });
          go.classList.remove('busy');
          go.disabled = false;
          go.querySelector('span').textContent = 'Connect Google Drive';
        }
      });
    },
  };
}

function connectedView() {
  const state = () => {
    const p = syncPrefs();
    if (!navigator.onLine) return 'offline';
    if (!signedIn() || p.error?.kind === 'auth') return 'expired';
    if (p.error) return 'error';
    return 'ok';
  };
  const plate = () => {
    const s = state();
    const p = syncPrefs();
    if (s === 'expired') return `<div class="sy-plate cream">${icon('lock', 18)}<span><b>Sign-in expired</b>Google sign-ins last about an hour. Sign in again to keep syncing.</span></div>`;
    if (s === 'offline') return `<div class="sy-plate">${icon('refresh', 18)}<span><b>Offline</b>Will sync when you’re back.</span></div>`;
    if (s === 'error') return `<div class="sy-plate">${icon('x', 18)}<span><b>Last sync didn’t finish</b>${esc(p.error.msg)}</span></div>`;
    return `<div class="sy-plate">${icon('check', 18)}<span><b>Google Drive connected</b>Your private Chatbox folder${p.last?.bytes ? ` · ${mb(p.last.bytes)}` : ''}</span></div>`;
  };
  const board = () => {
    const p = syncPrefs();
    const got = p.last?.got || {};
    const fromOther = (k) => (got[k] ? `${plural(got[k], KIND[k])} updated from your other device` : 'No changes from other devices');
    const lore = S.lore.length;
    const pics = Object.keys(S.images || {}).length;
    const at = p.last?.at;
    return `<div class="sy-board">
      <div class="sy-head"><span>Last sync</span><span class="num" id="syAt">${at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + agoLong(at) : 'Not yet'}</span></div>
      <div class="sy-r"><b>Chats</b><em class="num">${S.chats.size}</em><small>${fromOther('chat')}</small></div>
      <div class="sy-r"><b>Characters</b><em class="num">${S.characters.length}</em><small>${fromOther('char')}</small></div>
      <div class="sy-r"><b>Lorebook</b><em class="num">${lore}</em><small>${fromOther('lore')}</small></div>
      <div class="sy-r"><b>Pictures</b><em class="num">${pics}</em><small>Saved pictures and avatars</small></div>
    </div>`;
  };
  const cta = () => (state() === 'expired' ? 'Sign in again' : syncing() ? 'Syncing…' : 'Sync now');
  const p0 = syncPrefs();
  const html = `<div class="screen no-tab sy-screen">
    ${topbar({ back: '#/settings', title: 'Sync' })}
    <div id="syPlate">${plate()}</div>
    <div id="syBoard">${board()}</div>
    <div class="sy-togs">${toggleRow('syAuto', 'Sync automatically', 'After changes, while you’re signed in', p0.auto)}
      ${toggleRow('syKeys', 'Include API keys', 'Off keeps keys on each device', p0.keys)}</div>
    <button type="button" class="sy-off press" id="syOff">${icon('x', 17)}Disconnect Google Drive</button>
    <div class="sticky-cta"><button type="button" class="btn-primary press" id="syGo" ${state() === 'offline' ? 'disabled' : ''}><span>${cta()}</span>${icon('refresh', 24)}</button></div>
  </div>`;
  return {
    html,
    depth: 2,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const redraw = (pop = false) => {
        $('#syPlate').innerHTML = plate();
        $('#syBoard').innerHTML = board();
        if (pop) $('#syPlate .sy-plate')?.classList.add('pop'), $('#syAt')?.classList.add('pop');
        const go = $('#syGo');
        go.querySelector('span').textContent = cta();
        go.disabled = state() === 'offline' || syncing();
      };
      bindSwitch($('#syAuto'), async (v) => ((S.settings.sync = { ...syncPrefs(), auto: v }), await saveSettings()));
      bindSwitch($('#syKeys'), async (v) => ((S.settings.sync = { ...syncPrefs(), keys: v }), await saveSettings(), toast(v ? 'Keys will sync too. Turn this off on shared devices.' : 'Keys stay on each device')));
      const onNet = () => (root.isConnected && $('#syPlate') ? redraw() : (removeEventListener('online', onNet), removeEventListener('offline', onNet)));
      addEventListener('online', onNet);
      addEventListener('offline', onNet);
      $('#syGo').addEventListener('click', async () => {
        const go = $('#syGo');
        go.classList.add('busy');
        go.disabled = true;
        try {
          if (state() === 'expired' || !signedIn()) await signIn();
          go.querySelector('span').textContent = 'Syncing…';
          const r = await syncNow();
          const n = Object.values(r.got).reduce((a, b) => a + b, 0);
          toast(n ? `Synced · ${n} update${n === 1 ? '' : 's'} from your other device` : 'Synced');
        } catch (e) {
          await noteError(e);
          toast(e.message || 'Sync failed.', { kind: 'err' });
        }
        go.classList.remove('busy');
        redraw(true);
      });
      $('#syOff').addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Disconnect Google Drive?', body: 'This device stops syncing. Your Drive copy stays, so you can connect again later.', ok: 'Disconnect', danger: true }))) return;
        await disconnect();
        toast('Disconnected');
        dispatchEvent(new HashChangeEvent('hashchange'));
      });
    },
  };
}
