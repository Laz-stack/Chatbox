// Talks to the AI providers straight from the browser with the user's own key.
// Streaming is parsed from Server-Sent Events. Optionally routed through the
// bundled local server (server.js) for providers that block browser requests.

export const PROVIDERS = {
  anthropic: { label: 'Anthropic', sub: 'Claude', base: 'https://api.anthropic.com', format: 'anthropic', modelHint: 'claude-sonnet-5-5', keyHint: 'sk-ant-…', maxTemp: 1 },
  openai: { label: 'OpenAI', sub: 'or compatible', base: 'https://api.openai.com/v1', format: 'openai', modelHint: 'model name from your provider', keyHint: 'sk-…', maxTemp: 2 },
  openrouter: { label: 'OpenRouter', sub: 'Many models', base: 'https://openrouter.ai/api/v1', format: 'openai', modelHint: 'provider/model-name', keyHint: 'sk-or-…', maxTemp: 2 },
  custom: { label: 'Custom URL', sub: 'Local or other', base: 'http://localhost:1234/v1', format: 'openai', modelHint: 'local-model', keyHint: 'optional', maxTemp: 2 },
  demo: { label: 'Demo', sub: 'Canned replies, no AI', format: 'demo', modelHint: '', keyHint: '', maxTemp: 2 },
};

export class ProviderError extends Error {
  constructor(message, status = 0, hint = '') {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.hint = hint;
  }
}

function baseOf(conn) {
  const p = PROVIDERS[conn.provider] || PROVIDERS.openai;
  return (conn.baseUrl?.trim() || p.base).replace(/\/+$/, '');
}

function endpoint(conn) {
  const p = PROVIDERS[conn.provider] || PROVIDERS.openai;
  const base = baseOf(conn);
  if (p.format === 'anthropic') return /\/v1$/.test(base) ? base + '/messages' : base + '/v1/messages';
  return base + '/chat/completions';
}

function headers(conn) {
  const p = PROVIDERS[conn.provider];
  const h = { 'content-type': 'application/json' };
  if (p.format === 'anthropic') {
    h['x-api-key'] = conn.apiKey;
    h['anthropic-version'] = '2023-06-01';
    h['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (conn.apiKey) {
    h.authorization = 'Bearer ' + conn.apiKey;
  }
  if (conn.provider === 'openrouter') {
    h['HTTP-Referer'] = location.origin;
    h['X-Title'] = 'Chatbox';
  }
  return h;
}

// Fine-tuning presets (Connections › More options › Fine-tuning): how the model picks words.
export const SAMPLING = {
  balanced: { label: 'Balanced', note: 'The model’s own defaults' },
  creative: { label: 'Creative', note: 'Varied words, fewer repeats', topP: 0.95, minP: 0.04, rep: 1.08 },
  precise: { label: 'Precise', note: 'Steady and on point', topP: 0.85, minP: 0.1, topK: 40, rep: 1.03 },
  custom: { label: 'Custom', note: 'Set each value' },
};
export function samplingOf(conn) {
  const k = conn?.samp?.preset || 'balanced';
  if (k === 'custom') return conn.samp || {};
  return SAMPLING[k] || {};
}
const num = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);

function body(conn, { system, messages, stream, maxTokens, temperature }) {
  const p = PROVIDERS[conn.provider];
  const temp = Math.min(p.maxTemp, Math.max(0, temperature ?? conn.temperature ?? 0.9));
  const max = maxTokens || conn.maxTokens || 600;
  const sp = samplingOf(conn);
  if (p.format === 'anthropic') {
    const b = { model: conn.model, max_tokens: max, messages, stream, temperature: temp };
    if (system) b.system = system;
    // Anthropic takes top_k; top_p can't be sent together with temperature on newer models.
    if (num(sp.topK)) b.top_k = Math.round(num(sp.topK));
    return b;
  }
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const b = { model: conn.model, messages: msgs, stream, temperature: temp, max_tokens: max };
  if (num(sp.topP) != null) b.top_p = num(sp.topP);
  // OpenAI rejects parameters it doesn't know; OpenRouter and most custom servers take these.
  if (conn.provider !== 'openai') {
    if (num(sp.minP) != null) b.min_p = num(sp.minP);
    if (num(sp.topK)) b.top_k = Math.round(num(sp.topK));
    if (num(sp.rep) != null) b.repetition_penalty = num(sp.rep);
  } else if (num(sp.rep) != null && num(sp.rep) > 1) b.frequency_penalty = Math.round(Math.min(2, (num(sp.rep) - 1) * 4) * 100) / 100;
  return b;
}

