# Chatbox

Your own roleplay chat app. Make characters, chat with them, and bring your own AI key.
Everything is saved in your browser. Nothing goes to a server of ours.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. No install step, no dependencies.

```bash
cd chatbox
npm start
```

Then open **http://127.0.0.1:5173** in your browser.

On first start you get a sample character (Mika) and a **Demo** connection with canned replies,
so you can try everything before adding a key.

## Connect your AI

Settings → Connections → **+**. Pick a provider, paste your key, type the model name, then **Save and test**.

| Provider | Base URL (default) | Model example |
|---|---|---|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-5-5` |
| OpenAI or any OpenAI-compatible API | `https://api.openai.com/v1` | the model name from your provider |
| OpenRouter | `https://openrouter.ai/api/v1` | `provider/model-name` |
| Custom URL (LM Studio, Ollama, llama.cpp…) | `http://localhost:1234/v1` | your local model name |

Each connection has its own model, key, temperature, reply length, context size and an optional
**connection prompt**. The connection prompt is added after the global prompt (or replaces it if you
turn on *Replace global prompt*).

**If a provider blocks requests from the browser** (you see "Couldn't reach the provider"), open the
connection, go to *Advanced*, and turn on **Route through local server**. The request then goes
through `server.js` on your own computer. This only works while `npm start` is running.

## What's in it

- **Chat** with streaming replies, Regenerate, Continue, and swipe (or the ‹ › pager) between alternate replies
- **Long-press or right-click a message** to edit, copy, read aloud, pin to notes or delete (with undo)
- **Character cards**: name, tagline, line letter and colour, persona prompt, first message, drawn avatar with
  four expressions (or your own image), scene, connection, stream on/off
- **Import cards** from other sites (PNG or JSON, V1/V2/V3), **export** as PNG card or JSON
- **Prompts**: one global prompt for every chat, per-connection prompts, per-character opt-out,
  and a **Final prompt** preview with token counts per layer
- **Memory**: auto-summary of long chats, pinned notes, token counter
- **Your persona**: your name and description, sent to characters
- **Scenes** behind the chat with blur and dim
- **Read aloud** with your browser's voices
- **Backup and restore** everything as one JSON file (with or without API keys)

Prompt order for each reply: 1 global prompt → 2 connection prompt → 3 character persona →
4 your persona → 5 notes and summary → 6 the chat (newest last, trimmed to the context size).
In prompts, `{{char}}` becomes the character's name and `{{user}}` becomes yours.

## Your data

- Stored in this browser (IndexedDB). Clearing site data erases it, so use **Backup** now and then.
- Your API keys are stored here too and are sent only to the provider you picked
  (or to your own local server if you turned on routing).
- A backup file can contain your keys. Turn off *Include API keys* before sharing one.

## Put it online

The app is plain static files, so any static host works (Netlify, Vercel, GitHub Pages, Cloudflare Pages).
Upload everything except `server.js` and `package.json`. Without `server.js`, *Route through local server*
is not available, so use providers that allow browser requests (Anthropic, OpenRouter and most local servers do).

Do not run `server.js` on a public server: its relay would let anyone send requests through it.
It listens only on `127.0.0.1` by default for that reason.

## Files

```
index.html            app shell
styles/app.css        design system, components, animations
js/main.js            router and screen transitions
js/store.js           saved data (characters, chats, connections, settings)
js/db.js              IndexedDB key-value store
js/providers.js       Anthropic / OpenAI-compatible streaming, demo replies, connection test
js/prompt.js          builds the layered prompt and token estimates
js/memory.js          auto-summary of long chats
js/cards.js           character card import/export (PNG chunks, JSON)
js/tts.js             read aloud
js/avatar.js          drawn avatars and expressions
js/scenes.js          backdrop scenes
js/ui.js              shared UI: sheets, menus, toasts, dial, ruler, tab bar
js/views/*.js         the screens
server.js             optional local server and relay (Node 18+, no dependencies)
```
