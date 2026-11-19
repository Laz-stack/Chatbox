// App state, persisted to the browser. Everything lives on this device.
import * as db from './db.js';
import { uid } from './util.js';

export const LINE_COLORS = ['#2EAA67', '#FB4DAA', '#FE6500', '#B8ACFE', '#FDCD15', '#065BFE', '#ECECEC', '#E70404'];

export const DEFAULT_GLOBAL =
  'Write actions in *asterisks* and dialogue in quotes. Keep replies under 120 words unless asked for more. Never speak or act for {{user}}. Stay in character.';

const DEFAULT_SETTINGS = {
  globalPrompt: DEFAULT_GLOBAL,
  globalOn: true,
  activeConnectionId: null,
  autoSummary: true,
  showCounter: true,
  readAloud: false,
  voiceURI: '',
  remindBackup: true,
  lastBackup: null,
  includeKeysInBackup: true,
};

export const S = {
  settings: { ...DEFAULT_SETTINGS },
  persona: { name: '', about: '', avatarImage: null, preset: 'kai', color: '#065BFE', useEverywhere: true },
  connections: [],
  characters: [],
  chats: new Map(),
};

export function newConnection(provider = 'anthropic') {
  return {
    id: uid(),
    name: '',
    provider,
    baseUrl: '',
    model: provider === 'anthropic' ? 'claude-sonnet-5-5' : '',
    apiKey: '',
    temperature: 0.9,
    maxTokens: 600,
    context: 16000,
    prompt: '',
    replaceGlobal: false,
    useProxy: false,
  };
}

export function blankCharacter() {
  const used = new Set(S.characters.map((c) => c.line?.color));
  const color = LINE_COLORS.find((c) => !used.has(c)) || LINE_COLORS[S.characters.length % LINE_COLORS.length];
  const presets = ['mika', 'ren', 'sora', 'haru', 'yui'];
  return {
    id: uid(),
    name: '',
    tagline: '',
    persona: '',
    firstMessage: '',
    line: { letter: '', color },
    preset: presets[S.characters.length % presets.length],
    avatarImage: null,
    scene: 'cafe',
    sceneBlur: 4,
    sceneDim: 60,
    connectionId: null,
    useGlobal: true,
    stream: true,
    createdAt: Date.now(),
  };
}

function seedCharacter() {
  return {
    ...blankCharacter(),
    id: 'mika',
    name: 'Mika',
    tagline: 'Cafe by the station',
    persona:
      "You are {{char}}, a cheerful barista who runs a tiny cafe by the train station. You remember every regular's order, hum while you work, and get flustered by compliments. Speak warmly in short lines.",
    firstMessage: '*looks up from the counter* "Oh! You came back. Same window seat?"',
    line: { letter: 'M', color: '#2EAA67' },
    preset: 'mika',
    scene: 'cafe',
  };
}

function demoConnection() {
  return { ...newConnection('demo'), id: 'demo', name: 'Demo', model: 'canned replies' };
}

export async function load() {
  const all = new Map(await db.entries());
  if (all.has('settings')) S.settings = { ...DEFAULT_SETTINGS, ...all.get('settings') };
  if (all.has('persona')) S.persona = { ...S.persona, ...all.get('persona') };
  S.connections = all.get('connections') || [];
  S.characters = all.get('characters') || [];
  S.chats = new Map();
  for (const [k, v] of all) if (typeof k === 'string' && k.startsWith('chat:')) S.chats.set(k.slice(5), v);

  if (!all.has('seeded')) {
    if (!S.connections.length) S.connections = [demoConnection()];
    if (!S.characters.length) S.characters = [seedCharacter()];
    S.settings.activeConnectionId = S.connections[0].id;
    await Promise.all([saveConnections(), saveCharacters(), saveSettings(), db.set('seeded', true)]);
  }
  if (!S.connections.find((c) => c.id === S.settings.activeConnectionId)) {
    S.settings.activeConnectionId = S.connections[0]?.id || null;
  }
}

