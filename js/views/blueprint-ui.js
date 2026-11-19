// The Blueprint inside the character editor: hint, Random / Enhance, eight collapsible sections of
// fields you type into directly (each with a lock), per-section reroll, Mature details (off by default),
// Extra notes, and a preview of the persona the model receives.
import { S, connection, activeConnection } from '../store.js';
import { SECTIONS, FIELDS, fieldsOf, filled, hasSheet, compileSheet, generate } from '../blueprint.js';
import { esc, motion, EASE_OUT } from '../util.js';
import { icon, toggleRow, bindSwitch, openSheet, toast, confirmSheet, autosize } from '../ui.js';

const isLocked = (d, k) => (d.locks || []).includes(k);

function fieldHTML(d, f, ui) {
  const v = d.sheet?.[f.k] ?? '';
  const locked = isLocked(d, f.k);
  const label = esc(f.label);
  const dot = ui.changed.has(f.k) ? '<i class="new-dot" title="Just written"></i>' : '';
  const input = f.short
    ? `<input class="input bp-in" id="bp-${f.k}" data-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" autocomplete="off" ${f.num ? 'type="number" inputmode="numeric" min="18" max="120"' : 'type="text"'}>`
    : `<textarea class="input bp-in bp-ta${f.tall ? ' tall' : ''}" id="bp-${f.k}" data-k="${f.k}" rows="${f.tall ? 5 : 3}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
  const sug = ui.suggest[f.k];
  return `<div class="bpf${locked ? ' locked' : ''}" data-f="${f.k}">
    <div class="bpf-l"><label for="bp-${f.k}">${label}${dot}</label>
      <button type="button" class="lockb press" data-lock="${f.k}" aria-pressed="${locked}" aria-label="${locked ? 'Unlock' : 'Lock'} ${label}" title="${locked ? 'Locked: Random and Reroll skip it' : 'Lock to keep it'}">${icon(locked ? 'lock' : 'unlock', 17)}</button></div>
    ${input}
    ${f.num ? '<p class="bpf-help">Characters are 18 or older.</p>' : ''}
    ${sug ? `<div class="bp-sug"><span class="bp-sug-t">Suggestion</span><p>${esc(sug)}</p><div class="bp-sug-a"><button type="button" class="press" data-use="${f.k}">Use this</button><button type="button" class="press ghost" data-keep="${f.k}">Keep mine</button></div></div>` : ''}
  </div>`;
}

function sectionHTML(d, s, ui) {
  const fields = fieldsOf(s.key, d.mature);
  const n = fields.filter((f) => filled(d.sheet, f.k)).length + (s.key === 'basic' && d.name?.trim() ? 0 : 0);
  const open = ui.open.has(s.key);
  const firstVal = fields.map((f) => d.sheet?.[f.k]).find((v) => String(v ?? '').trim());
  const body = open
    ? `<div class="acc-body">${fields
        .map((f, i) => (s.key === 'look' && f.k === 'genitals' ? '' : fieldHTML(d, f, ui)) + (s.key === 'look' && i === fields.findIndex((x) => x.k === 'notable') ? matureHTML(d, ui) : ''))
        .join('')}</div>`
    : '';
  return `<section class="acc${open ? ' open' : ''}" data-s="${s.key}">
    <div class="acc-h">
      <button type="button" class="acc-t press" data-toggle="${s.key}" aria-expanded="${open}"><span class="acc-tt"><b>${esc(s.title)}</b><span class="acc-n num">${n}/${fields.length}</span></span>${!open && firstVal ? `<span class="acc-pv">${esc(String(firstVal).slice(0, 80))}</span>` : ''}</button>
      <button type="button" class="acc-roll press" data-roll="${s.key}" aria-label="Reroll ${esc(s.title)}">${icon('dice', 18)}${open ? '<span>Reroll</span>' : ''}</button>
      <span class="acc-c" aria-hidden="true">${icon('chev', 18)}</span>
    </div>${body}</section>`;
}

// Mature details sit inside Appearance, right above the one field they unlock.
function matureHTML(d, ui) {
  const g = FIELDS.find((f) => f.k === 'genitals');
  return `<div class="bp-mature">${toggleRow('tMature', 'Mature details', 'Shows the field below and lets Random and Enhance include sexual details. Off by default.', !!d.mature)}</div>${d.mature ? fieldHTML(d, g, ui) : ''}`;
}

export function blueprintHTML(d) {
  const legacy = !hasSheet(d) && (d.persona || '').trim();
  return `<section class="bp" id="bp" aria-labelledby="bpTitle">
    <div class="hrow"><h2 class="h" id="bpTitle">Blueprint</h2><button type="button" class="small bp-link press" data-preview>Preview persona</button></div>
    ${legacy ? `<div class="bp-legacy">${icon('spark', 18)}<span>Your old prompt is kept in Extra notes. Enhance can build the sheet from it.</span></div>` : ''}
    <label class="bp-hint">${icon('spark', 18)}<input id="bpHint" placeholder="A few words: who, where, the mood." autocomplete="off" aria-label="Hint for Random and Enhance"></label>
    <div class="bp-btns"><button type="button" class="bp-rand press" id="bpRand">${icon('dice', 20)}<span>Random</span></button><button type="button" class="bp-enh press" id="bpEnh">${icon('spark', 20)}<span>Enhance</span></button></div>
    <p class="bp-note" id="bpNote">Random writes the whole sheet. Enhance fills gaps and keeps your words.</p>
    <div class="bp-result" id="bpResult" role="status" hidden></div>
    <div class="bp-list" id="bpList"></div>
    <section class="acc notes${(d.persona || '').trim() ? ' open' : ''}" data-s="notes">
      <div class="acc-h"><button type="button" class="acc-t press" data-toggle="notes" aria-expanded="${!!(d.persona || '').trim()}"><span class="acc-tt"><b>Extra notes</b><span class="counter" id="cPersona">0 / 6,000</span></span></button><span class="acc-c" aria-hidden="true">${icon('chev', 18)}</span></div>
      <div class="acc-body"><textarea class="input area" id="fPersona" rows="5" placeholder="Anything the sheet doesn't cover. Use {{char}} for their name and {{user}} for yours.">${esc(d.persona || '')}</textarea>
        <p class="fhint">Sent after the sheet. Random and Enhance read it but never change it.</p></div>
    </section>
    <button type="button" class="bp-prev press" data-preview>${icon('file', 18)}<span>Preview persona</span>${icon('chev', 16)}</button>
  </section>`;
}

export function bindBlueprint(root, d, { onName }) {
  const $ = (s) => root.querySelector(s);
  d.sheet ||= {};
  d.locks ||= [];
  const ui = { open: new Set(hasSheet(d) ? [] : ['basic']), changed: new Set(), suggest: {} };
  let ctl = null;
  let busyBtn = null;
  const list = $('#bpList');

  const render = (keep = true) => {
    const y = keep ? window.scrollY : 0;
    list.innerHTML = SECTIONS.map((s) => sectionHTML(d, s, ui)).join('');
    list.querySelectorAll('textarea.bp-ta').forEach((t) => autosize(t, Math.round(innerHeight * 0.4)));
    bindSwitch(list.querySelector('#tMature'), (v) => {
      d.mature = v;
      render();
    });
    if (keep) window.scrollTo(0, y);
    updateEnhance();
  };
  const updateEnhance = () => {
    const can = $('#bpHint').value.trim() || hasSheet(d) || (d.persona || '').trim() || d.name?.trim();
    $('#bpEnh').disabled = !can || !!busyBtn;
    $('#bpNote').textContent = can ? 'Random writes the whole sheet. Enhance fills gaps and keeps your words.' : 'Random writes the whole sheet. Enhance needs a hint or something written first.';
  };
  render(false);

  // typing, locks, sections, suggestions
  list.addEventListener('input', (e) => {
    const k = e.target.dataset?.k;
    if (!k) return;
    d.sheet[k] = e.target.value;
    ui.changed.delete(k);
    e.target.closest('.bpf')?.querySelector('.new-dot')?.remove();
    const sec = e.target.closest('.acc');
    const s = SECTIONS.find((x) => x.key === sec?.dataset.s);
    if (s) sec.querySelector('.acc-n').textContent = `${fieldsOf(s.key, d.mature).filter((f) => filled(d.sheet, f.k)).length}/${fieldsOf(s.key, d.mature).length}`;
    updateEnhance();
  });
  list.addEventListener('change', (e) => {
    if (e.target.dataset?.k !== 'age' || !e.target.value) return;
    const n = Math.max(18, Math.min(120, parseInt(e.target.value, 10) || 18));
    if (String(n) !== e.target.value) toast('Characters are 18 or older.');
    e.target.value = d.sheet.age = String(n);
  });
  root.querySelector('#bp').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const k = t.dataset.toggle;
      if (k === 'notes') {
        const sec = t.closest('.acc');
        const open = !sec.classList.contains('open');
        sec.classList.toggle('open', open);
        t.setAttribute('aria-expanded', open);
        return;
      }
      ui.open.has(k) ? ui.open.delete(k) : ui.open.add(k);
      render();
      const sec = list.querySelector(`.acc[data-s="${k}"]`);
      if (ui.open.has(k)) {
        motion(sec.querySelector('.acc-body'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_OUT });
        const top = sec.getBoundingClientRect().top;
        if (top < 70 || top > innerHeight * 0.6) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      return;
    }
    const l = e.target.closest('[data-lock]');
    if (l) {
      const k = l.dataset.lock;
      d.locks = isLocked(d, k) ? d.locks.filter((x) => x !== k) : [...d.locks, k];
      const on = isLocked(d, k);
      l.setAttribute('aria-pressed', on);
      l.innerHTML = icon(on ? 'lock' : 'unlock', 17);
      l.closest('.bpf').classList.toggle('locked', on);
      return;
    }
    const u = e.target.closest('[data-use]');
    if (u) {
      d.sheet[u.dataset.use] = ui.suggest[u.dataset.use];
      delete ui.suggest[u.dataset.use];
      ui.changed.add(u.dataset.use);
      return render();
    }
    const kp = e.target.closest('[data-keep]');
    if (kp) {
      delete ui.suggest[kp.dataset.keep];
      return render();
    }
    if (e.target.closest('[data-preview]')) return preview();
    const r = e.target.closest('[data-roll]');
    if (r) return run('section', r.dataset.roll);
  });
  $('#bpHint').addEventListener('input', updateEnhance);
  $('#bpRand').addEventListener('click', () => (busyBtn ? ctl?.abort() : run('random')));
  $('#bpEnh').addEventListener('click', () => (busyBtn ? ctl?.abort() : run('enhance')));

  // ---------- Random / Enhance / Reroll ----------
  const result = (html, kind = '') => {
    const r = $('#bpResult');
    r.hidden = !html;
    r.className = 'bp-result ' + kind;
    r.innerHTML = html;
  };
  function setBusy(btn) {
    busyBtn = btn;
    for (const b of [$('#bpRand'), $('#bpEnh')]) {
      if (btn && b !== btn) b.disabled = true;
    }
    if (btn) {
      btn.dataset.label = btn.querySelector('span').textContent;
      btn.querySelector('span').textContent = 'Writing… Stop';
      btn.classList.add('busy');
    } else {
      for (const b of [$('#bpRand'), $('#bpEnh')]) {
        b.classList.remove('busy');
        if (b.dataset.label) b.querySelector('span').textContent = b.dataset.label;
        b.disabled = false;
      }
      updateEnhance();
    }
  }

  async function run(mode, sectionKey = null) {
    const conn = connection(d.connectionId) || activeConnection();
    const inScope = sectionKey ? fieldsOf(sectionKey, d.mature) : FIELDS.filter((f) => d.mature || !f.mature);
    const keys = inScope.map((f) => f.k).filter((k) => !isLocked(d, k));
    if (!keys.length) return toast(sectionKey ? 'Every field here is locked.' : 'Every field is locked.');
    if (mode === 'random') {
      const overwrite = keys.filter((k) => filled(d.sheet, k)).length;
      if (overwrite && !(await confirmSheet({ title: `Replace ${overwrite} unlocked field${overwrite === 1 ? '' : 's'}?`, body: 'Locked fields stay as they are. You can undo right after.', ok: 'Replace them', danger: true }))) return;
    }
    const before = { sheet: structuredClone(d.sheet), name: d.name };
    ctl = new AbortController();
    const btn = sectionKey ? null : mode === 'random' ? $('#bpRand') : $('#bpEnh');
    if (btn) setBusy(btn);
    const rollBtn = sectionKey && list.querySelector(`[data-roll="${sectionKey}"]`);
    if (rollBtn) rollBtn.classList.add('spin');
    result('');
    let out;
    try {
      out = await generate({ conn, ch: d, keys, hint: $('#bpHint').value.trim(), mode: sectionKey ? 'section' : mode, signal: ctl.signal });
    } catch (err) {
      if (btn) setBusy(null);
      if (rollBtn) rollBtn.classList.remove('spin');
      if (err.name === 'AbortError') return result('Stopped. Nothing changed.');
      return result(`${esc(err.message?.startsWith("Couldn't") ? err.message : "Couldn't reach the model. Nothing changed. Try again.")}${err.hint ? ` <small>${esc(err.hint)}</small>` : ''}`, 'err');
    }
    if (btn) setBusy(null);
    if (rollBtn) rollBtn.classList.remove('spin');
    // apply
    ui.changed = new Set(Object.keys(out.values));
    Object.assign(d.sheet, out.values);
    if (out.name && !d.name?.trim()) onName(out.name);
    if (mode === 'enhance') ui.suggest = Object.fromEntries(Object.entries(out.sharpen || {}).filter(([k]) => filled(d.sheet, k) && !isLocked(d, k) && out.sharpen[k] !== d.sheet[k]));
    // open sections only if the sheet was empty before; otherwise keep the user where they are
    if (!Object.values(before.sheet).some((v) => String(v ?? '').trim()) && !sectionKey) ui.open = new Set(['basic']);
    render();
    // staggered by section, not by field
    const touched = SECTIONS.filter((s) => s.fields.some((f) => ui.changed.has(f.k)));
    touched.forEach((s, i) => motion(list.querySelector(`.acc[data-s="${s.key}"]`), [{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, delay: i * 60, easing: EASE_OUT }));
    const n = Object.keys(out.values).length;
    const sharp = Object.keys(ui.suggest).length;
    const undo = () => {
      d.sheet = before.sheet;
      if (before.name !== d.name) onName(before.name);
      ui.changed.clear();
      ui.suggest = {};
      render();
      result('Undone. The sheet is back as it was.');
    };
    const demo = out.demo ? ' <small>Demo mode picks from built-in examples. Add your AI key for real writing.</small>' : '';
    if (sectionKey) {
      toast(`Rerolled ${n} field${n === 1 ? '' : 's'}`, { action: 'Undo', ms: 8000, onAction: undo });
      return;
    }
    result(
      mode === 'enhance'
        ? `Enhance filled ${n}${sharp ? `, suggested ${sharp} sharper` : ''}. <button type="button" class="bp-undo press">Undo</button>${demo}`
        : `Random wrote ${n} field${n === 1 ? '' : 's'}${out.name ? ' and a name' : ''}. <button type="button" class="bp-undo press">Undo</button>${demo}`
    );
    $('#bpResult .bp-undo').addEventListener('click', undo);
  }

  // ---------- preview: the persona exactly as the model receives it ----------
  function preview() {
    const text = compileSheet(d);
    const rows = text
      .split('\n')
      .map((line) => {
        if (line.startsWith('## ')) return `<h3 class="pv-h">${esc(line.slice(3))}</h3>`;
        const m = line.match(/^([A-Z0-9 /(){}.]+):\s(.*)$/);
        return m ? `<div class="pv-r"><span>${esc(m[1])}</span><span>${esc(m[2])}</span></div>` : line.trim() ? `<p class="pv-p">${esc(line)}</p>` : '';
      })
      .join('');
    openSheet({
      label: 'Persona preview',
      html: `<h2 class="sheet-title">Persona preview</h2><p class="sheet-p">Exactly what the model receives as ${esc(d.name || 'this character')}. ${text.length.toLocaleString()} characters.</p>
        <div class="pv">${rows || '<p class="pv-p">Nothing yet. Fill the sheet, or tap Random.</p>'}</div>
        <div style="height:14px"></div><button type="button" class="btn-primary plate press" id="pvCopy"><span>Copy</span>${icon('copy', 22)}</button>`,
      onMount(s) {
        s.querySelector('#pvCopy').onclick = () => navigator.clipboard?.writeText(text).then(() => toast('Persona copied'));
      },
    });
  }
}
