// Boot + hash router with View Transitions between screens.
import { load } from './store.js';
import { homeView } from './views/home.js';
import { chatView } from './views/chat.js';
import { editorView } from './views/editor.js';
import { settingsView, personasView, personaView, backupView } from './views/settings.js';
import { linesView } from './views/lines.js';
import { importView, startImport } from './views/import.js';
import { textView } from './views/text.js';
import { syncView } from './views/sync.js';
import { scenesView } from './views/scenes.js';
import { startAutoSync, syncOn, signedIn, localChanges } from './sync.js';
import { applyText } from './textstyle.js';
import { startDim } from './dim.js';
import { openBuildSheet } from './build.js';
import { reducedMotion } from './util.js';
import { toast, closeOverlays } from './ui.js';

const app = document.getElementById('app');

// Screens you open less often are loaded the first time you go to them.
const LAZY = ['connections', 'prompts', 'fares', 'interchange', 'lore', 'chronicle', 'adventure', 'worldmap', 'frompicture'];
const view = (mod) =>
  import(`./views/${mod}.js`).catch((e) => {
    toast(navigator.onLine ? 'That screen didn’t load. Try again.' : 'That screen needs a connection the first time you open it.', { kind: 'err' });
    throw e;
  });
// Once the app is idle, fetch those screens in the background so they also work offline later.
(window.requestIdleCallback || ((f) => setTimeout(f, 3000)))(() => LAZY.forEach((m) => import(`./views/${m}.js`).catch(() => {})));
const routes = [
  [/^#?\/?$/, () => homeView()],
  [/^#\/chat\/([^/]+)(?:\/m\/([^/]+))?$/, (id, m) => chatView(decodeURIComponent(id), m && decodeURIComponent(m))],
  [/^#\/lines(?:\/(\w+))?$/, (f) => linesView(f)],
  [/^#\/fares$/, async () => (await view('fares')).faresView()],
  [/^#\/lore$/, async () => (await view('lore')).loreListView()],
  [/^#\/lore\/book\/(.+)$/, async (k) => (await view('lore')).loreBookView(k)],
  [/^#\/lore\/new\/(.+)$/, async (k) => (await view('lore')).loreEditView('new', k)],
  [/^#\/import$/, () => importView()],
  [/^#\/text$/, () => textView()],
  [/^#\/lore\/([^/]+)$/, async (id) => (await view('lore')).loreEditView(decodeURIComponent(id))],
  [/^#\/interchange\/([^/]+)$/, async (id) => (await view('interchange')).interchangeView(decodeURIComponent(id))],
  [/^#\/edit\/([^/]+)$/, (id) => editorView(decodeURIComponent(id))],
  [/^#\/settings$/, () => settingsView()],
  [/^#\/connections(?:\/(pictures))?$/, async (x) => (await view('connections')).connectionsView(x)],
  [/^#\/connection\/([^/]+)$/, async (id) => (await view('connections')).connectionEditView(decodeURIComponent(id))],
  [/^#\/prompts$/, async () => (await view('prompts')).promptsView()],
  [/^#\/final\/([^/]+)$/, async (id) => (await view('prompts')).finalView(decodeURIComponent(id))],
  [/^#\/memory\/([^/]+)$/, async (id) => (await view('prompts')).memoryView(decodeURIComponent(id))],
  [/^#\/sync$/, () => syncView()],
  [/^#\/adventure\/([^/]+)$/, async (id) => (await view('adventure')).adventureView(decodeURIComponent(id))],
  [/^#\/map\/([^/]+)$/, async (id) => (await view('worldmap')).worldMapView(decodeURIComponent(id))],
  [/^#\/from-picture$/, async () => (await view('frompicture')).fromPictureView()],
  [/^#\/route\/([^/]+)$/, async (id) => (await view('chronicle')).routeView(decodeURIComponent(id))],
  [/^#\/bonds\/([^/]+)(?:\/(them))?$/, async (id, t) => (await view('chronicle')).bondsView(decodeURIComponent(id), t || 'you')],
  [/^#\/diary\/([^/]+)(?:\/([^/]+))?$/, async (id, e) => (await view('chronicle')).diaryView(decodeURIComponent(id), e && decodeURIComponent(e))],
  [/^#\/persona$/, () => personasView()],
  [/^#\/persona\/([^/]+)$/, (id) => personaView(decodeURIComponent(id))],
  [/^#\/backup$/, () => backupView()],
  [/^#\/scenes$/, () => scenesView()],
];

let current = null;
let depth = 0;
let seq = 0;
let lastKind = '';

// Shared-element continuity between Home and a chat: the avatar you tapped (hero tile,
// Lines badge or Departures badge, marked data-av="kind:id") flies into the chat header
// avatar (data-av="head:id") and back to the same spot on return.
let origin = null; // e.g. "hero:mika"
// Where the last tap landed: the next screen grows out of that point.
let tap = null;
document.addEventListener(
  'click',
  (e) => {
    const a = e.target.closest?.('a[href^="#/chat/"]');
    const av = a?.querySelector('[data-av]');
    if (av) origin = av.dataset.av;
    // detail 0 = keyboard "click": no finger position, so no tap origin.
    tap = e.detail ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  },
  true
);
// On short screens the tab bar slides away while you scroll down a list and returns when you scroll up
// (CSS only applies it below 700px tall).
let lastY = 0;
addEventListener('scroll', () => {
  const y = scrollY;
  if (Math.abs(y - lastY) < 6) return;
  document.documentElement.classList.toggle('tb-away', y > lastY && y > 80);
  lastY = y;
}, { passive: true });
addEventListener('hashchange', () => ((lastY = 0), document.documentElement.classList.remove('tb-away')));
// Keyboard focus on the bar brings it back.
document.addEventListener('focusin', (e) => e.target.closest?.('.tabbar') && document.documentElement.classList.remove('tb-away'));

// The Platform hero's train hands over the point the chat should open from (its tunnel), after its run.
document.addEventListener('chatbox:depart', (e) => (tap = { x: e.detail.x, y: e.detail.y, t: performance.now() }));
const routeKind = (h) => (/^#\/chat\//.test(h) ? 'chat' : /^#?\/?$/.test(h) ? 'home' : /^#\/lines/.test(h) ? 'lines' : 'other');

// Names stay on a node after a transition; clear them so the next (unrelated) one has no orphans.
const clearShared = (root) => root.querySelectorAll('[data-av]').forEach((n) => (n.style.viewTransitionName = ''));

function tagShared(root, toChat) {
  let el = (origin?.startsWith('hero:') && root.querySelector(`.win.has-pic:not(.fold) [data-av="win:${origin.split(':')[1]}"]`)) || root.querySelector('[data-av^="head:"]');
  if (!el) {
    const id = origin?.split(':')[1];
    el = (origin && root.querySelector(`[data-av="${origin}"]`)) || (id && root.querySelector(`[data-av="line:${id}"]`));
  }
  if (!el) return;
  const id = el.dataset.av.split(':')[1];
  el.style.viewTransitionName = 'av-' + id.replace(/[^\w-]/g, '_');
  // The landing spot must hold still: switch off its own entrance (and any animated ancestor's)
  // so the transition lands on its final position, not a scaled-down first frame.
  for (let n = el; n && n !== root; n = n.parentElement) {
    if (getComputedStyle(n).animationName !== 'none') n.style.animation = 'none';
  }
}

// Toasts belong to the screen that raised them; drop stale ones when the screen changes.
function clearStaleToasts() {
  const now = Date.now();
  document.querySelectorAll('#toast-root .toast').forEach((t) => {
    if (now - (+t.dataset.t || 0) > 700) t.remove();
  });
}

async function resolve(hash) {
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) return (await fn(...m.slice(1))) || null;
  }
  return null;
}

async function render() {
  const my = ++seq;
  const view = await resolve(location.hash || '#/');
  if (my !== seq) return;
  if (!view) {
    // A link to something that isn't here (a deleted chat, an old bookmark): say so, then go home.
    if (location.hash && location.hash !== '#/' && location.hash !== '#') toast('That page isn’t here any more. Back to Platform.');
    location.replace('#/');
    return;
  }
  const dir = (view.depth ?? 0) < depth ? 'back' : 'fwd';
  // The tab bar holds still only when both screens have it (Home <-> Settings).
  document.documentElement.classList.toggle('vt-tabs', depth === 0 && (view.depth ?? 0) === 0);
  depth = view.depth ?? 0;
  document.documentElement.dataset.dir = dir;
  const kind = routeKind(location.hash || '#/');
  const listy = (k) => k === 'home' || k === 'lines';
  const shared = (listy(lastKind) && kind === 'chat') || (lastKind === 'chat' && listy(kind));
  lastKind = kind;
  document.body.dataset.route = kind;
  clearStaleToasts();
  closeOverlays();

  const swap = () => {
    current?.unmount?.();
    current = view;
    app.innerHTML = view.html;
    if (shared) tagShared(app, false);
    window.scrollTo(0, 0);
    return view.mount?.(app);
  };
  // In dim mode the screen changes without a view transition: its snapshots would be drawn above the dim layer.
  if (document.startViewTransition && !reducedMotion() && current && !document.documentElement.classList.contains('dim')) {
    clearShared(app);
    if (shared) tagShared(app, kind === 'chat');
    // A fresh tap (not a back gesture or keyboard) sets the point the new screen grows from.
    const html = document.documentElement;
    const fromTap = tap && performance.now() - tap.t < 1200;
    if (fromTap) {
      const r = Math.hypot(Math.max(tap.x, innerWidth - tap.x), Math.max(tap.y, innerHeight - tap.y));
      html.style.setProperty('--tx', tap.x + 'px');
      html.style.setProperty('--ty', tap.y + 'px');
      html.style.setProperty('--tr', Math.ceil(r) + 'px');
    }
    html.classList.toggle('vt-tap', !!fromTap);
    tap = null;
    const t = document.startViewTransition(swap);
    // A transition skipped by a quick second tap isn't an error worth a toast.
    t.ready.catch(() => {});
    t.updateCallbackDone?.catch(() => {});
    t.finished.catch(() => {}).finally(() => html.classList.remove('vt-tap'));
  } else {
    await swap();
  }
}

window.addEventListener('hashchange', render);

// Long text boxes grow with what you type (they also open up when focused, see app.css).
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.matches?.('textarea.input.area')) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight + 4, innerHeight * 0.7) + 'px';
});
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t.matches?.('textarea.input.area')) setTimeout(() => t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
});

// The red Build stop in the bar opens the Build sheet on any screen that shows the bar.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-build]')) openBuildSheet();
});

// Service worker: makes reloads pick up new deploys and lets the app open offline.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Drop a ZIP, card or lorebook anywhere to import it.
addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
});
addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  startImport(e.dataTransfer.files);
});

// New versions: an open tab keeps running the code it loaded. GitHub Pages stamps every file with the
// deploy time, so when that stamp changes (checked on coming back to the app, and every few minutes)
// offer a reload. Busy screens are never reloaded on their own.
let builtAt = null;
const deployStamp = () =>
  fetch('index.html', { method: 'HEAD', cache: 'no-store' })
    .then((r) => (r.ok ? r.headers.get('last-modified') : null))
    .catch(() => null);
let offered = false;
async function checkForUpdate() {
  if (offered || !location.protocol.startsWith('http')) return;
  const now = await deployStamp();
  if (!now) return;
  if (!builtAt) return void (builtAt = now);
  if (now === builtAt) return;
  offered = true;
  toast('A new version of Chatbox is ready.', { action: 'Reload', ms: 15000, onAction: () => location.reload() });
}
checkForUpdate();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkForUpdate());
setInterval(checkForUpdate, 5 * 60 * 1000);

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(e.reason?.message || 'Something went wrong.', { kind: 'err' });
});

(async () => {
  try {
    await load();
    applyText();
    startDim();
  } catch (e) {
    console.error(e);
    toast('Could not open saved data. Starting fresh for this session.', { kind: 'err' });
  }
  await render();
  document.documentElement.classList.add('ready');
  // Sync: run in the background while signed in. When changes from another device arrive, redraw
  // list screens (never a chat you might be typing in). With sign-in expired and changes waiting,
  // offer to sign in again once per session.
  startAutoSync();
  // Tidy scene pictures nothing points to any more (deleted messages and chats).
  import('./pictures.js').then((m) => m.gcPictures()).catch(() => {});
  addEventListener('chatbox-synced', () => /^#\/(lines|settings|sync)?(\/|$)|^#?\/?$/.test(location.hash) && render());
  if (syncOn()) {
    setTimeout(async () => {
      if (signedIn() || sessionStorage.getItem('chatbox-sync-asked') || !(await localChanges())) return;
      sessionStorage.setItem('chatbox-sync-asked', '1');
      toast('Sync is paused until you sign in again.', { action: 'Sign in', ms: 8000, onAction: () => (location.hash = '#/sync') });
    }, 4000);
  }
})();
