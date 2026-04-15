import { useEffect } from 'react';
import { useI18n } from '../i18n/react';

export default function App() {
  const { locale, t } = useI18n();

  useEffect(() => {
    document.title = t('popupDocumentTitle');
    document.documentElement.lang = locale;
  }, [locale, t]);

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
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
            <span>DeepSeek</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>Doubao</span>
          </li>
        </ul>
      </div>

      <button
        onClick={handleOpenSettings}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
      >
        {t('popupOpenSettings')}
      </button>
    </div>
  );
}