async function send(conn, url, init) {
  if (conn.useProxy) {
    return fetch('proxy', { ...init, headers: { ...init.headers, 'x-target-url': url } });
  }
  return fetch(url, init);
}

async function readError(res) {
  let msg = '';
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      msg = j.error?.message || j.message || j.error || t;
    } catch {
      msg = t;
    }
  } catch {}
  msg = String(msg || res.statusText || 'Request failed').slice(0, 300);
  const hints = {
    401: 'The API key was rejected. Check it in this connection.',
    403: 'The provider refused this key or model.',
    404: 'The model or URL was not found. Check the model name and base URL.',
    429: 'Rate limit or credit limit reached. Wait a moment, or check your provider account.',
    500: 'The provider had an internal error. Try again.',
    529: 'The provider is overloaded. Try again shortly.',
  };
  return new ProviderError(msg, res.status, hints[res.status] || '');
}

// Server-Sent Events reader: yields the data payload of each event.
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) yield data;
    }
  }
  if (buf.trim().startsWith('data:')) yield buf.trim().slice(5).trim();
}

/**
 * Run one completion.
 * onDelta(textChunk) is called as text arrives. Resolves with the full text.
 */
// `onUsage({ inTok, outTok, cost, id })`: what the provider says the request used. OpenRouter
// reports `cost`, the dollars it bills; a stopped OpenRouter reply has its cost looked up a few
// seconds later and reported with `late: true`.
export async function complete(conn, { system, messages, signal, onDelta = () => {}, stream = true, maxTokens, temperature, character, onUsage, onReasoning }) {
  if (!conn) throw new ProviderError('No connection set up yet.', 0, 'Add a connection in Settings.');
  const p = PROVIDERS[conn.provider];
  if (p.format === 'demo') return demoReply({ messages, signal, onDelta, character });
  if (!conn.model?.trim()) throw new ProviderError('This connection has no model name.', 0, 'Add a model name to the connection.');
  if (conn.provider !== 'custom' && !conn.apiKey?.trim()) throw new ProviderError('This connection has no API key.', 401, 'Add your API key to the connection.');

  let res;
  try {
    res = await send(conn, endpoint(conn), {
      method: 'POST',
      headers: headers(conn),
      body: JSON.stringify(body(conn, { system, messages, stream, maxTokens, temperature })),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ProviderError(
      "Couldn't reach the provider.",
      0,
      conn.useProxy
        ? 'The local server is not running. Start it with "npm start", or turn off "Route through local server".'
        : 'Check your internet connection, the API key and the base URL. Some providers refuse requests from a browser; if you run Chatbox on your computer with "npm start", turn on Route through local server under More options in this connection.'
    );
  }
  if (!res.ok) throw await readError(res);

  let text = '';
  const use = { id: '', inTok: null, outTok: null, cost: null };
  const take = (j) => {
    if (j?.id && !use.id) use.id = j.id;
    const u = j?.usage || j?.message?.usage;
    if (!u) return;
    if (u.prompt_tokens != null) use.inTok = u.prompt_tokens;
    if (u.input_tokens != null) use.inTok = u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (u.completion_tokens != null) use.outTok = u.completion_tokens;
    if (u.output_tokens != null) use.outTok = u.output_tokens;
    if (u.cost != null && Number.isFinite(+u.cost)) use.cost = +u.cost;
  };
  const report = () => {
    if (onUsage && (use.inTok != null || use.outTok != null || use.cost != null)) onUsage({ ...use });
  };
  if (!stream) {
    const j = await res.json();
    take(j);
    text = p.format === 'anthropic' ? (j.content || []).map((b) => b.text || '').join('') : j.choices?.[0]?.message?.content || '';
    // What the model thought before answering (reasoning models), when the provider sends it.
    const think = p.format === 'anthropic' ? (j.content || []).map((b) => b.thinking || '').join('') : j.choices?.[0]?.message?.reasoning || j.choices?.[0]?.message?.reasoning_content || '';
    if (think) onReasoning?.(think);
    report();
    onDelta(text);
    return text;
  }
  try {
    for await (const data of sse(res)) {
      if (data === '[DONE]') break;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new ProviderError(j.error.message || 'The provider returned an error.', 0);
      take(j);
      let d = '';
      let r = '';
      if (p.format === 'anthropic') {
        if (j.type === 'content_block_delta') (d = j.delta?.text || ''), (r = j.delta?.thinking || '');
      } else {
        d = j.choices?.[0]?.delta?.content || '';
        r = j.choices?.[0]?.delta?.reasoning || j.choices?.[0]?.delta?.reasoning_content || '';
      }
      if (r) onReasoning?.(r);
      if (d) {
        text += d;
        onDelta(d);
      }
    }
  } catch (e) {
    // Stopped part-way: OpenRouter still bills what was generated. Ask it what that came to.
    if (e.name === 'AbortError' && onUsage && conn.provider === 'openrouter' && use.id && use.cost == null) lookupCost(conn, use.id).then((u) => u && onUsage({ ...u, id: use.id, late: true }));
    throw e;
  }
  report();
  return text;
}

// What OpenRouter billed for one request (GET /generation). The record can take a few seconds
// to appear, so this tries a few times. Returns { cost, inTok, outTok } or null.
export async function lookupCost(conn, id, waits = [1500, 3000, 6000, 12000]) {
  for (const w of waits) {
    await new Promise((r) => setTimeout(r, w));
    try {
      const res = await send(conn, `${baseOf(conn)}/generation?id=${encodeURIComponent(id)}`, { headers: headers(conn) });
      if (res.status === 404) continue;
      if (!res.ok) return null;
      const d = (await res.json())?.data;
      if (d?.total_cost == null) continue;
      return { cost: +d.total_cost, inTok: d.tokens_prompt ?? d.native_tokens_prompt ?? null, outTok: d.tokens_completion ?? d.native_tokens_completion ?? null };
    } catch {
      return null;
    }
  }
  return null;
}

// ---------- Pictures ----------
// OpenAI-compatible /images/generations, or an OpenRouter model that returns images in chat.
// Returns a data: URL (or a plain URL when the provider only gives one).
export async function generateImage(conn, { model, prompt, signal }) {
  const p = PROVIDERS[conn.provider] || PROVIDERS.openai;
  if (p.format === 'demo') return { url: demoPicture(prompt), cost: 0 };
  if (p.format === 'anthropic') throw new ProviderError('Anthropic models can’t paint pictures.', 0, 'Pick an OpenAI or OpenRouter connection for Pictures.');
  const m = model || conn.model;
  // "Failed to fetch": the request never reached the provider. Say why it usually happens.
  const reach = async (url, init) => {
    try {
      return await send(conn, url, init);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ProviderError(
        'Couldn’t reach the picture service (the request was blocked or the connection dropped).',
        0,
        conn.provider === 'custom' ? 'This connection is a custom address, which may not allow picture requests from the browser. Pick an OpenRouter or OpenAI connection for Pictures.' : conn.useProxy ? 'This connection routes through a local server that isn’t running here. Turn that off in the connection’s More options.' : 'Check your internet connection and try again.'
      );
    }
  };
  if (conn.provider === 'openrouter') {
    // Some image models answer with text and pictures, some only pictures: try both shapes.
    const ask = (modalities) => reach(baseOf(conn) + '/chat/completions', { method: 'POST', headers: headers(conn), body: JSON.stringify({ model: m, messages: [{ role: 'user', content: prompt }], modalities }), signal });
    let res = await ask(['image', 'text']);
    if (!res.ok && (res.status === 400 || res.status === 404)) res = await ask(['image']);
    if (!res.ok) throw await readError(res);
    const j = await res.json();
    const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new ProviderError('That model didn’t return a picture.', 0, 'Pick an image model, for example google/gemini-2.5-flash-image.');
    // OpenRouter reports what this request was billed (in dollars of credit).
    return { url, cost: Number.isFinite(+j.usage?.cost) ? +j.usage.cost : null };
  }
  // gpt-image models always answer with base64; others are asked for it too (a plain link may not load here).
  const size = /^gpt-image/.test(m) ? { size: '1536x1024' } : /dall-e-3/.test(m) ? { size: '1792x1024', response_format: 'b64_json' } : { response_format: 'b64_json' };
  const res = await reach(baseOf(conn) + '/images/generations', { method: 'POST', headers: headers(conn), body: JSON.stringify({ model: m, prompt, n: 1, ...size }), signal });
  if (!res.ok) throw await readError(res);
  const d = (await res.json()).data?.[0];
  if (d?.b64_json) return { url: 'data:image/png;base64,' + d.b64_json, cost: null };
  if (d?.url) return { url: d.url, cost: null };
  throw new ProviderError('The provider didn’t return a picture.');
}
// Demo mode: a painted-looking placeholder, so the feature can be tried without a key.
function demoPicture(prompt) {
  const words = String(prompt || '').replace(/[^\p{L}\p{N} ,.'’-]/gu, '').split(/\s+/).slice(0, 7).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#1b2a4a"/><stop offset=".45" stop-color="#3a2a5a"/><stop offset=".8" stop-color="#c46a3a"/><stop offset="1" stop-color="#f2c46a"/></linearGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><circle cx="1150" cy="300" r="90" fill="#f8e7b0" opacity=".85"/><path d="M0 760 Q300 620 620 720 T1536 700 V1024 H0Z" fill="#0d0d18"/><rect x="980" y="520" width="160" height="320" rx="60" fill="#141424"/><text x="64" y="980" font-family="Arial" font-size="44" fill="#ECECEC" opacity=".8">Demo picture · ${words.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export async function testConnection(conn) {
  const t0 = performance.now();
  const text = await complete(conn, {
    system: '',
    messages: [{ role: 'user', content: 'Reply with just the word OK.' }],
    stream: false,
    maxTokens: 16,
    temperature: 0,
  });
  return { ms: Math.round(performance.now() - t0), text: text.trim() };
}

// Is the bundled local server available (for routing)?
let proxyCheck = null;
export function proxyAvailable() {
  if (!proxyCheck) {
    proxyCheck = fetch('proxy/health')
      .then((r) => r.ok)
      .catch(() => false);
  }
  return proxyCheck;
}

// --- Demo: canned replies so the app is usable before a key is added. ---
const DEMO_LINES = [
  ['smiles and sets a warm cup in front of you', 'This one is on the house. Tell me about your day?'],
  ['tilts her head, thinking it over', "Hmm, I like that idea. What made you think of it?"],
  ['laughs softly and wipes the counter', 'You always say the most unexpected things.'],
  ['leans on the counter, chin in her hand', "Okay, I'm listening. Go on."],
  ['blushes and looks away for a second', 'W-well, thank you. That was nice of you to say.'],
];
let demoCalls = 0;
async function demoReply({ messages, signal, onDelta, character }) {
  const n = messages.filter((m) => m.role === 'user').length;
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  if (/summar/i.test(last) && messages.length === 1) {
    const out = 'In demo mode no AI writes summaries. Connect a provider to get real summaries of long chats.';
    onDelta(out);
    return out;
  }
  // demoCalls makes Regenerate give a different line instead of repeating the same one.
  const [act, say] = DEMO_LINES[(n + demoCalls++) % DEMO_LINES.length];
  const out = character?.demoText ? character.demoText(last) : `*${act}* "${say}"\n\n*(Demo reply. Add your API key in Settings to talk to ${character?.name || 'your character'} for real.)*`;
  const parts = out.split(/(\s+)/);
  let text = '';
  for (const part of parts) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, part.trim() ? 38 : 0));
    text += part;
    onDelta(part);
  }
  return text;
}
