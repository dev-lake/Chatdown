import { useState, useEffect } from 'react';
import type { ApiConfig, ChromeMessage, ChromeResponse } from '../types';

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const result = await chrome.storage.local.get(['apiBaseUrl', 'apiKey', 'modelName']);
    if (result.apiBaseUrl) setApiBaseUrl(result.apiBaseUrl);
    if (result.apiKey) setApiKey(result.apiKey);
    if (result.modelName) setModelName(result.modelName);
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