export const saveSettings = () => db.set('settings', S.settings);
export const savePersona = () => db.set('persona', S.persona);
export const saveConnections = () => db.set('connections', S.connections);
export const saveCharacters = () => db.set('characters', S.characters);

export const character = (id) => S.characters.find((c) => c.id === id);
export const connection = (id) => S.connections.find((c) => c.id === id);
export const activeConnection = () => connection(S.settings.activeConnectionId) || S.connections[0] || null;
export const connectionFor = (ch) => (ch?.connectionId && connection(ch.connectionId)) || activeConnection();

export async function saveCharacter(ch) {
  const i = S.characters.findIndex((c) => c.id === ch.id);
  if (i >= 0) S.characters[i] = ch;
  else S.characters.push(ch);
  await saveCharacters();
}

export async function deleteCharacter(id) {
  S.characters = S.characters.filter((c) => c.id !== id);
  S.chats.delete(id);
  await Promise.all([saveCharacters(), db.del('chat:' + id)]);
}

export async function saveConnection(c) {
  const i = S.connections.findIndex((x) => x.id === c.id);
  if (i >= 0) S.connections[i] = c;
  else S.connections.push(c);
  await saveConnections();
}

export async function deleteConnection(id) {
  S.connections = S.connections.filter((c) => c.id !== id);
  if (S.settings.activeConnectionId === id) S.settings.activeConnectionId = S.connections[0]?.id || null;
  S.characters.forEach((c) => {
    if (c.connectionId === id) c.connectionId = null;
  });
  await Promise.all([saveConnections(), saveSettings(), saveCharacters()]);
}

// Messages keep every alternate reply in `alts`; `alt` is the one shown.
export const textOf = (m) => (m ? m.alts[m.alt] ?? '' : '');

export function newChat(charId) {
  const ch = character(charId);
  const messages = [];
  if (ch?.firstMessage?.trim()) {
    messages.push({ id: uid(), role: 'assistant', alts: [ch.firstMessage], alt: 0, mood: 'happy', at: Date.now(), first: true });
  }
  return { characterId: charId, messages, summary: null, notes: [], updatedAt: Date.now(), startedAt: Date.now() };
}

export async function getChat(charId) {
  if (!S.chats.has(charId)) {
    const c = newChat(charId);
    S.chats.set(charId, c);
    await db.set('chat:' + charId, c);
  }
  return S.chats.get(charId);
}

export async function saveChat(chat, touch = true) {
  if (touch) chat.updatedAt = Date.now();
  S.chats.set(chat.characterId, chat);
  await db.set('chat:' + chat.characterId, chat);
}

export async function resetChat(charId) {
  const c = newChat(charId);
  const old = S.chats.get(charId);
  if (old) c.notes = old.notes; // pinned notes survive a fresh start
  await saveChat(c);
  return c;
}

// A chat has "started" once the user has said something.
export const hasStarted = (chat) => !!chat && chat.messages.some((m) => m.role === 'user');

export function lastMessage(chat) {
  return chat?.messages[chat.messages.length - 1] || null;
}

// --- backup ---
export function snapshot({ includeKeys = true } = {}) {
  return {
    app: 'chatbox',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: S.settings,
    persona: S.persona,
    connections: S.connections.map((c) => (includeKeys ? c : { ...c, apiKey: '' })),
    characters: S.characters,
    chats: [...S.chats.values()],
  };
}

export async function restore(data) {
  if (!data || data.app !== 'chatbox') throw new Error('This file is not a Chatbox backup.');
  await db.clear();
  await db.set('seeded', true);
  S.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  S.persona = { ...S.persona, ...(data.persona || {}) };
  S.connections = data.connections || [];
  S.characters = data.characters || [];
  S.chats = new Map();
  for (const c of data.chats || []) S.chats.set(c.characterId, c);
  await Promise.all([
    saveSettings(),
    savePersona(),
    saveConnections(),
    saveCharacters(),
    ...[...S.chats.values()].map((c) => db.set('chat:' + c.characterId, c)),
  ]);
}

export const isPersistent = db.persistent;
