import { S, connection, newConnection, saveConnection, deleteConnection, saveSettings, activeConnection } from '../store.js';
import { PROVIDERS, SAMPLING, testConnection, proxyAvailable } from '../providers.js';
import { esc, motion, uid } from '../util.js';
import { topbar, title2, ibtn, bullet, field, area, toggleRow, bindSwitch, icon, arrow, dial, bindDial, toast, confirmSheet, openSheet, row } from '../ui.js';
import { helper } from '../helper.js';
import { picPrefs, picConn, picModel, MODEL_HINTS, STYLES, isDemoPics, picStats, clearPictures } from '../pictures.js';
import { saveChat } from '../store.js';
import { PROVIDERS as P2, generateImage } from '../providers.js';

const LETTER_BG = { anthropic: '#FDCD15', openai: '#ECECEC', openrouter: '#B8ACFE', custom: '#2EAA67', demo: '#333333' };

export function connectionsView(open = null) {
  const active = activeConnection();
  const card = (c, i) => {
    const on = c.id === active?.id;
    const p = PROVIDERS[c.provider] || PROVIDERS.openai;
    const tags = [on ? '<span class="tag hl">Active</span>' : '', helper()?.id === c.id ? '<span class="tag">Helper</span>' : '', c.prompt?.trim() ? '<span class="tag">Own prompt</span>' : '<span class="tag">Global only</span>', c.provider !== 'demo' ? `<span class="tag num">temp ${(+c.temperature).toFixed(1)}</span>` : ''].join('');
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
    <h2 class="sec" style="margin-top:26px">Helper</h2>
    <div class="group">${row({ id: 'helperRow', ic: 'spark', bc: 'var(--lilac)', fc: '#0A0A0A', title: 'Background jobs', sub: `<span id="helperSub">${helperSub()}</span>` })}</div>
    <p class="fhint">Runs Route map and Bonds, summaries, diaries, Lorebook Enhance, the character builder and card import. A cheaper, faster model here saves money; chats still reply with their own connection.</p>
    <h2 class="sec" style="margin-top:22px">Pictures</h2>
    <div class="group">${row({ id: 'picRow', ic: 'image', bc: 'var(--pink)', fc: '#0A0A0A', title: 'Scene pictures', sub: `<span id="picSub">${picSub()}</span>` })}</div>
    <p class="fhint">Paints moments from your chats (long-press a reply › Picture this). Needs an image model: OpenAI (gpt-image-1) or OpenRouter (an image model). Each picture is billed by that provider.</p>
    <div class="note" style="margin-top:18px">${icon('shield', 18)}<span>The active connection answers every chat unless a character picks its own. Keys stay in this browser and go only to the provider you choose.</span></div>
  </div>`;
  return {
    html,
    depth: 1,
    mount(root) {
      // Fares › Set price opens the Pictures sheet straight away.
      if (open === 'pictures') setTimeout(() => picturesSheet(() => (root.querySelector('#picSub').innerHTML = picSub())), 150);
      // After picking a Helper: update the row and the card tags in place (no re-render behind the sheet).
      const helperChanged = () => {
        root.querySelector('#helperSub').innerHTML = helperSub();
        const stack = root.querySelector('.stack[role=radiogroup]');
        stack.classList.add('still');
        stack.innerHTML = S.connections.map(card).join('');
      };
      // Listen on this page only: the app container is shared by every screen.
      root.querySelector('.screen').addEventListener('click', async (e) => {
        if (e.target.closest('#helperRow')) return helperSheet(helperChanged);
        if (e.target.closest('#picRow')) return picturesSheet(() => (root.querySelector('#picSub').innerHTML = picSub()));
        const b = e.target.closest('[data-use]');
        if (!b) return;
        S.settings.activeConnectionId = b.dataset.use;
        await saveSettings();
        const stack = root.querySelector('.stack[role=radiogroup]');
        stack.classList.add('still');
        stack.innerHTML = S.connections.map(card).join('');
        motion(root.querySelector(`[data-use="${b.dataset.use}"]`)?.closest('.conn'), [{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
    },
  };
}

const connName = (c) => c.name || PROVIDERS[c.provider]?.label || 'Connection';
const helperSub = () => {
  const h = helper();
  return h ? `${esc(connName(h))} · ${esc(h.model || 'no model')}` : 'Same connection as each chat';
};

// ---------- Pictures: which connection paints, with which model ----------
const picSub = () => {
  const c = picConn();
  return c ? `${esc(connName(c))} · ${esc(picModel(c) || 'demo pictures')}` : 'Off · set up an image model';
};
function picturesSheet(onChange) {
  const list = S.connections.filter((c) => P2[c.provider]?.format !== 'anthropic' && (c.provider === 'demo' || c.apiKey?.trim() || c.provider === 'custom'));
  const p0 = picPrefs();
  const opt = (id, t, s) => `<button type="button" class="hp-opt press" role="radio" aria-checked="${(p0.connId || '') === id}" tabindex="${(p0.connId || '') === id ? 0 : -1}" data-pc="${id}"><span class="hp-dot" aria-hidden="true"></span><span class="row-tx"><span class="row-t">${t}</span><span class="row-s">${s}</span></span></button>`;
  openSheet({
    label: 'Scene pictures',
    html: `<h2 class="sheet-title">Scene pictures</h2><p class="sheet-p">Pick the connection that paints. Its key and address are used; the image model is set below.</p>
      <div class="hp-list" role="radiogroup" aria-label="Pictures connection">${opt('', 'Off', 'No pictures')}${list.map((c) => opt(c.id, esc(connName(c)), c.provider === 'demo' ? 'Placeholder pictures, to try it' : esc(P2[c.provider]?.label || ''))).join('')}</div>
      <div class="field" style="margin-top:14px" id="pmWrap"><div class="flabel"><label for="pmModel">Image model</label></div><input class="input" id="pmModel" value="${esc(p0.model || '')}" placeholder="${esc(MODEL_HINTS[picConn()?.provider] || 'gpt-image-1')}" autocomplete="off" spellcheck="false"></div>
      <div class="field" style="margin-top:12px"><div class="flabel"><label for="pmPrice">Price per picture ($)</label><span class="small">For Fares, when the provider doesn’t say</span></div><input class="input" id="pmPrice" type="number" min="0" step="0.001" inputmode="decimal" value="${p0.price ?? ''}" placeholder="e.g. 0.01"></div>
      <p class="tx-lbl">Default style</p><div class="ck-chips" role="radiogroup" aria-label="Default style">${Object.entries(STYLES).map(([k, s]) => `<button type="button" class="press" role="radio" aria-checked="${p0.style === k}" data-ps="${k}">${s.label}</button>`).join('')}</div>
      <button type="button" class="btn-primary plate press" id="pmTest" style="margin-top:16px;justify-content:center"><span>${isDemoPics() ? 'Paint a test' : 'Paint a test (billed)'}</span></button>
      <div id="pmOut" class="pm-out" aria-live="polite"></div>
      ${(() => {
        const st = picStats();
        return st.n ? `<p class="fhint" style="margin-top:14px">${st.n} picture${st.n === 1 ? '' : 's'} saved · ${(st.bytes / 1048576).toFixed(1)} MB (they sync too). <button type="button" class="btn-text press" id="pmClear" style="display:inline-flex;height:auto;padding:4px 0;color:var(--cream);text-decoration:underline">Delete all pictures</button></p>` : '';
      })()}`,
    onMount(s) {
      const save = async (patch) => {
        S.settings.pictures = { ...picPrefs(), ...patch };
        await saveSettings();
        onChange();
      };
      s.querySelector('.hp-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pc]');
        if (!b) return;
        s.querySelectorAll('[data-pc]').forEach((x) => (x.setAttribute('aria-checked', x === b), (x.tabIndex = x === b ? 0 : -1)));
        await save({ connId: b.dataset.pc || null });
        s.querySelector('#pmModel').placeholder = MODEL_HINTS[picConn()?.provider] || 'gpt-image-1';
      });
      s.querySelector('#pmModel').addEventListener('change', (e) => save({ model: e.target.value.trim() }));
      s.querySelector('#pmPrice').addEventListener('change', (e) => save({ price: e.target.value === '' ? null : Math.max(0, +e.target.value) }));
      s.querySelector('.ck-chips').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-ps]');
        if (!b) return;
        s.querySelectorAll('[data-ps]').forEach((x) => x.setAttribute('aria-checked', x === b));
        await save({ style: b.dataset.ps });
      });
      s.querySelector('#pmClear')?.addEventListener('click', async (e) => {
        if (!(await confirmSheet({ title: 'Delete all scene pictures?', body: 'Every painted picture is removed from your chats and from the app. Portraits you set stay.', ok: 'Delete all', danger: true }))) return;
        const n = await clearPictures(saveChat);
        e.target.closest('p').textContent = `${n} picture${n === 1 ? '' : 's'} deleted.`;
      });
      s.querySelector('#pmTest').addEventListener('click', async (e) => {
        const c = picConn();
        const out = s.querySelector('#pmOut');
        if (!c) return (out.textContent = 'Pick a connection first.');
        const btn = e.currentTarget;
        btn.classList.add('busy');
        btn.disabled = true;
        out.textContent = 'Painting a test picture…';
        try {
          const { url } = await generateImage(c, { model: picModel(c), prompt: `${STYLES[picPrefs().style].words}. A quiet train platform at dusk, warm lamps, light rain. No text.` });
          out.innerHTML = `<img src="${esc(url)}" alt="Test picture: a train platform at dusk"><span>It works.</span>`;
        } catch (err) {
          out.textContent = `${err.message || 'It didn’t work.'} ${err.hint || ''}`;
        }
        btn.classList.remove('busy');
        btn.disabled = false;
      });
    },
  });
}

// Pick the Helper connection: a cheaper model for the work behind the scenes.
// Only connections that can actually answer: a model set, and a key unless it's a custom address.
const usable = (c) => c.provider !== 'demo' && c.model?.trim() && (c.apiKey?.trim() || c.provider === 'custom');
function helperSheet(onChange) {
  const list = S.connections.filter(usable);
  const cur = helper()?.id || '';
  const opt = (id, t, s) => `<button type="button" class="hp-opt press" role="radio" aria-checked="${cur === id}" tabindex="${cur === id ? 0 : -1}" data-h="${id}"><span class="hp-dot" aria-hidden="true"></span><span class="row-tx"><span class="row-t">${t}</span><span class="row-s">${s}</span></span></button>`;
  openSheet({
    label: 'Helper connection',
    html: `<h2 class="sheet-title">Background jobs</h2><p class="sheet-p">Pick a cheaper, faster model for the work behind the scenes. Replies in your chats don’t change.</p>
      <div class="hp-list" role="radiogroup" aria-label="Helper connection">${opt('', 'Same as each chat', 'No helper: every job uses the chat’s own connection')}${list.map((c) => opt(c.id, esc(connName(c)), esc(c.model || 'no model set'))).join('')}</div>
      ${list.length < 2 ? `<p class="fhint">Tip: add a second connection with a cheaper model (Duplicate one to reuse its key), then pick it here.</p>` : ''}
      <div class="hp-tog"${cur ? '' : ' hidden'}>${toggleRow('tHelpCreative', 'Diaries and character builder too', 'Turn off to keep these on each chat’s own connection', S.settings.helperCreative !== false)}</div>`,
    onMount(s) {
      const radios = () => [...s.querySelectorAll('[data-h]')];
      const choose = async (b) => {
        S.settings.helperId = b.dataset.h || null;
        await saveSettings();
        radios().forEach((x) => (x.setAttribute('aria-checked', x === b), (x.tabIndex = x === b ? 0 : -1)));
        s.querySelector('.hp-tog').hidden = !b.dataset.h;
        onChange();
      };
      s.querySelector('.hp-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-h]');
        if (b) choose(b);
      });
      // Arrow keys move between options, like a native radio group.
      s.querySelector('.hp-list').addEventListener('keydown', (e) => {
        const all = radios();
        const i = all.indexOf(document.activeElement);
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (i < 0 || !d) return;
        e.preventDefault();
        const next = all[(i + d + all.length) % all.length];
        next.focus();
        choose(next);
      });
      bindSwitch(s.querySelector('#tHelpCreative'), async (on) => {
        S.settings.helperCreative = on;
        await saveSettings();
      });
    },
  });
}

export function connectionEditView(id) {
  // "new~<id>": a new connection that starts as a copy of another one (same key, address and settings).
  const [base, fromId] = String(id).split('~');
  const isNew = base === 'new';
  const from = isNew && fromId ? connection(fromId) : null;
  const label = (c) => c.name || PROVIDERS[c.provider]?.label || 'Connection';
  const src = isNew ? (from ? { ...structuredClone(from), id: uid(), name: `${label(from)} copy`.slice(0, 40) } : newConnection('anthropic')) : connection(id);
  const sources = S.connections.filter((c) => c.provider !== 'demo');
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
      ${isNew && sources.length ? `<div><p class="cp-lbl">Copy settings from</p><div class="cp-from" role="group" aria-label="Copy settings from">${sources.map((c) => `<a class="press" href="#/connection/new~${c.id}" aria-pressed="${from?.id === c.id}">${icon('copy', 15)}${esc(label(c))}</a>`).join('')}${from ? `<a class="press" href="#/connection/new" aria-pressed="false">${icon('x', 15)}Start blank</a>` : ''}</div>
        <p class="fhint">${from ? `Same key, address and settings as ${esc(label(from))}. Change the model or anything else, then save. It’s added alongside; your chats keep their current connection. The key is stored in both, so delete each one separately.` : 'Reuse the key, proxy or address of a connection you already have.'}</p></div>` : ''}
      <div class="seg two" role="group" aria-label="Provider">${providers.map((k) => `<button type="button" class="press" data-prov="${k}" aria-pressed="${d.provider === k}"><b>${PROVIDERS[k].label}</b><span>${PROVIDERS[k].sub}</span></button>`).join('')}</div>
      <div id="urlSlot">${showUrl() ? urlField() : ''}</div>
      <div>
        ${field('cKey', 'API key', d.apiKey, { type: 'password', ph: p().keyHint, attrs: 'autocomplete="off" spellcheck="false"', right: d.provider === 'custom' ? '<span class="small">Optional</span>' : '', after: `<button type="button" class="ibtn ghost press" id="eyeBtn" aria-label="Show key">${icon('eye', 20)}</button>` })}
        <p class="fhint key-note">${icon('shield', 15)}<span>Stays in this browser and goes only to ${esc(p().label)}. Backups leave it out unless you choose otherwise.</span></p>
      </div>
      ${field('cModel', 'Model', d.model, { ph: p().modelHint, attrs: 'autocomplete="off" spellcheck="false"' })}
      <button type="button" class="btn-primary press" id="saveBtn"><span>Save and test</span>${arrow(30)}</button>
      <div class="status-line" id="status" role="status"></div>
      ${!isNew && d.provider !== 'demo' ? `<a class="btn-text press cp-dup" href="#/connection/new~${d.id}">${icon('copy', 16)}Duplicate this connection</a>` : ''}
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
        <div id="priceBox"${d.provider === 'openrouter' ? ' hidden' : ''}><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${field('cPin', 'Input $ / 1M tokens', d.priceIn ?? '', { type: 'number', ph: 'e.g. 3', attrs: 'min="0" step="0.01" inputmode="decimal"' })}
          ${field('cPout', 'Output $ / 1M tokens', d.priceOut ?? '', { type: 'number', ph: 'e.g. 15', attrs: 'min="0" step="0.01" inputmode="decimal"' })}
        </div>
        <p class="fhint" style="margin:-4px 2px 0">Prices from your provider's pricing page. Fares uses them to turn tokens into dollars.</p></div>
        <p class="fhint" id="orCost" style="margin:-4px 2px 0"${d.provider === 'openrouter' ? '' : ' hidden'}>No prices needed: Fares uses what OpenRouter bills for each request.</p>
        <p class="fhint" style="margin:-4px 2px 0">Context size is how many tokens this model can read. Long chats get summarized when they pass about half of it.</p>
        <div class="ft"><p class="tx-lbl" style="margin:6px 2px 8px">Fine-tuning <span>how the model picks its words</span></p>
          <div class="ft-chips" role="radiogroup" aria-label="Fine-tuning preset">${Object.entries(SAMPLING).map(([k, x]) => `<button type="button" class="press" role="radio" aria-checked="${(d.samp?.preset || 'balanced') === k}" data-samp="${k}"><b>${x.label}</b><small>${x.note}</small></button>`).join('')}</div>
          <div id="ftCustom" ${(d.samp?.preset || 'balanced') === 'custom' ? '' : 'hidden'}><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            ${field('sTopP', 'Top P (0–1)', d.samp?.topP ?? '', { type: 'number', ph: 'e.g. 0.95', attrs: 'min="0" max="1" step="0.01" inputmode="decimal"' })}
            ${field('sMinP', 'Min P (0–0.5)', d.samp?.minP ?? '', { type: 'number', ph: 'e.g. 0.05', attrs: 'min="0" max="0.5" step="0.01" inputmode="decimal"' })}
            ${field('sTopK', 'Top K', d.samp?.topK ?? '', { type: 'number', ph: 'e.g. 40', attrs: 'min="0" max="500" step="1" inputmode="numeric"' })}
            ${field('sRep', 'Repetition penalty', d.samp?.rep ?? '', { type: 'number', ph: 'e.g. 1.05', attrs: 'min="1" max="2" step="0.01" inputmode="decimal"' })}
          </div><p class="fhint" style="margin:-4px 2px 0">Leave a box empty to use the model’s default. Not every provider uses every value: OpenAI ignores Min P and Top K.</p></div></div>
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
      // OpenRouter says what it billed, so it has no price boxes.
      $('#priceBox').hidden = d.provider === 'openrouter';
      $('#orCost').hidden = d.provider !== 'openrouter';
    });
    const bindUrl = () => root.querySelectorAll('#cUrl').forEach((el) => el.addEventListener('input', () => (d.baseUrl = el.value.trim())));
    bindUrl();
    $('#cName').addEventListener('input', (e) => (d.name = e.target.value));
    $('#cModel').addEventListener('input', (e) => (d.model = e.target.value.trim()));
    $('#cKey').addEventListener('input', (e) => (d.apiKey = e.target.value.trim()));
    $('#cPrompt').addEventListener('input', (e) => (d.prompt = e.target.value));
    $('#cMax').addEventListener('input', (e) => (d.maxTokens = Math.max(16, +e.target.value || 600)));
    $('#cCtx').addEventListener('input', (e) => (d.context = Math.max(1000, +e.target.value || 16000)));
    // Fine-tuning: a preset, or your own values.
    $('.ft-chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-samp]');
      if (!b) return;
      d.samp = { ...(d.samp || {}), preset: b.dataset.samp };
      root.querySelectorAll('[data-samp]').forEach((x) => x.setAttribute('aria-checked', x === b));
      $('#ftCustom').hidden = b.dataset.samp !== 'custom';
    });
    for (const [id, k] of [['sTopP', 'topP'], ['sMinP', 'minP'], ['sTopK', 'topK'], ['sRep', 'rep']])
      $('#' + id).addEventListener('input', (e) => (d.samp = { ...(d.samp || {}), preset: 'custom', [k]: e.target.value === '' ? null : +e.target.value }));
    $('#cPin').addEventListener('input', (e) => (d.priceIn = e.target.value === '' ? null : Math.max(0, +e.target.value)));
    $('#cPout').addEventListener('input', (e) => (d.priceOut = e.target.value === '' ? null : Math.max(0, +e.target.value)));
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

    // Switching the copy source rebuilds the form: ask first if something was typed.
    let edited = false;
    root.addEventListener('input', () => (edited = true));
    $('.cp-from')?.addEventListener('click', async (e) => {
      const a = e.target.closest('a');
      if (!a || !edited) return;
      e.preventDefault();
      if (await confirmSheet({ title: 'Discard your changes?', body: 'Switching starts the form again from that connection.', ok: 'Switch' })) location.hash = a.getAttribute('href');
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
      // A copy is an extra option, so it doesn't take over your chats; a first real connection does.
      const shouldActivate = !prev || prev.provider === 'demo' || (isNew && !from);
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
