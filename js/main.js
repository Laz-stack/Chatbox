// Boot + hash router with View Transitions between screens.
import { load } from './store.js';
import { homeView } from './views/home.js';
import { chatView } from './views/chat.js';
import { editorView } from './views/editor.js';
import { connectionsView, connectionEditView } from './views/connections.js';
import { promptsView, finalView, memoryView } from './views/prompts.js';
import { settingsView, personaView, backupView } from './views/settings.js';
import { reducedMotion } from './util.js';
import { toast } from './ui.js';

const app = document.getElementById('app');

const routes = [
  [/^#?\/?$/, () => homeView()],
  [/^#\/chat\/([^/]+)$/, (id) => chatView(decodeURIComponent(id))],
  [/^#\/edit\/([^/]+)$/, (id) => editorView(decodeURIComponent(id))],
  [/^#\/settings$/, () => settingsView()],
  [/^#\/connections$/, () => connectionsView()],
  [/^#\/connection\/([^/]+)$/, (id) => connectionEditView(decodeURIComponent(id))],
  [/^#\/prompts$/, () => promptsView()],
  [/^#\/final\/([^/]+)$/, (id) => finalView(decodeURIComponent(id))],
  [/^#\/memory\/([^/]+)$/, (id) => memoryView(decodeURIComponent(id))],
  [/^#\/persona$/, () => personaView()],
  [/^#\/backup$/, () => backupView()],
];

let current = null;
let depth = 0;
let seq = 0;
let lastKind = '';

// Shared-element continuity between Home and a chat: the avatar you tapped (hero tile,
// Lines badge or Departures badge, marked data-av="kind:id") flies into the chat header
// avatar (data-av="head:id") and back to the same spot on return.
let origin = null; // e.g. "hero:mika"
document.addEventListener(
  'click',
  (e) => {
    const a = e.target.closest?.('a[href^="#/chat/"]');
    const av = a?.querySelector('[data-av]');
    if (av) origin = av.dataset.av;
  },
  true
);
const routeKind = (h) => (/^#\/chat\//.test(h) ? 'chat' : /^#?\/?$/.test(h) ? 'home' : 'other');

function tagShared(root) {
  let el = root.querySelector('[data-av^="head:"]');
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
    location.replace('#/');
    return;
  }
  const dir = (view.depth ?? 0) < depth ? 'back' : 'fwd';
  // The tab bar holds still only when both screens have it (Home <-> Settings).
  document.documentElement.classList.toggle('vt-tabs', depth === 0 && (view.depth ?? 0) === 0);
  depth = view.depth ?? 0;
  document.documentElement.dataset.dir = dir;
  const kind = routeKind(location.hash || '#/');
  const shared = (lastKind === 'home' && kind === 'chat') || (lastKind === 'chat' && kind === 'home');
  lastKind = kind;
  document.body.dataset.route = kind;
  clearStaleToasts();

  const swap = () => {
    current?.unmount?.();
    current = view;
    app.innerHTML = view.html;
    if (shared) tagShared(app);
    window.scrollTo(0, 0);
    return view.mount?.(app);
  };
  if (document.startViewTransition && !reducedMotion() && current) {
    if (shared) tagShared(app);
    const t = document.startViewTransition(swap);
    t.finished.catch(() => {});
  } else {
    await swap();
  }
}

window.addEventListener('hashchange', render);

// Service worker: makes reloads pick up new deploys and lets the app open offline.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(e.reason?.message || 'Something went wrong.', { kind: 'err' });
});

(async () => {
  try {
    await load();
  } catch (e) {
    console.error(e);
    toast('Could not open saved data. Starting fresh for this session.', { kind: 'err' });
  }
  await render();
  document.documentElement.classList.add('ready');
})();
