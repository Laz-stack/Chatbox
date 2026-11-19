import { S, connection, newConnection, saveConnection, deleteConnection, saveSettings, activeConnection } from '../store.js';
import { PROVIDERS, testConnection, proxyAvailable } from '../providers.js';
import { esc, motion } from '../util.js';
import { topbar, title2, ibtn, bullet, field, area, toggleRow, bindSwitch, icon, arrow, dial, bindDial, toast, confirmSheet } from '../ui.js';

const LETTER_BG = { anthropic: '#FDCD15', openai: '#ECECEC', openrouter: '#B8ACFE', custom: '#2EAA67', demo: '#333333' };

export function connectionsView() {
  const active = activeConnection();
  const card = (c, i) => {
    const on = c.id === active?.id;
    const p = PROVIDERS[c.provider] || PROVIDERS.openai;
    const tags = [on ? '<span class="tag hl">Active</span>' : '', c.prompt?.trim() ? '<span class="tag">Own prompt</span>' : '<span class="tag">Global only</span>', c.provider !== 'demo' ? `<span class="tag num">temp ${(+c.temperature).toFixed(1)}</span>` : ''].join('');
    return `<div class="conn${on ? ' active' : ''}" style="animation-delay:${0.06 * i}s">
      <a class="conn-main" href="#/connection/${c.id}" aria-label="Edit ${esc(c.name || p.label)}">${bullet(esc((c.name || p.label)[0].toUpperCase()), on ? '#0A0A0A' : LETTER_BG[c.provider] || '#ECECEC', on ? '#FDCD15' : null, 54)}
        <span class="conn-tx"><span class="conn-n">${esc(c.name || p.label)}</span><span class="conn-m num">${esc(c.provider === 'demo' ? p.sub : c.model || 'no model set')}</span><span class="tags">${tags}</span></span></a>
      <button type="button" class="radio press" role="radio" aria-checked="${on}" aria-label="Use ${esc(c.name || p.label)}" data-use="${c.id}">${on ? bullet(arrow(18, '#FDCD15'), '#0A0A0A', '#FDCD15', 36) : '<span class="ring"></span>'}</button>
    </div>`;
  };
  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/settings', right: ibtn('plus', 'Add a connection', { href: '#/connection/new', cls: 'yellow' }) })}
    ${title2('Connections', 'Where replies come from', { tag: 'h1' })}
    <div class="stack" style="margin-top:18px;gap:12px" role="radiogroup" aria-label="Active connection">${S.connections.map(card).join('')}</div>
    <a class="dashed press" href="#/connection/new" style="margin-top:12px">${icon('plus', 20)}Add a connection</a>
    <div class="note" style="margin-top:18px">${icon('shield', 18)}<span>The active connection answers every chat unless a character picks its own. Keys stay in this browser and go only to the provider you choose.</span></div>
  </div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-use]');
        if (!b) return;
        S.settings.activeConnectionId = b.dataset.use;
        await saveSettings();
        const v = connectionsView();
        root.innerHTML = v.html;
        motion(root.querySelector(`[data-use="${b.dataset.use}"]`)?.closest('.conn'), [{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
    },
  };
}

