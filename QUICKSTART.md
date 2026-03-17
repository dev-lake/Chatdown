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

## Usage

1. Navigate to a supported AI chat platform:
   - ChatGPT: https://chat.openai.com or https://chatgpt.com
   - Google Gemini: https://gemini.google.com
   - DeepSeek: https://chat.deepseek.com

2. Have a conversation with the AI

3. Click the "Generate Article" button (appears in bottom-right corner)

4. Wait for the article to be generated

5. In the modal that appears:
   - Switch between "Preview" and "Markdown" tabs
   - Click "Copy to Clipboard" to copy the markdown
   - Click "Download" to save as a `.md` file
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

### "Generate Article" button doesn't appear
- Verify you're on a supported platform
- Check the browser console for errors
- Try refreshing the page

### API errors
- Verify your API configuration in settings
- Test the connection using the "Test Connection" button
- Check that your API key is valid and has sufficient credits
- Ensure the API Base URL is correct (no trailing slash)

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
