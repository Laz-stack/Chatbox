// Build › From a picture: the picture in a cream frame, an optional hint, and Write the character.
// While writing, a scan line passes once; then the look the model wrote drops onto the picture as
// tags, and the editor opens filled in with the picture as the portrait.
import { setDraft } from '../store.js';
import { getPicked, setPicked, canSee, pictureConn, writeFromPicture, lookFields, prepare, RefusedError, getHint, setHint } from '../frompicture.js';
import { PROVIDERS } from '../providers.js';
import { squareOf } from '../pictures.js';
import { esc, reducedMotion } from '../util.js';
import { topbar, icon, toast } from '../ui.js';

export function fromPictureView() {
  const pic = getPicked();
  if (!pic) return { html: `<div class="screen no-tab">${topbar({ back: '#/', title: 'From a picture' })}<p class="fhint">Pick a picture from Build first.</p></div>`, depth: 2, mount() {} };
  const conn = pictureConn();
  const sees = canSee(conn);
  const cname = conn ? conn.name || PROVIDERS[conn.provider]?.label : '';
  const warn =
    sees === 'none'
      ? `<div class="fp-warn">${icon('link', 18)}<span><b>No connection yet.</b>Add one with a model that can see pictures.</span><a class="press" href="#/connection/new">Add a connection</a></div>`
      : sees === 'no'
      ? `<div class="fp-warn">${icon('x', 18)}<span><b>${esc(cname)} can’t see pictures.</b>Pick a connection with a vision model (Claude, GPT-4o or newer, Gemini…).</span><a class="press" href="#/connections">Change connection</a></div>`
      : sees === 'maybe'
      ? `<div class="fp-warn soft">${icon('spark', 18)}<span><b>Not sure ${esc(cname)} can see pictures.</b>If it can’t, you’ll see a message and nothing is lost.</span></div>`
      : '';
  const html = `<div class="screen no-tab fp-screen">
    ${topbar({ back: '#/', title: 'From a picture' })}
    <div class="fp-frame"><div class="fp-pic"><img src="${esc(pic)}" alt="Your picture"><span class="fp-scan" aria-hidden="true"></span><div class="fp-tags" id="fpTags"></div></div></div>
    <p class="fp-line">Becomes the portrait. The look is written from it, the rest is made up.</p>
    ${warn}
    <div class="field" style="margin-top:14px"><div class="flabel"><label for="fpHint">Anything to go on? <span class="small">Optional</span></label></div><textarea class="input fp-hint" id="fpHint" rows="2" maxlength="400" placeholder="e.g. Her name is Vesna, a night-market fixer">${esc(getHint())}</textarea></div>
    ${conn ? `<a class="fp-cost press" href="#/connections">Uses ${esc(cname)} · one request with a picture</a>` : ''}
    <p class="vh" aria-live="polite" id="fpSay"></p>
    <div class="fp-acts"><button type="button" class="fp-go press" id="fpGo" ${sees === 'no' || sees === 'none' ? 'disabled' : ''}>${icon('spark', 18)}<span>Write the character</span></button><button type="button" class="fp-stop press" id="fpStop" hidden>Stop</button></div>
    <label class="fp-other press" id="fpOtherL">${icon('image', 16)}Pick another picture<input type="file" accept="image/*" class="vh" id="fpOther"></label>
  </div>`;

  return {
    html,
    depth: 2,
    mount(root) {
      const page = root.querySelector('.fp-screen');
      const $ = (s) => page.querySelector(s);
      let ctl = null;
      const alive = () => page.isConnected;
      const say = (t) => ($('#fpSay').textContent = t);
      $('#fpHint').addEventListener('input', (e) => setHint(e.target.value));
      // Leaving the page stops the request, so nothing jumps to the editor later.
      const watch = new MutationObserver(() => !alive() && (ctl?.abort(), watch.disconnect()));
      watch.observe(root, { childList: true });
      const pickAnother = async (f) => {
        if (!f) return;
        try {
          setPicked(await prepare(f));
          dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (err) {
          toast(err.message, { kind: 'err' });
        }
      };
      $('#fpOther').addEventListener('change', (e) => pickAnother(e.target.files[0]));
      $('#fpStop').addEventListener('click', () => ctl?.abort());
      $('#fpGo').addEventListener('click', async () => {
        const go = $('#fpGo');
        const stop = $('#fpStop');
        const frame = $('.fp-pic');
        $('.fp-refused')?.remove();
        go.disabled = true;
        go.querySelector('span').textContent = 'Writing…';
        stop.hidden = false;
        stop.focus();
        $('#fpOtherL').classList.add('off');
        $('#fpOther').disabled = true;
        frame.classList.add('scanning');
        say('Writing the character');
        ctl = new AbortController();
        const reset = () => {
          frame.classList.remove('scanning');
          stop.hidden = true;
          go.disabled = false;
          go.querySelector('span').textContent = 'Write the character';
          $('#fpOtherL').classList.remove('off');
          $('#fpOther').disabled = false;
        };
        try {
          const ch = await writeFromPicture({ conn, dataUrl: pic, hint: $('#fpHint').value.trim(), signal: ctl.signal });
          if (!alive()) return;
          ch.avatarImage = await squareOf(pic, 512);
          stop.hidden = true;
          // The look it wrote drops onto the picture, then the editor opens.
          const tags = lookFields(ch.sheet).slice(0, 4);
          const box = $('#fpTags');
          frame.classList.remove('scanning');
          tags.forEach((t, k) =>
            setTimeout(() => {
              if (!alive()) return;
              const s = document.createElement('span');
              s.textContent = `${t.label} · ${t.value.split(/[,.;]/)[0].slice(0, 32)}`;
              box.appendChild(s);
            }, reducedMotion() ? 0 : k * 260)
          );
          say(tags.length ? `Found: ${tags.map((t) => `${t.label} ${t.value.split(/[,.;]/)[0]}`).join('; ')}. Opening the builder.` : 'Written. Opening the builder.');
          setTimeout(() => {
            if (!alive()) return;
            setDraft(ch);
            setPicked(null);
            setHint('');
            location.hash = '#/edit/new';
            toast('Written from your picture. Check it, then save.');
          }, reducedMotion() ? 600 : 1300 + tags.length * 260);
        } catch (err) {
          if (!alive()) return;
          reset();
          go.focus();
          if (err.name === 'AbortError') return say('Stopped');
          const refused = err instanceof RefusedError;
          const box = document.createElement('div');
          box.className = 'fp-warn fp-refused';
          box.setAttribute('tabindex', '-1');
          box.innerHTML = `${icon('x', 18)}<span><b>${refused ? 'The model wouldn’t write from this picture.' : 'That didn’t work.'}</b>${esc(err.message || '')}${err.hint ? ' ' + esc(err.hint) : ''}</span>${refused ? `<label class="press fp-pick">Pick another<input type="file" accept="image/*" class="vh"></label>` : ''}`;
          $('.fp-line').after(box);
          box.querySelector('input')?.addEventListener('change', (e) => pickAnother(e.target.files[0]));
          say(refused ? 'The model wouldn’t write from this picture.' : 'That didn’t work.');
        }
      });
    },
  };
}
