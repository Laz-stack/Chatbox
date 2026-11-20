// Lorebook Enhance: the AI expands an entry's text and suggests keywords, keeping every fact given.
import { PROVIDERS } from './providers.js';
import { helperComplete } from './helper.js';
import { extractJson } from './blueprint.js';

const str = (v) => (v == null ? '' : String(v).trim());

// entry: { title, keys, text }. context: who it's used with (names, taglines, chat titles).
export async function enhanceLore({ conn, entry, context = [], signal }) {
  if (!conn || PROVIDERS[conn.provider]?.format === 'demo') return demoLore(entry);
  const system =
    'You improve world-info entries (a lorebook) for a roleplay chat app. Reply with ONE JSON object and nothing else. ' +
    'Every character is an adult. Write "{{user}}" where the user is meant.';
  const brief = { title: str(entry.title), keywords: entry.keys || [], text: str(entry.text).slice(0, 3000), used_with: context.slice(0, 8) };
  const ask =
    'Return {"title": "...", "keywords": ["..."], "text": "..."}. ' +
    'text: rewrite and expand the entry into 3 to 6 clear sentences (under 130 words) of concrete facts the characters would know: what it is, how it looks or feels, who is involved, one or two specific details or rules, and a hook stories can use. ' +
    'Keep every fact already given and contradict none. Present tense, no story narration, no dialogue. ' +
    'keywords: 3 to 6 short words or names people would naturally say in chat when this comes up, including the existing ones. ' +
    'title: keep it, or write a short one if it is empty.';
  const text = await helperComplete(conn, 'enhance', { system, messages: [{ role: 'user', content: JSON.stringify(brief) + '\n\n' + ask }], stream: false, maxTokens: Math.max(conn.maxTokens || 600, 900), temperature: 0.8, signal });
  const out = extractJson(text);
  const keys = (Array.isArray(out.keywords) ? out.keywords : String(out.keywords || '').split(',')).map(str).filter(Boolean);
  return { title: str(out.title).slice(0, 80), keys, text: str(out.text).slice(0, 3000) };
}

// Demo mode: no AI, so a gentle built-in expansion that keeps the user's words.
function demoLore(e) {
  const title = str(e.title) || (e.keys || [])[0] || 'The place';
  const base = str(e.text);
  const add = `Regulars know ${title} by its small habits: the same lights, the same sounds, the same faces at the same hours. Something about it has quietly changed lately, and anyone paying attention has noticed.`;
  const words = title.split(/\s+/).filter((w) => w.length > 2);
  return { title, keys: [...(e.keys || []), ...words, words.length > 1 ? words[0] : ''].filter(Boolean), text: (base ? base + ' ' : `${title} is a place the characters know well. `) + add, demo: true };
}