export function connectionEditView(id) {
  const isNew = id === 'new';
  const src = isNew ? newConnection('anthropic') : connection(id);
  if (!src) return null;
  const d = structuredClone(src);
  const p = () => PROVIDERS[d.provider];
  const providers = ['anthropic', 'openai', 'openrouter', 'custom'];

  const urlField = () =>
    field('cUrl', 'Base URL', d.baseUrl, { ph: p().base, attrs: 'autocomplete="off" spellcheck="false" inputmode="url"' });
  const showUrl = () => d.provider === 'openai' || d.provider === 'custom';

  const html = `<div class="screen no-tab">
    ${topbar({ back: '#/connections', title: isNew ? 'New connection' : esc(d.name || p().label), right: !isNew && S.connections.length > 1 ? ibtn('trash', 'Delete connection', { id: 'delBtn' }) : '' })}
    <div class="stack" style="gap:16px">
      ${d.provider === 'demo' ? `<div class="note">${icon('spark', 18)}<span>The demo connection sends canned replies so you can try the app. Pick a provider below to switch this connection to a real AI.</span></div>` : ''}
      <div class="seg two" role="group" aria-label="Provider">${providers.map((k) => `<button type="button" class="press" data-prov="${k}" aria-pressed="${d.provider === k}"><b>${PROVIDERS[k].label}</b><span>${PROVIDERS[k].sub}</span></button>`).join('')}</div>
      <div id="urlSlot">${showUrl() ? urlField() : ''}</div>
      <div>
        ${field('cKey', 'API key', d.apiKey, { type: 'password', ph: p().keyHint, attrs: 'autocomplete="off" spellcheck="false"', right: d.provider === 'custom' ? '<span class="small">Optional</span>' : '', after: `<button type="button" class="ibtn ghost press" id="eyeBtn" aria-label="Show key">${icon('eye', 20)}</button>` })}
        <p class="fhint key-note">${icon('shield', 15)}<span>Stays in this browser and goes only to ${esc(p().label)}. Backups leave it out unless you choose otherwise.</span></p>
      </div>
      ${field('cModel', 'Model', d.model, { ph: p().modelHint, attrs: 'autocomplete="off" spellcheck="false"' })}
      <button type="button" class="btn-primary press" id="saveBtn"><span>Save and test</span>${arrow(30)}</button>
      <div class="status-line" id="status" role="status"></div>
      <details class="adv"${d.prompt?.trim() || d.replaceGlobal || d.useProxy ? ' open' : ''}><summary>More options ${icon('chev', 18)}</summary><div class="inner">
        ${field('cName', 'Name', d.name, { ph: p().label, attrs: 'autocomplete="off" maxlength="40"' })}
        <div id="dialSlot">${dial('cTemp', +d.temperature || 0.9, { min: 0, max: 2, step: 0.1, hint: 'How adventurous replies get' })}</div>
        ${area('cPrompt', 'Connection prompt', d.prompt, { rows: 4, ph: 'Extra instructions for this model only, e.g. "Keep replies under 150 words."', right: '<span class="small">Added after the global prompt</span>' })}
        ${toggleRow('tReplace', 'Replace global prompt', 'Send this prompt instead of the global one', d.replaceGlobal)}
        <div id="urlSlot2">${showUrl() ? '' : urlField()}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${field('cMax', 'Max reply tokens', d.maxTokens, { type: 'number', attrs: 'min="16" max="32000" step="1"' })}
          ${field('cCtx', 'Context size', d.context, { type: 'number', attrs: 'min="1000" max="2000000" step="1000"' })}
        </div>
        <p class="fhint" style="margin:-4px 2px 0">Context size is how many tokens this model can read. Long chats get summarized when they pass about half of it.</p>
        <div id="proxyRow">${toggleRow('tProxy', 'Route through local server', 'Use if your provider blocks requests from the browser. Needs server.js running.', d.useProxy)}</div>
      </div></details>
    </div>
  </div>`;

  function mount(root) {
    const $ = (s) => root.querySelector(s);
    const tempNote = () => (d.provider === 'anthropic' && d.temperature > 1 ? 'Anthropic tops out at 1.0' : 'How adventurous replies get');

    $('.seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-prov]');
      if (!b) return;
      const was = d.provider;
      d.provider = b.dataset.prov;
      root.querySelectorAll('[data-prov]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      if (was !== d.provider) {
        if (!d.name || d.name === PROVIDERS[was]?.label || d.name === 'Demo') {
          d.name = '';
          $('#cName').value = '';
        }
        if (d.provider === 'anthropic' && !d.model) $('#cModel').value = d.model = 'claude-sonnet-5-5';
        else if (was === 'anthropic' && d.model === 'claude-sonnet-5-5') $('#cModel').value = d.model = '';
        if (was === 'demo' && d.model === 'canned replies') $('#cModel').value = d.model = d.provider === 'anthropic' ? 'claude-sonnet-5-5' : '';
      }
      $('#cName').placeholder = p().label;
      $('#cModel').placeholder = p().modelHint;
      $('#cKey').placeholder = p().keyHint;
      root.querySelector('.key-note span').textContent = `Stays in this browser and goes only to ${p().label}. Backups leave it out unless you choose otherwise.`;
      $('#urlSlot').innerHTML = showUrl() ? urlField() : '';
      const u2 = $('#urlSlot2');
      if (u2) u2.innerHTML = showUrl() ? '' : urlField();
      bindUrl();
      root.querySelector('.dialbox .small').textContent = tempNote();
    });
    const bindUrl = () => root.querySelectorAll('#cUrl').forEach((el) => el.addEventListener('input', () => (d.baseUrl = el.value.trim())));
    bindUrl();
    $('#cName').addEventListener('input', (e) => (d.name = e.target.value));
    $('#cModel').addEventListener('input', (e) => (d.model = e.target.value.trim()));
    $('#cKey').addEventListener('input', (e) => (d.apiKey = e.target.value.trim()));
    $('#cPrompt').addEventListener('input', (e) => (d.prompt = e.target.value));
    $('#cMax').addEventListener('input', (e) => (d.maxTokens = Math.max(16, +e.target.value || 600)));
    $('#cCtx').addEventListener('input', (e) => (d.context = Math.max(1000, +e.target.value || 16000)));
    $('#eyeBtn').addEventListener('click', (e) => {
      const k = $('#cKey');
      const show = k.type === 'password';
      k.type = show ? 'text' : 'password';
      e.currentTarget.innerHTML = icon(show ? 'eyeoff' : 'eye', 20);
      e.currentTarget.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
    });
    bindDial($('#dialSlot'), (v) => {
      d.temperature = v;
      root.querySelector('.dialbox .small').textContent = tempNote();
    });
    root.querySelector('.dialbox .small').textContent = tempNote();
    bindSwitch($('#tReplace'), (v) => (d.replaceGlobal = v));
    bindSwitch($('#tProxy'), (v) => (d.useProxy = v));
    proxyAvailable().then((ok) => {
      if (!ok && !d.useProxy) $('#proxyRow .trow-s').textContent = 'The local server is not running here. Start it with "npm start" to use this.';
    });

    $('#delBtn')?.addEventListener('click', async () => {
      if (!(await confirmSheet({ title: 'Delete this connection?', body: 'Characters using it will switch to the active connection.', ok: 'Delete', danger: true }))) return;
      await deleteConnection(d.id);
      location.hash = '#/connections';
    });

    $('#saveBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const st = $('#status');
      if (!d.name.trim()) d.name = p().label;
      if (!d.model.trim()) {
        $('#cModel').focus();
        return toast('Add a model name.');
      }
      if (d.provider !== 'custom' && !d.apiKey) {
        $('#cKey').focus();
        return toast('Paste your API key.');
      }
      await saveConnection(d);
      const prev = activeConnection();
      const wasActive = prev?.id === d.id;
      // Only a connection that works takes over chats; a failing one stays saved but off.
      const shouldActivate = !prev || prev.provider === 'demo' || isNew;
      btn.classList.add('busy');
      btn.disabled = true;
      st.className = 'status-line';
      st.textContent = 'Testing the connection…';
      try {
        const r = await testConnection(d);
        if (shouldActivate && !wasActive) {
          S.settings.activeConnectionId = d.id;
          await saveSettings();
        }
        st.className = 'status-line ok';
        st.innerHTML = `${icon('check', 18)}<span>Connected. Replied in ${(r.ms / 1000).toFixed(1)} s.${shouldActivate && !wasActive ? ' Chats now use it.' : ''}</span>`;
        toast(shouldActivate && !wasActive ? 'Connected. Chats now use this connection.' : 'Connection saved and working');
        setTimeout(() => (location.hash = '#/connections'), 900);
      } catch (err) {
        st.className = 'status-line bad';
        const why = `${esc(err.message)}${err.hint ? ' ' + esc(err.hint) : ''}`;
        if (wasActive) {
          st.innerHTML = `${icon('x', 18)}<span><b>Saved, but the test failed.</b> ${why} This is the connection your chats use, so replies will fail until it works.</span>`;
        } else {
          st.innerHTML = `${icon('x', 18)}<span><b>Saved, not switched on: the test failed.</b> ${why} Fix the key or model and test again.${shouldActivate ? ` <button type="button" class="btn-text" id="useAnyway" style="height:auto;padding:4px 0;color:var(--cream);text-decoration:underline;text-underline-offset:3px">Use it anyway</button>` : ''}</span>`;
          st.querySelector('#useAnyway')?.addEventListener('click', async () => {
            S.settings.activeConnectionId = d.id;
            await saveSettings();
            toast(`Chats now use ${d.name}`);
            location.hash = '#/connections';
          });
        }
      }
      btn.classList.remove('busy');
      btn.disabled = false;
    });
  }
  return { html, depth: 2, mount };
}
