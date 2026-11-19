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
  depth = view.depth ?? 0;
  document.documentElement.dataset.dir = dir;

  const swap = () => {
    current?.unmount?.();
    current = view;
    app.innerHTML = view.html;
    window.scrollTo(0, 0);
    return view.mount?.(app);
  };
  if (document.startViewTransition && !reducedMotion() && current) {
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
