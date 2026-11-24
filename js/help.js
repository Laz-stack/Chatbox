// Help: a search across every setting and feature (wherever it lives), and short guides.
// Owner pick v46 A: the search sits on Depot; the guides are a Help group at the bottom of Depot,
// each one its own screen (#/help/<id>).
import { S } from './store.js';
import { esc } from './util.js';
import { topbar, icon } from './ui.js';
import { ttsSupported } from './tts.js';
import { sttSupported } from './voice.js';

// Where things live, in the words the app uses.
const DEPOT = 'Depot';
const CHAT = 'Open a chat › ⋯';
const PRESS = 'Long-press a reply';

// kind: 'set' (a setting, opens it), 'chat' (in a chat: opens your latest chat's screen when it has
// one, else says where it is), 'guide' (one of the guides below).
// go: a #/route, a function of the latest chat id, or { row } = a row on Depot to scroll to / open.
export const INDEX = [
  // Depot
  { kind: 'set', t: 'Your persona', where: DEPOT, ic: 'user', w: 'you name description who you are personas', go: '#/persona' },
  { kind: 'set', t: 'Connections', where: `${DEPOT} › AI`, ic: 'link', w: 'api key provider model openrouter openai local llm add connection', go: '#/connections' },
  { kind: 'set', t: 'Helper model', where: `${DEPOT} › Connections`, ic: 'link', w: 'background jobs summaries story tracking scene prompts cheaper second model', go: '#/connections' },
  { kind: 'set', t: 'Scene pictures', where: `${DEPOT} › Connections › Pictures`, ic: 'image', w: 'image model paint picture openrouter perchance nightmare', go: '#/connections/pictures' },
  { kind: 'set', t: 'Nightmare (on this phone)', where: `${DEPOT} › Connections › Pictures`, ic: 'image', w: 'stable diffusion local address token allow browser pages', go: '#/connections/pictures' },
  { kind: 'set', t: 'Lorebook', where: `${DEPOT} › AI`, ic: 'book', w: 'world info entries keys lore', go: '#/lore' },
  { kind: 'set', t: 'Prompts', where: `${DEPOT} › AI`, ic: 'file', w: 'system prompt global instructions jailbreak', go: '#/prompts' },
  { kind: 'set', t: 'Reading text', where: `${DEPOT} › Chat`, ic: 'edit', w: 'font size text colour dialogue narration page paper dark dim texture layout bubbles', go: '#/text' },
  { kind: 'set', t: 'Upright narration', where: 'Reading text › Colours', ic: 'edit', w: 'italic italics slanted cursive upright normal letters narration actions', go: '#/text/colours' },
  { kind: 'set', t: 'Name colours', where: 'Reading text › Colours', ic: 'edit', w: 'name colour color character names tags soft calm pastel pick', go: '#/text/colours' },
  { kind: 'set', t: 'Name tag on speech', where: 'Reading text › Help', ic: 'edit', w: 'speech tag speaker name who is talking label pill', go: '#/text/help' },
  { kind: 'set', t: 'Dim mode', where: `${DEPOT} › Chat`, ic: 'eye', w: 'night dark warm filter eyes schedule', go: { row: 'dimRow' } },
  { kind: 'set', t: 'Reply style', where: `${DEPOT} › Chat`, ic: 'sliders', w: 'length longer shorter point of view first person', go: { row: 'styleRow' } },
  { kind: 'set', t: 'Sound', where: `${DEPOT} › Chat`, ic: 'speaker', w: 'ambience music signal sounds audio', go: { row: 'soundRow' } },
  { kind: 'set', t: 'Auto-summary', where: `${DEPOT} › Chat`, ic: 'spark', w: 'condense long chats memory summary', go: { row: 'tAuto' } },
  { kind: 'set', t: 'While you were away', where: `${DEPOT} › Chat`, ic: 'bell', w: 'away notes gap message', go: { row: 'tAway' } },
  { kind: 'set', t: 'Recap when you come back', where: `${DEPOT} › Chat`, ic: 'restart', w: 'previously recap return', go: { row: 'tRecap' } },
  { kind: 'set', t: 'Token counter', where: `${DEPOT} › Chat`, ic: 'layers', w: 'tokens count context header', go: { row: 'tCounter' } },
  { kind: 'set', t: 'Read replies aloud', where: `${DEPOT} › Chat`, ic: 'speaker', w: 'tts speech voice read aloud', go: { row: 'tRead' }, needs: 'tts' },
  { kind: 'set', t: '18+ content', where: `${DEPOT} › Content`, ic: 'shield', w: 'mature explicit adult nsfw', go: { row: 'tAdult' } },
  { kind: 'set', t: 'Scenes', where: `${DEPOT} › Data`, ic: 'layers', w: 'pictures gallery painted images', go: '#/scenes' },
  { kind: 'set', t: 'Sync', where: `${DEPOT} › Data`, ic: 'restart', w: 'google drive devices phone pc api keys sign in', go: '#/sync' },
  { kind: 'set', t: 'Backup and cards', where: `${DEPOT} › Data`, ic: 'box', w: 'export restore file save cards json', go: '#/backup' },
  { kind: 'set', t: 'Fares', where: 'Fares tab', ic: 'receipt', w: 'cost money spend tokens receipt price', go: '#/fares' },
  { kind: 'set', t: 'Monthly budget', where: 'Fares tab', ic: 'receipt', w: 'limit spend money left to ride', go: '#/fares' },
  // Build
  { kind: 'set', t: 'New character', where: 'Build (red stop)', ic: 'plus', w: 'create character line make', go: '#/edit/new' },
  { kind: 'set', t: 'Group chat (Interchange)', where: 'Build (red stop)', ic: 'talk', w: 'interchange carriage several characters group', go: '#/interchange/new' },
  { kind: 'set', t: 'Character from a picture', where: 'Build (red stop)', ic: 'image', w: 'photo image make character', go: '#/from-picture' },
  { kind: 'set', t: 'Import a card', where: 'Build (red stop)', ic: 'upload', w: 'zip png json tavern card lorebook import', go: '#/import' },
  { kind: 'set', t: 'Browse Datacat', where: 'Build (red stop)', ic: 'search', w: 'find characters online datacat', go: '#/datacat' },
  // In a chat, ⋯ menu
  { kind: 'chat', t: 'Route map', where: CHAT, ic: 'route', w: 'stations story timeline track the story', go: (id) => `#/route/${id}` },
  { kind: 'chat', t: 'Bonds', where: CHAT, ic: 'heart', w: 'relationship feelings trust affection', go: (id) => `#/bonds/${id}` },
  { kind: 'chat', t: 'Diary', where: CHAT, ic: 'edit', w: 'private entries journal', go: (id) => `#/diary/${id}` },
  { kind: 'chat', t: 'World map', where: CHAT, ic: 'mappin', w: 'places location where we are', go: (id) => `#/map/${id}` },
  { kind: 'chat', t: 'Quests and items (Adventure mode)', where: CHAT, ic: 'dice', w: 'adventure d20 dice quests inventory suggested moves', go: (id) => `#/adventure/${id}` },
  { kind: 'chat', t: 'Memory and notes', where: CHAT, ic: 'spark', w: 'memory book summary pinned notes facts remember', go: (id) => `#/memory/${id}` },
  { kind: 'chat', t: 'Final prompt', where: CHAT, ic: 'receipt', w: 'what is sent tokens prompt', go: (id) => `#/final/${id}` },
  { kind: 'chat', t: 'Chapters', where: CHAT, ic: 'book', w: 'chapter arcs' },
  { kind: 'chat', t: 'Recap so far', where: CHAT, ic: 'restart', w: 'previously summary recap' },
  { kind: 'chat', t: 'Story time', where: CHAT, ic: 'clock', w: 'clock time of day weather' },
  { kind: 'chat', t: 'Voice mode (hands-free)', where: CHAT, ic: 'mic', w: 'talk speak microphone', needs: 'both' },
  { kind: 'chat', t: 'Character’s voice', where: CHAT, ic: 'speaker', w: 'voice read aloud tts', needs: 'tts' },
  { kind: 'chat', t: 'Find in this chat', where: CHAT, ic: 'search', w: 'search messages find' },
  { kind: 'chat', t: 'Bookmarks', where: CHAT, ic: 'bookmark', w: 'saved places marks' },
  { kind: 'chat', t: 'Window (scene picture)', where: CHAT, ic: 'image', w: 'background station sign picture top' },
  { kind: 'chat', t: 'Export as story', where: CHAT, ic: 'download', w: 'save text story file' },
  { kind: 'chat', t: 'Start a new chat', where: CHAT, ic: 'plus', w: 'new chat fresh again' },
  // Long-press a reply
  { kind: 'chat', t: 'Edit, copy or delete a message', where: PRESS, ic: 'edit', w: 'edit message copy delete' },
  { kind: 'chat', t: 'Rewrite a reply', where: PRESS, ic: 'refresh', w: 'rewrite longer shorter more dialogue vivid' },
  { kind: 'chat', t: 'Picture this', where: PRESS, ic: 'image', w: 'paint picture image scene nightmare perchance explicit mood' },
  { kind: 'chat', t: 'Star a line', where: PRESS, ic: 'star', w: 'star favourite logbook quote' },
  { kind: 'chat', t: 'Pin to notes', where: PRESS, ic: 'file', w: 'pin note remember' },
  { kind: 'chat', t: 'Branch from here', where: PRESS, ic: 'branch', w: 'branch copy new chat from message' },
  { kind: 'chat', t: 'Other versions of a reply', where: 'Swipe the latest reply sideways, or the ‹ › arrows under a reply', ic: 'layers', w: 'swipe alternate regenerate versions compare' },
];

