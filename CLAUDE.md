# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chatdown is a Chrome extension (Manifest v3) that converts AI chat conversations into Markdown articles. It injects a button into supported AI chat platforms (ChatGPT, Gemini, DeepSeek, Doubao), parses the conversation from the DOM, sends it to an LLM API, and displays the generated article in a floating overlay window. Supports full conversation or partial round selection modes, with optional export to Notion and Obsidian.

## Build Commands

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

## Architecture

### Extension Components

The extension follows Chrome Extension Manifest v3 architecture with these main components:

1. **Background Service Worker** (`src/background/index.ts`)
   - Handles message passing between content scripts and overlay window
   - Manages LLM API calls via `llm-client.ts` (streaming support)
   - Coordinates overlay window opening and article generation
   - Handles Notion export via `notion-client.ts`
   - Handles Obsidian export via `obsidian://` URI scheme
   - Uses Chrome storage API via `storage.ts` for persisting article state and configuration

2. **Content Script** (`src/content/index.tsx`)
   - Injected into supported AI chat platforms
   - Renders a "Chatdown" button with mode selector (full conversation vs. partial rounds)
   - Uses platform-specific parsers to extract conversation messages
   - Sends parsed messages to background worker
   - Manages overlay window visibility via custom DOM events

3. **Overlay Window** (`src/content/OverlayApp.tsx`)
   - Floating draggable/resizable window injected into the host page (replaced the side panel)
   - Displays generated articles with preview and markdown views
   - Provides copy, download, regenerate, edit, and export functionality
   - Communicates with background worker via Chrome runtime messaging and custom DOM events (`src/content/events.ts`)

4. **Popup** (`src/popup/`)
   - Shows platform support information
   - Links to settings page

5. **Settings Page** (`src/settings/`)
   - Configures OpenAI-compatible API endpoint, key, and model
   - Configures optional Notion integration (integration token + database ID)
   - Configures optional Obsidian integration (vault name + folder path)
   - Configures UI language preference
   - Tests API and Notion connections
   - Stores all configuration in Chrome storage

### Platform Parsers

Each supported platform has a dedicated parser in `src/content/parsers/`:

- **ChatGPT** (`chatgpt.ts`): Parses OpenAI chat interface
- **Gemini** (`gemini.ts`): Parses Google Gemini interface
- **DeepSeek** (`deepseek.ts`): Parses DeepSeek chat interface
- **Doubao** (`doubao.ts`): Parses Doubao chat interface

The parser factory (`parsers/index.ts`) detects the current platform by hostname and returns the appropriate parser. Each parser implements the `ChatParser` interface and extracts `Message[]` from the DOM.

### Message Flow

**Full mode:**
1. User clicks "Chatdown" button (full conversation mode)
2. Content script parses conversation and generates a hash
3. Content script sends `startArticleGeneration` to background worker
4. Background worker checks cache — returns cached article or proceeds to generate
5. Background worker calls LLM API (streaming), sending `articleChunk` messages to overlay
6. Background worker sends `displayArticle` when complete; article saved to storage

**Partial mode:**
1. User selects "Selected rounds" mode
2. Content script sends `startArticleGeneration` with `mode: 'partial'`
3. Background worker calls LLM to summarize each conversation round (`summarizing_rounds` phase)
4. Overlay displays round summaries; user selects which rounds to include
5. User confirms selection → `generateArticleFromSelection` sent to background worker
6. Background worker generates article from selected rounds only

### Caching Mechanism

- Articles are cached based on conversation content hash
- Same conversation will reuse cached article (no API call)
- Conversation changes trigger new generation automatically
- Hold Shift key while clicking to force regenerate (bypass cache)

### Type System

All shared types are defined in `src/types/index.ts`:
- `Message`: User/assistant message with role and content
- `ApiConfig`: LLM API configuration (base URL, key, model)
- `NotionConfig`: Notion integration configuration (integration token, database ID)
- `ObsidianConfig`: Obsidian integration configuration (vault name, folder path)
- `ArticleState`: Complete article state including workflow phase, mode, rounds, and content
- `WorkflowPhase`: Article generation workflow states (`idle`, `summarizing_rounds`, `selecting_rounds`, `generating`, `ready`, `error`)
- `GenerationMode`: Article generation modes (`full`, `partial`)
- `ConversationRound`: Conversation round with summary and message indexes
- `ChromeMessage`: Message format for Chrome runtime messaging
- `ChromeResponse`: Response format for Chrome runtime messaging
- `Platform`: Supported platform types
- `ChatParser`: Interface for platform parsers
- `Locale` and `LocalePreference`: i18n types for language support

### Internationalization (i18n)

The extension supports multiple languages via `src/i18n/core.ts`:
- **Supported locales**: English (`en`), Simplified Chinese (`zh-CN`), Traditional Chinese (`zh-TW`), Japanese (`ja`)
- **Auto-detection**: Follows browser language by default
- **User preference**: Configurable in settings page
- **Translation function**: `createTranslator(locale)` returns a `t(key, params?)` function
- All UI strings are defined in `src/i18n/core.ts` with keys like `settingsHeading`, `overlayExportToNotion`, etc.

## Development Notes

### Adding a New Platform

1. Create a new parser in `src/content/parsers/[platform].ts` implementing `ChatParser`
2. Add platform detection logic in `parsers/index.ts` `detectPlatform()`
3. Add parser instantiation in `parsers/index.ts` `getParser()`
4. Update `Platform` type in `src/types/index.ts`
5. Add host permissions and content script matches in `public/manifest.json`

### Build System

- Uses Vite with `@crxjs/vite-plugin` for Chrome extension bundling
- React with TypeScript for UI components
- Tailwind CSS for styling (with `@tailwindcss/typography` for article preview)
- `marked` library for Markdown rendering in overlay window

### Chrome Extension Specifics

- Manifest v3 with service worker background script
- Content scripts inject React components (button + overlay) into host pages
- Chrome storage API for persisting article state, API configuration, and user preferences
- Message passing between content script, background worker, and overlay window
- Custom DOM events for overlay visibility management (`src/content/events.ts`)

### Export Integrations

**Notion Export** (`src/background/notion-client.ts`):
- Converts Markdown to Notion blocks (headings, lists, code blocks, tables, inline formatting)
- Requires database with properties: `title` (Title), `source` (URL), `platform` (Multi-select), `timestamp` (Date)
- Optional `tag` property for categorization
- Tests connection and validates required properties before export

**Obsidian Export**:
- Uses `obsidian://` URI scheme to open Obsidian and create notes
- Requires vault name configuration; optional folder path (defaults to "Chatdown")
- Passes article content via URI-encoded parameters

### Testing the Extension

1. Build with `npm run build`
2. Load `dist/` directory as unpacked extension in Chrome
3. Configure API settings via extension popup → Settings
4. Visit a supported platform and start a conversation
5. Click the "Chatdown" button to generate an article
