import { useEffect, useState } from 'react';
import type { ApiConfig, ChromeMessage, ChromeResponse, LocalePreference } from '../types';
import { LOCALE_OPTIONS } from '../i18n/core';
import { useI18n } from '../i18n/react';

const DEFAULT_OBSIDIAN_FOLDER = 'Chatdown';

type StatusMessage = { type: 'success' | 'error'; text: string };

export default function App() {
  const { locale, preference, setPreference, t } = useI18n();
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [notionDatabaseId, setNotionDatabaseId] = useState('');
  const [obsidianVault, setObsidianVault] = useState('');
  const [obsidianFolder, setObsidianFolder] = useState(DEFAULT_OBSIDIAN_FOLDER);
  const [testing, setTesting] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [notionMessage, setNotionMessage] = useState<StatusMessage | null>(null);
  const [saveMessage, setSaveMessage] = useState<StatusMessage | null>(null);
  const [showNotionToken, setShowNotionToken] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    document.title = t('settingsDocumentTitle');
    document.documentElement.lang = locale;
  }, [locale, t]);

  useEffect(() => {
    setMessage(null);
    setNotionMessage(null);
    setSaveMessage(null);
  }, [locale]);

  const loadSettings = async () => {
    const result = await chrome.storage.local.get([
      'apiBaseUrl',
      'apiKey',
      'modelName',
      'notionIntegrationToken',
      'notionDatabaseId',
      'obsidianVault',
      'obsidianFolder',
    ]);

    if (result.apiBaseUrl) {
      setApiBaseUrl(result.apiBaseUrl);
    }
    if (result.apiKey) {
      setApiKey(result.apiKey);
    }
    if (result.modelName) {
      setModelName(result.modelName);
    }
    if (result.notionIntegrationToken) {
      setNotionToken(result.notionIntegrationToken);
    }
    if (result.notionDatabaseId) {
      setNotionDatabaseId(result.notionDatabaseId);
    }
    if (typeof result.obsidianVault === 'string') {
      setObsidianVault(result.obsidianVault);
    }
    if (typeof result.obsidianFolder === 'string' && result.obsidianFolder.trim()) {
      setObsidianFolder(result.obsidianFolder);
    }
  };

  const handleTestConnection = async () => {
    if (!apiBaseUrl || !apiKey || !modelName) {
      setMessage({ type: 'error', text: t('settingsValidationRequired') });
      return;
    }

    setTesting(true);
    setMessage(null);

    const config: ApiConfig = { apiBaseUrl, apiKey, modelName };
    const request: ChromeMessage = {
      action: 'testConnection',
      config,
    };

    chrome.runtime.sendMessage(request, (response: ChromeResponse) => {
      setTesting(false);

      if (response.success) {
        setMessage({ type: 'success', text: t('settingsConnectionSuccess') });
      } else {
        setMessage({ type: 'error', text: response.error || t('settingsConnectionFailed') });
      }
    });
  };

  const handleTestNotionConnection = async () => {
    if (!notionToken || !notionDatabaseId) {
      setNotionMessage({ type: 'error', text: t('settingsNotionValidationRequired') });
      return;
    }

    setTestingNotion(true);
    setNotionMessage(null);

    const request: ChromeMessage = {
      action: 'testNotionConnection',
      notionConfig: {
        integrationToken: notionToken,
        databaseId: notionDatabaseId,
      },
    };

    chrome.runtime.sendMessage(request, (response: ChromeResponse) => {
      setTestingNotion(false);

      if (response.success) {
        setNotionMessage({ type: 'success', text: t('settingsNotionConnectionSuccess') });
        return;
      }

      if (response.missingProperties && response.missingProperties.length > 0) {
        const propertyTypes: Record<string, string> = {
          source: t('settingsPropertyTypeUrl'),
          platform: t('settingsPropertyTypeMultiSelect'),
          tag: t('settingsPropertyTypeMultiSelect'),
          timestamp: t('settingsPropertyTypeDate'),
        };
        const details = response.missingProperties
          .map((property) => t('settingsMissingPropertyLine', {
            property,
            type: propertyTypes[property] || t('settingsPropertyTypeUnknown'),
          }))
          .join('\n');

        setNotionMessage({
          type: 'error',
          text: `${t('settingsNotionMissingPropsIntro')}\n\n${details}\n\n${t('settingsNotionMissingPropsOutro')}`,
        });
        return;
      }

      setNotionMessage({ type: 'error', text: response.error || t('settingsNotionConnectionFailed') });
    });
  };

  const handleSave = async () => {
    if (!apiBaseUrl || !apiKey || !modelName) {
      setSaveMessage({ type: 'error', text: t('settingsValidationRequired') });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      await chrome.storage.local.set({
        apiBaseUrl,
        apiKey,
        modelName,
        notionIntegrationToken: notionToken,
        notionDatabaseId,
        obsidianVault: obsidianVault.trim(),
        obsidianFolder: obsidianFolder.trim() || DEFAULT_OBSIDIAN_FOLDER,
      });

      setSaveMessage({ type: 'success', text: t('settingsSaved') });
    } catch (error) {
      setSaveMessage({
        type: 'error',
        text: t('settingsSaveFailed', {
          error: error instanceof Error ? error.message : t('commonUnknownError'),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8" lang={locale}>
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8">
        <h1 className="text-3xl font-bold mb-2">{t('settingsHeading')}</h1>
        <p className="text-gray-600 mb-6">
          {t('settingsDescription')}
        </p>

        <section className="mb-8 rounded-xl border border-gray-200 bg-gray-50/70 p-5">
          <h2 className="text-xl font-semibold text-gray-900">{t('settingsGeneralHeading')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('settingsGeneralDescription')}</p>

          <div className="mt-5">
            <label className="block text-sm font-medium mb-1">{t('settingsLanguageLabel')}</label>
            <select
              value={preference}
              onChange={(event) => void setPreference(event.target.value as LocalePreference)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t('settingsLanguageHelp')}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 p-5">
          <h2 className="text-xl font-semibold text-gray-900">{t('settingsApiHeading')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('settingsApiDescription')}</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsApiBaseUrlLabel')}</label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://api.openai.com"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsApiBaseUrlHelp')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsApiKeyLabel')}</label>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsApiKeyHelp')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsModelNameLabel')}</label>
              <input
                type="text"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsModelNameHelp')}
              </p>
            </div>
          </div>
        </section>

        {message ? (
          <div
            className={`mt-4 p-3 rounded ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {testing ? t('settingsTesting') : t('settingsTestConnection')}
          </button>
        </div>

        <div className="mt-8 pt-8 border-t">
          <h2 className="text-2xl font-bold mb-2">{t('settingsNotionHeading')}</h2>
          <p className="text-gray-600 mb-4">
            {t('settingsNotionDescription')}
          </p>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">{t('settingsNotionGuideTitle')}</h3>
            <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
              <li>
                <span className="font-medium">{t('settingsNotionGuideCreateIntegration')}</span>{' '}
                {t('settingsNotionGuideCreateIntegrationBody')}{' '}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                >
                  notion.so/my-integrations
                </a>{' '}
                {t('settingsNotionGuideCreateIntegrationTail')}
              </li>
              <li>
                <span className="font-medium">{t('settingsNotionGuideCopyToken')}</span>{' '}
                {t('settingsNotionGuideCopyTokenBody')}
              </li>
              <li>
                <span className="font-medium">{t('settingsNotionGuideCreateDatabase')}</span>{' '}
                {t('settingsNotionGuideCreateDatabaseBody')}
              </li>
              <li>
                <span className="font-medium">{t('settingsNotionGuideShareDatabase')}</span>{' '}
                {t('settingsNotionGuideShareDatabaseBody')}
              </li>
              <li>
                <span className="font-medium">{t('settingsNotionGuideGetDatabaseId')}</span>{' '}
                {t('settingsNotionGuideGetDatabaseIdBody')}
                <div className="mt-1 text-xs bg-white px-2 py-1 rounded border border-blue-300 font-mono">
                  https://notion.so/workspace/<span className="bg-yellow-200">DATABASE_ID</span>?v=...
                </div>
              </li>
            </ol>
          </div>

          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="text-sm font-semibold text-amber-900 mb-2">{t('settingsNotionRequiredPropsTitle')}</h3>
            <p className="text-sm text-amber-800 mb-3">
              {t('settingsNotionRequiredPropsDescription')}
            </p>
            <div className="space-y-2 text-sm text-amber-900">
              <div className="bg-white px-3 py-2 rounded border border-green-200">
                <span className="font-mono font-semibold">Name</span>
                <span className="mx-2">→</span>
                <span className="text-green-700">{t('settingsTypeTitleDefault')}</span>
                <div className="text-xs text-green-600 mt-1">{t('settingsNotionPropNameHelp')}</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-amber-200">
                <span className="font-mono font-semibold">source</span>
                <span className="mx-2">→</span>
                <span className="text-amber-700">{t('settingsTypeUrl')}</span>
                <div className="text-xs text-amber-600 mt-1">{t('settingsNotionPropSourceHelp')}</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-amber-200">
                <span className="font-mono font-semibold">platform</span>
                <span className="mx-2">→</span>
                <span className="text-amber-700">{t('settingsTypeMultiSelect')}</span>
                <div className="text-xs text-amber-600 mt-1">{t('settingsNotionPropPlatformHelp')}</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-amber-200">
                <span className="font-mono font-semibold">timestamp</span>
                <span className="mx-2">→</span>
                <span className="text-amber-700">{t('settingsTypeDate')}</span>
                <div className="text-xs text-amber-600 mt-1">{t('settingsNotionPropTimestampHelp')}</div>
              </div>
              <div className="bg-white px-3 py-2 rounded border border-blue-200">
                <span className="font-mono font-semibold">tag</span>
                <span className="mx-2">→</span>
                <span className="text-blue-700">{t('settingsTypeMultiSelectOptional')}</span>
                <div className="text-xs text-blue-600 mt-1">{t('settingsNotionPropTagHelp')}</div>
              </div>
            </div>
            <p className="text-xs text-amber-700 mt-3 italic">
              {t('settingsNotionTip')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsIntegrationTokenLabel')}</label>
              <div className="relative">
                <input
                  type={showNotionToken ? 'text' : 'password'}
                  value={notionToken}
                  onChange={(event) => setNotionToken(event.target.value)}
                  placeholder="secret_..."
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNotionToken((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  title={showNotionToken ? t('settingsHideToken') : t('settingsShowToken')}
                  aria-label={showNotionToken ? t('settingsHideToken') : t('settingsShowToken')}
                >
                  {showNotionToken ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsIntegrationTokenHelp')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsDatabaseIdLabel')}</label>
              <input
                type="text"
                value={notionDatabaseId}
                onChange={(event) => setNotionDatabaseId(event.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsDatabaseIdHelp')}
              </p>
            </div>

            {notionMessage ? (
              <div
                className={`p-3 rounded whitespace-pre-line ${
                  notionMessage.type === 'success'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {notionMessage.text}
              </div>
            ) : null}

            <button
              onClick={handleTestNotionConnection}
              disabled={testingNotion}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {testingNotion ? t('settingsTesting') : t('settingsTestNotionConnection')}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t">
          <h2 className="text-2xl font-bold mb-2">{t('settingsObsidianHeading')}</h2>
          <p className="text-gray-600 mb-4">
            {t('settingsObsidianDescription')}
          </p>

          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('settingsObsidianGuideTitle')}</h3>
            <ol className="text-sm text-gray-800 space-y-2 list-decimal list-inside">
              <li>
                <span className="font-medium">{t('settingsObsidianGuideVault')}</span>{' '}
                {t('settingsObsidianGuideVaultBody')}
              </li>
              <li>
                <span className="font-medium">{t('settingsObsidianGuideFolder')}</span>{' '}
                {t('settingsObsidianGuideFolderBody')}
              </li>
            </ol>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsObsidianVaultLabel')}</label>
              <input
                type="text"
                value={obsidianVault}
                onChange={(event) => setObsidianVault(event.target.value)}
                placeholder="My Vault"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsObsidianVaultHelp')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('settingsObsidianFolderLabel')}</label>
              <input
                type="text"
                value={obsidianFolder}
                onChange={(event) => setObsidianFolder(event.target.value)}
                placeholder={DEFAULT_OBSIDIAN_FOLDER}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settingsObsidianFolderHelp')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>{t('settingsSaving')}</span>
              </span>
            ) : (
              t('settingsSaveAll')
            )}
          </button>

          {saveMessage ? (
            <div
              className={`mt-4 p-3 rounded ${
                saveMessage.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {saveMessage.text}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
