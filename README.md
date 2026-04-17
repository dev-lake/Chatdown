# Chatdown

> Convert AI chat conversations into structured Markdown articles with a single click.

Chatdown is a Chrome extension that transforms your AI chat conversations into well-structured, editable Markdown articles. It supports multiple AI platforms and uses your own LLM API for content generation.

## ✨ Features

- 🤖 **Multi-Platform Support** - Works with ChatGPT, Google Gemini, Google Search AI Mode, DeepSeek, and Doubao
- 🔄 **Streaming Generation** - Real-time article generation with live preview
- ✏️ **Typora-Style Editor** - Edit generated articles with a clean, distraction-free interface
- 💾 **Smart Caching** - Automatically caches articles based on conversation content
- 🎨 **Dual View** - Switch between rendered preview and raw Markdown
- 📋 **Easy Export** - Copy to clipboard or download as .md file
- 📤 **Notion Integration** - Export articles directly to your Notion workspace
- 🪨 **Obsidian Export** - Open the Obsidian desktop app and create a Markdown note
- 🔗 **Source Tracking** - Automatically includes original conversation URL
- 🔌 **Your Own API** - Use any OpenAI-compatible API endpoint

## 📸 Screenshots

<!-- Add screenshots here -->

## 🚀 Quick Start

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/dev-lake/Chatdown.git
cd Chatdown
```

2. **Install dependencies**
```bash
npm install
```

3. **Build the extension**
```bash
npm run build
```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` directory

### Configuration

1. Click the Chatdown extension icon in your toolbar
2. Click "Open Settings"
3. Configure your API:
   - **API Base URL**: Your OpenAI-compatible endpoint (e.g., `https://api.openai.com`)
   - **API Key**: Your API key
   - **Model Name**: Model to use (e.g., `gpt-4o-mini`, `gpt-4o`)
4. Click "Test Connection" to verify
5. Click "Save Settings"

### Optional: Notion Integration

To enable exporting articles to Notion:

1. In Settings, scroll to "Notion Integration (Optional)"
2. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
3. Copy the Integration Token and Database ID
4. Paste them in the settings
5. Click "Test Notion Connection" to verify

For detailed setup instructions, see [NOTION_SETUP.md](./NOTION_SETUP.md).

### Optional: Obsidian Export

To export articles directly into Obsidian:

1. In Settings, scroll to "Obsidian Integration (Optional)"
2. Enter your **Vault Name** exactly as it appears in Obsidian
3. Optionally adjust **Folder Path**; it defaults to `Chatdown`
4. Click "Save All Settings"

When exporting, Chatdown copies the article content to the clipboard and opens the local `obsidian://new` protocol. If clipboard access fails, Chatdown falls back to passing the article content through the Obsidian URI.

## 📖 Usage

1. **Start a conversation** on any supported AI platform
2. **Click the "Chatdown" button** that appears in the chat interface
3. **Watch the magic happen** - The side panel opens and streams the generated article
4. **Edit if needed** - Click the ✏️ button to edit the article
5. **Export** - Click the 📤 button to choose export options:
   - Copy to Clipboard
   - Download as Markdown
   - Export to Notion
   - Export to Obsidian

### Advanced Features

- **Force Regenerate**: Hold `Shift` while clicking the Chatdown button to bypass cache and regenerate
- **Edit Mode**: Click ✏️ to enter edit mode, make changes, then Save or Cancel
- **Smart Caching**: Same conversation content won't regenerate unless you force it

## 🎯 Supported Platforms

| Platform | URL | Status |
|----------|-----|--------|
| ChatGPT | chat.openai.com, chatgpt.com | ✅ |
| Google Gemini | gemini.google.com | ✅ |
| Google Search AI Mode | google.com/ai, google.com/search?udm=50 | ✅ |
| DeepSeek | chat.deepseek.com | ✅ |
| Doubao | www.doubao.com | ✅ |

## 🛠️ Development

### Run with hot reload
```bash
npm run dev
```

Then load the `dist/` directory as an unpacked extension. Changes will be reflected automatically.

### Build for production
```bash
npm run build
```

### Project Structure

```
src/
├── background/       # Service worker and API client
├── content/          # Content scripts injected into chat pages
├── sidepanel/        # Side panel UI for article display
├── popup/            # Extension popup
├── settings/         # Settings page
└── types/            # TypeScript type definitions
```

## 🏗️ Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with @crxjs/vite-plugin
- **Styling**: Tailwind CSS with @tailwindcss/typography
- **Markdown**: marked (for rendering)
- **Extension**: Chrome Extension Manifest v3

## 🔧 Architecture

Chatdown follows Chrome Extension Manifest v3 architecture:

- **Background Service Worker**: Handles API calls and message routing
- **Content Scripts**: Inject UI into chat platforms and parse conversations
- **Side Panel**: Displays and allows editing of generated articles
- **Chrome Storage**: Persists settings and cached articles

For more details, see [CLAUDE.md](./CLAUDE.md).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/) and [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)
- Markdown rendering by [marked](https://marked.js.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)

## 📮 Support

If you encounter any issues or have suggestions, please [open an issue](https://github.com/dev-lake/Chatdown/issues).
