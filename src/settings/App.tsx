import { useState, useEffect } from 'react';
import type { ApiConfig, ChromeMessage, ChromeResponse } from '../types';

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [notionDatabaseId, setNotionDatabaseId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [notionMessage, setNotionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showNotionToken, setShowNotionToken] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const result = await chrome.storage.local.get([
      'apiBaseUrl',
      'apiKey',
      'modelName',
      'notionIntegrationToken',
      'notionDatabaseId'
    ]);
    if (result.apiBaseUrl) setApiBaseUrl(result.apiBaseUrl);
    if (result.apiKey) setApiKey(result.apiKey);
    if (result.modelName) setModelName(result.modelName);
    if (result.notionIntegrationToken) setNotionToken(result.notionIntegrationToken);
    if (result.notionDatabaseId) setNotionDatabaseId(result.notionDatabaseId);
  };

  const handleTestConnection = async () => {
    if (!apiBaseUrl || !apiKey || !modelName) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    setTesting(true);
    setMessage(null);

    const config: ApiConfig = { apiBaseUrl, apiKey, modelName };
    const message: ChromeMessage = {
      action: 'testConnection',
      config,
    };

    chrome.runtime.sendMessage(message, (response: ChromeResponse) => {
      setTesting(false);
      if (response.success) {
        setMessage({ type: 'success', text: 'Connection successful!' });
      } else {
        setMessage({ type: 'error', text: response.error || 'Connection failed' });
      }
    });
  };

  const handleTestNotionConnection = async () => {
    if (!notionToken || !notionDatabaseId) {
      setNotionMessage({ type: 'error', text: 'Please fill in Notion configuration' });
      return;
    }

    setTestingNotion(true);
    setNotionMessage(null);

    const message: ChromeMessage = {
      action: 'testNotionConnection',
      notionConfig: {
        integrationToken: notionToken,
        databaseId: notionDatabaseId,
      },
    };

    chrome.runtime.sendMessage(message, (response: ChromeResponse) => {
      setTestingNotion(false);
      if (response.success) {
        setNotionMessage({ type: 'success', text: '✅ Notion connection successful! All required properties are configured.' });
      } else if (response.missingProperties && response.missingProperties.length > 0) {
        const propertyTypes: Record<string, string> = {
          source: 'URL',
          platform: 'Multi-select',
          tag: 'Multi-select',
          timestamp: 'Date'
        };
        const details = response.missingProperties
          .map(prop => `• ${prop} (${propertyTypes[prop] || 'Unknown'})`)
          .join('\n');
        setNotionMessage({
          type: 'error',
          text: `❌ Missing required properties in your Notion database:\n\n${details}\n\nPlease add these properties to your database and try again. See the "Required Database Properties" section above for details.`
        });
      } else {
        setNotionMessage({ type: 'error', text: response.error || 'Notion connection failed' });
      }
    });
  };

  const handleSave = async () => {
    if (!apiBaseUrl || !apiKey || !modelName) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    setSaving(true);
    setMessage(null);

    await chrome.storage.local.set({
      apiBaseUrl,
      apiKey,
      modelName,
      notionIntegrationToken: notionToken,
      notionDatabaseId: notionDatabaseId,
    });

    setSaving(false);
    setMessage({ type: 'success', text: 'Settings saved successfully!' });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8">
        <h1 className="text-3xl font-bold mb-2">Chatdown Settings</h1>
        <p className="text-gray-600 mb-6">
          Configure your LLM API settings to generate articles from conversations
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">API Base URL</label>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              OpenAI-compatible API endpoint (e.g., OpenAI, Azure OpenAI, Ollama)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your API key (stored locally, never transmitted except to your configured endpoint)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Model Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Model identifier (e.g., gpt-4o-mini, gpt-4, claude-3-sonnet)
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        <div className="mt-8 pt-8 border-t">
          <h2 className="text-2xl font-bold mb-2">Notion Integration (Optional)</h2>
          <p className="text-gray-600 mb-4">
            Export articles directly to your Notion workspace
          </p>

          {/* Setup Instructions */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📖 Setup Guide</h3>
            <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
              <li>
                <span className="font-medium">Create Integration:</span> Visit{' '}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                >
                  notion.so/my-integrations
                </a>
                {' '}and create a new integration
              </li>
              <li>
                <span className="font-medium">Copy Token:</span> Copy the "Internal Integration Token" (starts with secret_)
              </li>
              <li>
                <span className="font-medium">Create Database:</span> In Notion, create a new database (Table/Board/List)
              </li>
              <li>
                <span className="font-medium">Share Database:</span> Click "Share" on the database and invite your integration
              </li>
              <li>
                <span className="font-medium">Get Database ID:</span> Copy the 32-character ID from the database URL
                <div className="mt-1 text-xs bg-white px-2 py-1 rounded border border-blue-300 font-mono">
                  https://notion.so/workspace/<span className="bg-yellow-200">DATABASE_ID</span>?v=...
                </div>
              </li>
            </ol>
          </div>

          {/* Required Database Properties */}
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="text-sm font-semibold text-amber-900 mb-2">⚙️ Required Database Properties</h3>
            <p className="text-sm text-amber-800 mb-3">
              Your Notion database must have these properties for articles to export correctly:
            </p>
            <div className="space-y-2 text-sm text-amber-900">
              <div className="bg-white px-3 py-2 rounded border border-green-200">
                <span className="font-mono font-semibold">Name</span>
                <span className="mx-2">→</span>
                <span className="text-green-700">Type: Title (Default)</span>
                <div className="text-xs text-green-600 mt-1">✓ Already exists in every database - stores the article title</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-amber-200">
                <span className="font-mono font-semibold">source</span>
                <span className="mx-2">→</span>
                <span className="text-amber-700">Type: URL</span>
                <div className="text-xs text-amber-600 mt-1">Stores the original conversation URL</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-amber-200">
                <span className="font-mono font-semibold">platform</span>
                <span className="mx-2">→</span>
                <span className="text-amber-700">Type: Multi-select</span>
                <div className="text-xs text-amber-600 mt-1">Records the source platform (ChatGPT, DeepSeek, Gemini)</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-amber-200">
                <span className="font-mono font-semibold">timestamp</span>
                <span className="mx-2">→</span>
                <span className="text-amber-700">Type: Date</span>
                <div className="text-xs text-amber-600 mt-1">Records when the article was created</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-blue-200">
                <span className="font-mono font-semibold">tag</span>
                <span className="mx-2">→</span>
                <span className="text-blue-700">Type: Multi-select (Optional)</span>
                <div className="text-xs text-blue-600 mt-1">For article categorization - initially empty, can be filled manually</div>
              </div>
            </div>
            <p className="text-xs text-amber-700 mt-3 italic">
              💡 Tip: Add these properties to your database by clicking the "+" button in the database header
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Integration Token</label>
              <div className="relative">
                <input
                  type={showNotionToken ? "text" : "password"}
                  value={notionToken}
                  onChange={(e) => setNotionToken(e.target.value)}
                  placeholder="secret_..."
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNotionToken(!showNotionToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  title={showNotionToken ? "Hide token" : "Show token"}
                >
                  {showNotionToken ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Your Notion integration token (stored locally, never shared)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Database ID</label>
              <input
                type="text"
                value={notionDatabaseId}
                onChange={(e) => setNotionDatabaseId(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                32-character database ID from your Notion database URL
              </p>
            </div>

            {notionMessage && (
              <div
                className={`p-3 rounded whitespace-pre-line ${
                  notionMessage.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {notionMessage.text}
              </div>
            )}

            <button
              onClick={handleTestNotionConnection}
              disabled={testingNotion}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {testingNotion ? 'Testing...' : 'Test Notion Connection'}
            </button>
          </div>
        </div>

        {/* Save Button at Bottom */}
        <div className="mt-8 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>Saving Settings...</span>
              </span>
            ) : (
              'Save All Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
