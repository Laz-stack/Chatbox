// Import from a link: paste a link to a card (PNG, JSON, a ZIP of cards and lorebooks, CHARX) and it
// goes to the usual import review. The browser can only download it if the site allows other apps to
// (GitHub, most file hosts do); when Chatbox runs with its local server, any link works. Sites that
// don't allow it (Datacat, character hubs that need a login) get a two-step way through instead:
// open it there, tap their Download, and pick the file here.
import { proxyAvailable } from './providers.js';
import { startImport } from './views/import.js';
import { openSheet, icon, toast } from './ui.js';
import { esc } from './util.js';

const CARD = /\.(png|json|zip|charx)(\?|#|$)/i;
const known = (host) =>
  /(^|\.)datacat\.run$/.test(host) ? 'Datacat' : /(^|\.)chub\.ai$/.test(host) ? 'Chub' : /(^|\.)janitorai\.com$/.test(host) ? 'JanitorAI' : /(^|\.)characterhub\.org$/.test(host) ? 'CharacterHub' : '';

function nameFrom(url, res) {
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (m) return decodeURIComponent(m[1]);
  const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'card');
  return CARD.test(last) ? last : last + extFor(res.headers.get('content-type') || '');
}
const extFor = (t) => (/png/.test(t) ? '.png' : /json/.test(t) ? '.json' : /zip/.test(t) ? '.zip' : '');

// Returns a File, or throws { blocked: true } when the site doesn't let the browser download it.
async function download(url, viaProxy) {
  const res = viaProxy ? await fetch('proxy', { headers: { 'x-target-url': url } }) : await fetch(url, { credentials: 'omit' });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('That link needs a login on its site.'), { blocked: true });
  if (!res.ok) throw new Error(`The link answered ${res.status}. Check it and try again.`);
  const type = res.headers.get('content-type') || '';
  // A web page, not a file: the card is behind the site's own Download button.
  if (/text\/html/.test(type)) throw Object.assign(new Error('That link is a page, not a card file.'), { blocked: true, page: true });
  const blob = await res.blob();
  if (blob.size > 60e6) throw new Error('That file is over 60 MB.');
  return new File([blob], nameFrom(url, res), { type: blob.type || type });
}

export async function fetchCardLink(url) {
  try {
    return await download(url, false);
  } catch (e) {
    if (e.blocked && !e.page) throw e;
    // "Failed to fetch": the site doesn't allow other apps to download. The local server can.
    if (e.name === 'TypeError' || e.page) {
      if (await proxyAvailable().catch(() => false)) {
        try {
          return await download(url, true);
        } catch (e2) {
          throw Object.assign(e2, { blocked: true, page: e2.page || e.page });
        }
      }
      throw Object.assign(new Error('That site doesn’t let other apps download its characters.'), { blocked: true, page: e.page });
    }
    throw e;
  }
}

export function linkImportSheet() {
  openSheet({
    label: 'Import from a link',
    html: `<h2 class="sheet-title">Import from a link</h2><p class="sheet-p">A link to a card: a PNG, JSON or ZIP file, or a character page.</p>
      <form id="liF" novalidate><div class="li-row"><input class="mk-in" id="liIn" type="url" inputmode="url" placeholder="https://…" aria-label="Link" autocomplete="off" spellcheck="false">${navigator.clipboard?.readText ? `<button type="button" class="li-paste press" id="liPaste">${icon('copy', 15)}Paste</button>` : ''}</div>
      <div class="sheet-actions"><button type="submit" class="btn-primary press" id="liGo"><span>Import</span></button></div></form>
      <div id="liOut" aria-live="polite"></div>`,
    onMount(s, close) {
      const inp = s.querySelector('#liIn');
      const out = s.querySelector('#liOut');
      setTimeout(() => inp.focus(), 80);
      s.querySelector('#liPaste')?.addEventListener('click', async () => {
        try {
          inp.value = (await navigator.clipboard.readText()).trim();
        } catch {
          toast('Paste it into the box instead (long-press › Paste).');
        }
      });
      s.querySelector('#liF').addEventListener('submit', async (e) => {
        e.preventDefault();
        let url;
        try {
          url = new URL(inp.value.trim());
          if (!/^https?:$/.test(url.protocol)) throw 0;
        } catch {
          return (out.innerHTML = `<p class="li-msg">That isn’t a link. It starts with https://</p>`), inp.focus();
        }
        const go = s.querySelector('#liGo');
        go.disabled = true;
        go.querySelector('span').textContent = 'Fetching…';
        out.innerHTML = '';
        try {
          const file = await fetchCardLink(url.href);
          close();
          startImport([file]);
        } catch (err) {
          go.disabled = false;
          go.querySelector('span').textContent = 'Import';
          if (!err.blocked) return (out.innerHTML = `<p class="li-msg">${esc(err.message || 'That didn’t work.')}</p>`);
          // The two-step way through: open it there, download, pick the file here.
          const site = known(url.hostname) || url.hostname.replace(/^www\./, '');
          const dc = site === 'Datacat' ? `<a class="li-step press li-dc" href="#/datacat">${icon('search', 16)}<span><b>Browse Datacat in Chatbox</b><small>Tap Import on a character and it comes straight here</small></span></a><p>Or the long way:</p>` : '';
          out.innerHTML = `<div class="li-steps">${dc}<p><b>${esc(site)} doesn’t let other apps download its characters</b>, so it takes two taps:</p>
            <ol><li><a class="li-step press" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${icon('link', 16)}<span><b>Open on ${esc(site)}</b><small>Use its Download button (ZIP or PNG)</small></span></a></li>
            <li><label class="li-step press">${icon('upload', 16)}<span><b>Pick the downloaded file</b><small>Usually in your Downloads</small></span><input type="file" class="vh" id="liFile" multiple accept=".zip,.png,.json,.charx,application/zip,image/png,application/json"></label></li></ol>
            <p class="li-note">Running Chatbox with its local server (npm start) imports these links directly.</p></div>`;
          out.querySelector('.li-dc')?.addEventListener('click', () => close());
          out.querySelector('#liFile').addEventListener('change', (ev) => {
            const files = [...ev.target.files];
            if (!files.length) return;
            close();
            startImport(files);
          });
        }
      });
    },
  });
}
