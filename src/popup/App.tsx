import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/react';
import type { BuiltInAuthState, ChromeMessage, ChromeResponse } from '../types';

export default function App() {
  const { locale, t } = useI18n();
  const [account, setAccount] = useState<BuiltInAuthState | null>(null);

  useEffect(() => {
    document.title = t('popupDocumentTitle');
    document.documentElement.lang = locale;
  }, [locale, t]);

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'getBuiltInAccount' } satisfies ChromeMessage, (response: ChromeResponse) => {
      setAccount(response.account ?? null);
    });
  }, []);

  const handleOpenSettings = () => {
    if (!account) {
      handleOpenLogin();
      return;
    }

    chrome.runtime.openOptionsPage();
  };

  const handleOpenLogin = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/login/index.html') });
  };

  return (
    <div className="w-80 p-4" lang={locale}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-2">{t('appName')}</h1>
        <p className="text-gray-600 text-sm">
          {t('appDescription')}
        </p>
      </div>

      <div className="mb-4">
        <h2 className="font-semibold mb-2">{t('popupSupportedPlatforms')}</h2>
        <ul className="text-sm space-y-1">
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>ChatGPT</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>Google Gemini</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>Google Search AI Mode</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>DeepSeek</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>Doubao</span>
          </li>
        </ul>
      </div>

      {account ? (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {t('popupSignedInAs', { email: account.user.email })}
        </div>
      ) : (
        <button
          onClick={handleOpenLogin}
          className="mb-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
        >
          {t('popupOpenLogin')}
        </button>
      )}

      <button
        onClick={handleOpenSettings}
        className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
      >
        {t('popupOpenSettings')}
      </button>
    </div>
  );
}