export const GUIDES = [
  {
    id: 'start', t: 'Getting started', sub: 'Your first chat in three steps', ic: 'spark', y: 'Your first chat',
    p: 'Chatbox starts with demo replies so you can look around. To talk with a real AI, add a connection with your own key.',
    steps: ['Open Depot › Connections and add one (OpenRouter is the easiest: one key, many models).', 'Go to Platform and tap a character, or make your own with the red Build stop.', 'Write in the box at the bottom and send. Wrap actions in *asterisks*.'],
    go: ['#/connections', 'Go to Connections'],
  },
  {
    id: 'chats', t: 'Chats and messages', sub: 'Long-press, versions, rewrite', ic: 'talk', y: 'What you can do in a chat',
    p: 'Most of what you can do to a message is behind a long-press, and most of what you can do to a chat is behind ⋯ at the top.',
    steps: ['Long-press a reply for its menu: edit, copy, read aloud, star, pin, rewrite, picture this, mark it on the story, branch or delete.', 'Swipe the latest reply sideways (or use the ‹ › arrows under a reply) to see other versions; Regenerate writes a new one.', 'Continue lets the character keep going; Write for me writes your next line.', 'Tap ⋯ for the story tools, memory, voice, reply style and export.'],
  },
  {
    id: 'pictures', t: 'Pictures', sub: 'Perchance, Nightmare, OpenRouter', ic: 'image', y: 'Painting a scene',
    p: 'Long-press a reply and choose Picture this. Chatbox writes the scene; the picture is painted in one of three ways.',
    steps: ['Perchance: free and needs no setup. Chatbox copies the prompt, you paint it on Perchance and add the picture.', 'Nightmare: the app on your phone. In Nightmare, Settings › Advanced: turn on “Listen on the local network” and “Allow browser pages”, then copy the token into Depot › Connections › Pictures.', 'An image model through OpenRouter: pick it in Depot › Connections › Pictures.', 'Pick a mood and framing. Turn on Show the prompt first to read and change the tags before painting.'],
    go: ['#/connections/pictures', 'Go to Pictures'],
  },
  {
    id: 'story', t: 'Story tools', sub: 'Route map, Bonds, Quests, World map, Memory', ic: 'route', y: 'Keeping track of the story',
    p: 'Each chat keeps its own story: where you’ve been, how the characters feel, what they remember. Open them from ⋯ in the chat.',
    steps: ['Route map: the moments that mattered. Turn on Track the story there and it fills itself every couple of replies.', 'Bonds and Diary: how each character feels about you, and their private entries.', 'World map and Story time: where you are and when.', 'Quests and items: turn on Adventure mode for suggested moves and a d20.', 'Memory and notes: the summary, lasting facts, and notes sent with every reply.'],
  },
  {
    id: 'sync', t: 'Sync and backup', sub: 'Keep everything on every device', ic: 'restart', y: 'Your data, safe and everywhere',
    p: 'Everything lives in this browser. Sync keeps a copy in your own Google Drive and brings it to your other devices; a backup is a file you keep.',
    steps: ['Depot › Sync: follow the steps to add your own Google client ID once, then sign in.', 'Do the same on your other device. Chats, characters, pictures, Fares and API keys come across.', 'Depot › Backup and cards › Export everything saves one file. Restore puts it back.'],
    go: ['#/sync', 'Go to Sync'],
  },
  {
    id: 'fares', t: 'Fares and costs', sub: 'What replies and pictures cost', ic: 'receipt', y: 'What it costs',
    p: 'The Fares tab is a receipt for this month: replies, scenes and the Helper, from every device you sync.',
    steps: ['With OpenRouter, each cost is what OpenRouter charged.', 'For other connections, set the prices in the connection’s More options and Chatbox works it out.', 'Set a monthly budget on the receipt; the bar turns striped when under 20% is left.'],
    go: ['#/fares', 'Go to Fares'],
  },
  {
    id: 'fixes', t: 'When something goes wrong', sub: 'Fixes for common problems', ic: 'shield', y: 'Quick fixes',
    p: 'The most common problems and what to do.',
    steps: ['A change doesn’t show: fully reload the page, or open it with ?v=2 at the end of the address.', 'Couldn’t reach Nightmare: open the Nightmare app and check both Advanced switches and the token.', 'A model declined to write a scene: pick a less strict model for the chat or for the Helper (Depot › Connections), or write the prompt yourself with Show the prompt first.', 'Empty replies: some models only think. Pick another model, or raise Max reply tokens in the connection.', 'Storage full: delete pictures you don’t need in Depot › Scenes, or make a backup first.'],
  },
];

