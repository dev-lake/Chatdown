# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chatdown is a Chrome extension (Manifest v3) that converts AI chat conversations into Markdown articles. It injects a button into supported AI chat platforms (ChatGPT, Gemini, DeepSeek), parses the conversation from the DOM, sends it to an LLM API, and displays the generated article in a side panel.

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
   - Handles message passing between content scripts and side panel
   - Manages LLM API calls via `llm-client.ts`
   - Coordinates side panel opening and article generation
   - Uses Chrome storage API via `storage.ts`

2. **Content Script** (`src/content/index.tsx`)
   - Injected into supported AI chat platforms
   - Renders a "Chatdown" button in the platform's UI
   - Uses platform-specific parsers to extract conversation messages
   - Sends parsed messages to background worker

3. **Side Panel** (`src/sidepanel/`)
   - Displays generated articles with preview and markdown views
   - Provides copy, download, and regenerate functionality
   - Receives article content from background worker via message passing

4. **Popup** (`src/popup/`)
   - Shows platform support information
   - Links to settings page

5. **Settings Page** (`src/settings/`)
   - Configures OpenAI-compatible API endpoint, key, and model
   - Tests API connection
   - Stores configuration in Chrome storage

### Platform Parsers

Each supported platform has a dedicated parser in `src/content/parsers/`:

- **ChatGPT** (`chatgpt.ts`): Parses OpenAI chat interface
- **Gemini** (`gemini.ts`): Parses Google Gemini interface
- **DeepSeek** (`deepseek.ts`): Parses DeepSeek chat interface

The parser factory (`parsers/index.ts`) detects the current platform by hostname and returns the appropriate parser. Each parser implements the `ChatParser` interface and extracts `Message[]` from the DOM.

### Message Flow

1. User clicks "Chatdown" button in content script
2. Content script parses conversation using platform-specific parser
3. Content script sends `openSidePanel` message to background worker with parsed messages
4. Background worker opens side panel and sends `generatingArticle` loading state
5. Background worker calls LLM API with conversation messages
6. Background worker sends `displayArticle` message to side panel with generated article
7. Side panel displays article with preview/markdown tabs

### Type System

All shared types are defined in `src/types/index.ts`:
- `Message`: User/assistant message with role and content
- `ApiConfig`: LLM API configuration (base URL, key, model)
- `ChromeMessage`: Message format for Chrome runtime messaging
- `ChromeResponse`: Response format for Chrome runtime messaging
- `Platform`: Supported platform types
- `ChatParser`: Interface for platform parsers

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
- `marked` library for Markdown rendering in side panel

### Chrome Extension Specifics

- Manifest v3 with service worker background script
- Content scripts inject React components into host pages
- Side panel API for article display (Chrome 114+)
- Chrome storage API for persisting API configuration
- Message passing between content script, background worker, and side panel

### Testing the Extension

1. Build with `npm run build`
2. Load `dist/` directory as unpacked extension in Chrome
3. Configure API settings via extension popup → Settings
4. Visit a supported platform and start a conversation
5. Click the "Chatdown" button to generate an article
