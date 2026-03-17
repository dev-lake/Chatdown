# Chatdown Browser Extension

Convert AI chat conversations into structured Markdown articles.

## Features

- Supports ChatGPT, Google Gemini, and DeepSeek
- Uses your own LLM API (OpenAI-compatible)
- Preview and export as Markdown
- Copy to clipboard or download

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build
```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` directory

## Development

Run with hot reload:
```bash
npm run dev
```

Then load the `dist/` directory as an unpacked extension.

## Configuration

1. Click the extension icon in the toolbar
2. Click "Open Settings"
3. Enter your API configuration:
   - API Base URL (e.g., `https://api.openai.com`)
   - API Key
   - Model Name (e.g., `gpt-4o-mini`)
4. Click "Test Connection" to verify
5. Click "Save Settings"

## Usage

1. Navigate to a supported AI chat platform
2. Have a conversation
3. Click the 📝 button on the right edge of the page
4. The browser's native side panel will open with your generated article
5. Switch between Preview and Markdown tabs
6. Copy to clipboard or download as .md file

**Note**: The side panel uses Chrome's native Side Panel API, similar to the bookmarks sidebar. This means:
- The panel won't interfere with the page content
- You can view the article alongside the chat
- The panel can be closed/reopened without losing content

## Supported Platforms

- ChatGPT (chat.openai.com, chatgpt.com)
- Google Gemini (gemini.google.com)
- DeepSeek (chat.deepseek.com)

## Tech Stack

- TypeScript
- React 18
- Vite
- Tailwind CSS
- Chrome Extension Manifest v3

## Note on Icons

The extension requires icon files in `public/icons/`:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You'll need to create these icons before the extension can be loaded.
