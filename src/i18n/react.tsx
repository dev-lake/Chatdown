import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale, LocalePreference } from '../types';
import {
  UI_LOCALE_PREFERENCE_KEY,
  createTranslator,
  getBrowserLanguage,
  loadLocalePreference,
  normalizeLocalePreference,
  resolveLocale,
  saveLocalePreference,
  type MessageKey,
  type MessageParams,
  type TranslateFn,
} from './core';

interface I18nContextValue {
  locale: Locale;
  preference: LocalePreference;
  setPreference: (next: LocalePreference) => Promise<void>;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LocalePreference>('auto');
  const [browserLanguage, setBrowserLanguage] = useState(() => getBrowserLanguage());

  useEffect(() => {
    let mounted = true;

    const refreshBrowserLanguage = () => {
      setBrowserLanguage(getBrowserLanguage());
    };

    const loadPreference = async () => {
      const storedPreference = await loadLocalePreference();
      if (mounted) {
        setPreferenceState(storedPreference);
        refreshBrowserLanguage();
      }
    };

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local' || !changes[UI_LOCALE_PREFERENCE_KEY]) {
        return;
      }

      setPreferenceState(normalizeLocalePreference(changes[UI_LOCALE_PREFERENCE_KEY].newValue));
      refreshBrowserLanguage();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshBrowserLanguage();
      }
    };

    void loadPreference();
    chrome.storage.onChanged.addListener(handleStorageChange);
    window.addEventListener('focus', refreshBrowserLanguage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
      window.removeEventListener('focus', refreshBrowserLanguage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const locale = useMemo(
    () => resolveLocale(preference, browserLanguage),
    [preference, browserLanguage]
  );
  const t = useMemo(() => createTranslator(locale), [locale]);

  const setPreference = async (next: LocalePreference) => {
    const normalized = normalizeLocalePreference(next);
    setPreferenceState(normalized);
    await saveLocalePreference(normalized);
  };

  const value = useMemo(
    () => ({
      locale,
      preference,
      setPreference,
      t,
    }),
    [locale, preference, t]
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
}

export type { MessageKey, MessageParams };
