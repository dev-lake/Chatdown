import { useEffect, useState } from 'react';
import type { ApiConfig, BuiltInAuthState, ChromeMessage, ChromeResponse, LocalePreference } from '../types';
import { LOCALE_OPTIONS } from '../i18n/core';
import { useI18n } from '../i18n/react';

const DEFAULT_OBSIDIAN_FOLDER = 'Chatdown';
const DEFAULT_SERVER_BASE_URL = (import.meta.env.VITE_CHATDOWN_DEFAULT_SERVER_URL || 'https://localhost:5001').replace(/\/+$/, '');
const DEFAULT_BUILT_IN_MODEL = import.meta.env.VITE_CHATDOWN_DEFAULT_MODEL || 'gpt-4o-mini';

type StatusMessage = { type: 'success' | 'error'; text: string };

export default function App() {
  const { locale, preference, setPreference, t } = useI18n();
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [account, setAccount] = useState<BuiltInAuthState | null>(null);
  const [notionToken, setNotionToken] = useState('');
  const [notionDatabaseId, setNotionDatabaseId] = useState('');
  const [obsidianVault, setObsidianVault] = useState('');
  const [obsidianFolder, setObsidianFolder] = useState(DEFAULT_OBSIDIAN_FOLDER);
  const [testing, setTesting] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [notionMessage, setNotionMessage] = useState<StatusMessage | null>(null);
  const [saveMessage, setSaveMessage] = useState<StatusMessage | null>(null);
  const [showNotionToken, setShowNotionToken] = useState(false);
  const [showCustomApi, setShowCustomApi] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

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
    setShowCustomApi(Boolean(result.apiBaseUrl || result.apiKey || result.modelName));
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

    chrome.runtime.sendMessage({ action: 'getBuiltInAccount' } satisfies ChromeMessage, (response: ChromeResponse) => {
      if (response.account) {
        setAccount(response.account);
        setLoaded(true);
        return;
      }

      window.location.replace(chrome.runtime.getURL('src/login/index.html'));
    });
  };

  const handleTestConnection = async () => {
    if (!account) {
      setMessage({ type: 'error', text: t('backgroundBuiltInAuthRequired') });
      return;
    }

    const customApiBaseUrl = apiBaseUrl.trim();
    const customApiKey = apiKey.trim();
    const customModelName = modelName.trim();
    const hasPartialCustomConfig = Boolean(customApiBaseUrl || customApiKey || customModelName);
    const hasCompleteCustomConfig = Boolean(customApiBaseUrl && customApiKey && customModelName);

    if (hasPartialCustomConfig && !hasCompleteCustomConfig) {
      setMessage({ type: 'error', text: t('settingsValidationRequired') });
      return;
    }

    setTesting(true);
    setMessage(null);

    const config: ApiConfig = hasCompleteCustomConfig
      ? {
        apiMode: 'custom',
        apiBaseUrl: customApiBaseUrl,
        apiKey: customApiKey,
        modelName: customModelName,
      }
      : {
        apiMode: 'builtIn',
        apiBaseUrl: DEFAULT_SERVER_BASE_URL,
        apiKey: account.token,
        modelName: DEFAULT_BUILT_IN_MODEL,
      };
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

  const handleLogout = async () => {
    chrome.runtime.sendMessage({ action: 'logoutBuiltInAccount' } satisfies ChromeMessage, () => {
      setAccount(null);
      window.location.replace(chrome.runtime.getURL('src/login/index.html'));
    });
  };

  const handleOpenLoginPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/login/index.html') });
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
    const customApiBaseUrl = apiBaseUrl.trim();
    const customApiKey = apiKey.trim();
    const customModelName = modelName.trim();
    const hasPartialCustomConfig = Boolean(customApiBaseUrl || customApiKey || customModelName);
    const hasCompleteCustomConfig = Boolean(customApiBaseUrl && customApiKey && customModelName);

    if (hasPartialCustomConfig && !hasCompleteCustomConfig) {
      setSaveMessage({ type: 'error', text: t('settingsValidationRequired') });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      await chrome.storage.local.set({
        apiBaseUrl: customApiBaseUrl,
        apiKey: customApiKey,
        modelName: customModelName,
        notionIntegrationToken: notionToken.trim(),
        notionDatabaseId: notionDatabaseId.trim(),
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

  const handleClearCustomApi = async () => {
    setApiBaseUrl('');
    setApiKey('');
    setModelName('');
    setShowCustomApi(false);
    setMessage(null);
    await chrome.storage.local.remove(['apiBaseUrl', 'apiKey', 'modelName']);
  };

  const selectedLocaleLabel = LOCALE_OPTIONS.find((option) => option.value === preference)?.labelKey ?? 'localeAuto';

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-50 py-8" lang={locale}>
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8">
          <div className="h-6 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="mt-4 h-4 w-full rounded bg-gray-100 animate-pulse" />
          <div className="mt-2 h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" lang={locale}>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{t('settingsHeading')}</h1>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:items-center lg:w-auto lg:justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowLanguageMenu((current) => !current);
                  setShowAccountMenu(false);
                }}
                className="w-full rounded px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 sm:w-auto"
              >
                {t(selectedLocaleLabel)} <span className="text-gray-400">⌄</span>
              </button>

              {showLanguageMenu ? (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {LOCALE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        void setPreference(option.value as LocalePreference);
                        setShowLanguageMenu(false);
                      }}
                      className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                        preference === option.value ? 'font-medium text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {account ? (
              <div className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu((current) => !current);
                    setShowLanguageMenu(false);
                  }}
                  className="flex max-w-full items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 sm:max-w-80"
                >
                  <span className="truncate">{account.user.email}</span>
                  <span className="shrink-0 text-gray-400">⌄</span>
                </button>

                {showAccountMenu ? (
                  <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {account.user.email}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('settingsAuthQuota', {
                        remaining: account.quota.remaining,
                        limit: account.quota.limit,
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-3 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {t('settingsAuthSignOut')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpenLoginPage}
                className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                {t('popupOpenLogin')}
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t('settingsSaving') : t('settingsSaveAll')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start">
        <aside className="lg:sticky lg:top-24 lg:w-56 lg:shrink-0">
          <nav className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
            {[
              { href: '#llm-api', label: t('settingsApiHeading') },
              { href: '#notion', label: t('settingsNotionHeading') },
              { href: '#obsidian', label: t('settingsObsidianHeading') },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block rounded px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
        {saveMessage ? (
          <div
            className={`rounded p-3 text-sm ${
              saveMessage.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {saveMessage.text}
          </div>
        ) : null}

        <section id="llm-api" className="scroll-mt-28 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">{t('settingsApiHeading')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('settingsApiDescription')}</p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowCustomApi((current) => !current)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              {showCustomApi ? t('settingsHideCustomApi') : t('settingsShowCustomApi')}
            </button>
            {apiBaseUrl || apiKey || modelName ? (
              <button
                type="button"
                onClick={() => void handleClearCustomApi()}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                {t('settingsClearCustomApi')}
              </button>
            ) : null}
          </div>

          {showCustomApi ? (
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
          ) : null}

          {message ? (
            <div
              className={`mt-4 rounded p-3 text-sm ${
                message.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {showCustomApi ? (
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="rounded bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {testing ? t('settingsTesting') : t('settingsTestConnection')}
              </button>
            </div>
          ) : null}
        </section>

        <section id="notion" className="scroll-mt-28 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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
        </section>

        <section id="obsidian" className="scroll-mt-28 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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
        </section>

        </div>
      </main>
    </div>
  );
}