// Every entry a search can show: the index plus the guides.
// Things this browser can't do (speech) aren't offered.
const can = (e) => !e.needs || (e.needs === 'tts' ? ttsSupported : e.needs === 'both' ? ttsSupported && sttSupported : true);
const ALL = [...INDEX.filter(can), ...GUIDES.map((g) => ({ kind: 'guide', t: g.t, where: 'Guide', ic: g.ic, w: `${g.sub} ${g.p} ${g.steps.join(' ')}`, go: `#/help/${g.id}` }))];
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Settings, chat features and guides matching every word of q, best first.
export function findHelp(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return ALL.map((e) => {
    const title = norm(e.t);
    const hay = `${title} ${norm(e.where)} ${norm(e.w)}`;
    if (!words.every((w) => hay.includes(w))) return null;
    const score = words.reduce((a, w) => a + (title.startsWith(w) ? 4 : title.includes(w) ? 2 : 0), 0);
    return { e, score };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

// The chat you were in last (for "in a chat" results).
export const latestChatId = () => [...S.chats.values()].filter((c) => c.messages?.length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]?.id || null;

// Highlight what was searched for: find the spans on the plain text, then escape and wrap in one pass.
export function mark(text, q) {
  const low = norm(text);
  const on = new Array(text.length).fill(false);
  for (const w of norm(q).split(/\s+/).filter((x) => x.length > 1)) {
    const i = low.indexOf(w);
    if (i >= 0) for (let k = i; k < i + w.length && k < text.length; k++) on[k] = true;
  }
  let out = '';
  for (let i = 0; i < text.length; ) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    out += on[i] ? `<mark>${esc(text.slice(i, j))}</mark>` : esc(text.slice(i, j));
    i = j;
  }
  return out;
}

export function helpView(id) {
  const g = GUIDES.find((x) => x.id === id);
  if (!g) return null;
  const html = `<div class="screen no-tab help-screen">
    ${topbar({ back: '#/settings' })}
    <h1 class="t2 cr-t2"><span>${esc(g.t)}</span><span class="sub">${esc(g.y)}</span></h1>
    <p class="help-p">${esc(g.p)}</p>
    <ol class="help-steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${g.go ? `<a class="help-go press" href="${g.go[0]}">${esc(g.go[1])}${icon('chev', 18)}</a>` : ''}
    <p class="help-more">More guides are in Depot › Help.</p>
  </div>`;
  return { html, depth: 2 };
}
