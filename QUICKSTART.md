# Chatdown - Quick Start Guide

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Extension
```bash
npm run build
```

This will create a `dist/` directory with the compiled extension.

### 3. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `dist/` directory from this project
5. The Chatdown extension should now appear in your extensions list

## Configuration

Before using the extension, you need to configure your LLM API:

1. Click the Chatdown icon in your Chrome toolbar
2. Click "Open Settings"
3. Fill in the configuration:
   - **API Base URL**: Your OpenAI-compatible API endpoint
     - OpenAI: `https://api.openai.com`
     - Azure OpenAI: `https://your-resource.openai.azure.com`
     - Local Ollama: `http://localhost:11434`
   - **API Key**: Your API key (stored locally)
   - **Model Name**: The model to use (e.g., `gpt-4o-mini`, `gpt-4`)
4. Click "Test Connection" to verify your settings
5. Click "Save Settings"

Optional Obsidian export:

1. In Settings, scroll to "Obsidian Integration (Optional)"
2. Enter your Obsidian **Vault Name** exactly as shown in Obsidian
3. Keep the default **Folder Path** (`Chatdown`) or enter another vault-relative folder
4. Click "Save Settings"

## Usage

1. Navigate to a supported AI chat platform:
   - ChatGPT: https://chat.openai.com or https://chatgpt.com
   - Google Gemini: https://gemini.google.com
   - DeepSeek: https://chat.deepseek.com
   - Doubao: https://www.doubao.com

2. Have a conversation with the AI

3. Click the `Chatdown` button in the page header or floating action area

4. Wait for the article to be generated

5. In the article workspace / side panel:
   - Switch between rendered preview and raw Markdown
   - Click "Copy to Clipboard" to copy the markdown
   - Click "Download Markdown" to save as a `.md` file
   - Click "Export to Obsidian" to create a note in the Obsidian desktop app
   - Click "Regenerate" to create a new version

## Development Mode

For development with hot reload:

```bash
npm run dev
```

Then load the `dist/` directory as an unpacked extension. Changes will be reflected automatically (you may need to reload the extension or refresh the page).

## Troubleshooting

### Extension doesn't load
- Make sure you've run `npm run build`
- Check that the `dist/` directory exists
- Verify all icon files are present in `public/icons/`

### `Chatdown` button doesn't appear
- Verify you're on a supported platform
- Check the browser console for errors
- Try refreshing the page

### API errors
- Verify your API configuration in settings
- Test the connection using the "Test Connection" button
- Check that your API key is valid and has sufficient credits
- Ensure the API Base URL is correct (no trailing slash)

### Obsidian export doesn't open
- Make sure Obsidian is installed and the `obsidian://` protocol is allowed by your browser
- Verify the Vault Name matches an existing Obsidian vault exactly
- Check that the Folder Path exists or can be created in your vault

### No conversation found
- Make sure you have messages in the chat
- Try scrolling through the conversation to load all messages
- Some platforms may have dynamic loading - wait for all messages to load

## File Structure

```
chatdown/
├── public/
│   ├── icons/          # Extension icons
│   ├── manifest.json   # Chrome extension manifest
│   ├── popup.html      # Popup page HTML
│   └── settings.html   # Settings page HTML
├── src/
│   ├── background/     # Background service worker
│   ├── content/        # Content script (injected into pages)
│   ├── popup/          # Popup UI
│   ├── settings/       # Settings page UI
│   └── types/          # TypeScript type definitions
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Next Steps

After installation:
1. Configure your API settings
2. Visit a supported AI chat platform
3. Start a conversation
4. Generate your first article!

## Support

For issues or questions, please check:
- The README.md file for detailed information
- Browser console for error messages
- Extension popup for platform support information
