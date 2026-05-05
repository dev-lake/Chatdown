import { useEffect, useState } from 'react';
import type { BuiltInAuthState, ChromeMessage, ChromeResponse } from '../types';
import { useI18n } from '../i18n/react';

type StatusMessage = { type: 'success' | 'error'; text: string };
type LoginStep = 'email' | 'code';
const LOGIN_CODE_COOLDOWN_UNTIL_KEY = 'loginCodeCooldownUntil';
const LOGIN_EMAIL_KEY = 'loginEmail';
const LOGIN_CODE_COOLDOWN_SECONDS = 45;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getRemainingCooldown(until: unknown): number {
  if (typeof until !== 'number') {
    return 0;
  }

  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export default function App() {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<LoginStep>('email');
  const [account, setAccount] = useState<BuiltInAuthState | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  useEffect(() => {
    document.title = t('loginDocumentTitle');
    document.documentElement.lang = locale;
  }, [locale, t]);

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'getBuiltInAccount' } satisfies ChromeMessage, (response: ChromeResponse) => {
      if (response.account) {
        setAccount(response.account);
        setEmail(response.account.user.email);
      }
    });

    void chrome.storage.local.get([LOGIN_CODE_COOLDOWN_UNTIL_KEY, LOGIN_EMAIL_KEY]).then((result) => {
      const remaining = getRemainingCooldown(result[LOGIN_CODE_COOLDOWN_UNTIL_KEY]);
      if (remaining > 0) {
        setResendSeconds(remaining);
      }
      if (typeof result[LOGIN_EMAIL_KEY] === 'string' && result[LOGIN_EMAIL_KEY]) {
        setEmail(result[LOGIN_EMAIL_KEY]);
      }
    });
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const handleRequestCode = () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (resendSeconds > 0) {
      return;
    }

    if (!normalizedEmail) {
      setMessage({ type: 'error', text: t('settingsAuthEmailRequired') });
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage({ type: 'error', text: t('settingsAuthInvalidEmail') });
      return;
    }

    setSendingCode(true);
    setMessage(null);

    chrome.runtime.sendMessage({
      action: 'requestLoginCode',
      email: normalizedEmail,
    } satisfies ChromeMessage, (response: ChromeResponse) => {
      setSendingCode(false);

      if (response.success) {
        setStep('code');
        setCode('');
        setEmail(normalizedEmail);
        setResendSeconds(LOGIN_CODE_COOLDOWN_SECONDS);
        void chrome.storage.local.set({
          [LOGIN_CODE_COOLDOWN_UNTIL_KEY]: Date.now() + LOGIN_CODE_COOLDOWN_SECONDS * 1000,
          [LOGIN_EMAIL_KEY]: normalizedEmail,
        });
        setMessage({ type: 'success', text: t('settingsAuthCodeSent') });
        return;
      }

      setMessage({ type: 'error', text: response.error || t('settingsAuthRequestCodeFailed') });
    });
  };

  const handleVerifyCode = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    if (!normalizedEmail || !normalizedCode) {
      setMessage({ type: 'error', text: t('settingsAuthCodeRequired') });
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage({ type: 'error', text: t('settingsAuthInvalidEmail') });
      return;
    }

    if (!/^\d{6}$/.test(normalizedCode)) {
      setMessage({ type: 'error', text: t('settingsAuthInvalidCode') });
      return;
    }

    setVerifyingCode(true);
    setMessage(null);

    chrome.runtime.sendMessage({
      action: 'verifyLoginCode',
      email: normalizedEmail,
      code: normalizedCode,
    } satisfies ChromeMessage, (response: ChromeResponse) => {
      setVerifyingCode(false);

      if (response.success && response.account) {
        setAccount(response.account);
        setCode('');
        setResendSeconds(0);
        void chrome.storage.local.remove([LOGIN_CODE_COOLDOWN_UNTIL_KEY, LOGIN_EMAIL_KEY]);
        setMessage({ type: 'success', text: t('settingsAuthSignedIn', { email: response.account.user.email }) });
        return;
      }

      setMessage({ type: 'error', text: response.error || t('settingsAuthVerifyCodeFailed') });
    });
  };

  const handleLogout = () => {
    chrome.runtime.sendMessage({ action: 'logoutBuiltInAccount' } satisfies ChromeMessage, () => {
      setAccount(null);
      setCode('');
      setStep('email');
      setResendSeconds(0);
      void chrome.storage.local.remove([LOGIN_CODE_COOLDOWN_UNTIL_KEY, LOGIN_EMAIL_KEY]);
      setMessage(null);
    });
  };

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleEditEmail = () => {
    setStep('email');
    setCode('');
    setMessage(null);
  };

  const handleCodeChange = (value: string) => {
    setCode(value.replace(/\D/g, '').slice(0, 6));
  };

  const submitDisabled = step === 'email'
    ? sendingCode || resendSeconds > 0 || !email.trim()
    : verifyingCode || code.length !== 6;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4" lang={locale}>
      <main className="mx-auto max-w-md rounded-lg bg-white p-8 shadow">
        <div className="mb-6">
          <div className="text-sm font-semibold text-blue-700">{t('appName')}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">{t('loginHeading')}</h1>
        </div>
        <p className="mt-2 text-sm text-gray-600">{t('loginDescription')}</p>

        {account ? (
          <section className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-900">
              {t('settingsAuthSignedIn', { email: account.user.email })}
            </p>
            <p className="mt-1 text-sm text-green-800">
              {t('settingsAuthQuota', {
                remaining: account.quota.remaining,
                limit: account.quota.limit,
              })}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 rounded border border-green-300 bg-white text-green-800 hover:bg-green-100 transition-colors"
              >
                {t('settingsAuthSignOut')}
              </button>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t('loginOpenSettings')}
              </button>
            </div>
          </section>
        ) : (
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 'email') {
                handleRequestCode();
                return;
              }
              handleVerifyCode();
            }}
          >
            <div className="flex gap-2 text-xs font-medium">
              <span className={`rounded-full px-3 py-1 ${step === 'email' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>
                {t('loginStepEmail')}
              </span>
              <span className={`rounded-full px-3 py-1 ${step === 'code' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {t('loginStepCode')}
              </span>
            </div>

            {step === 'email' ? (
              <div>
                <label className="block text-sm font-medium mb-1">{t('settingsAuthEmailLabel')}</label>
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('settingsAuthEmailPlaceholder')}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-2 text-xs text-gray-500">{t('loginEmailHelp')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">{t('settingsAuthEmailLabel')}</div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-gray-900">{email}</span>
                    <button
                      type="button"
                      onClick={handleEditEmail}
                      className="shrink-0 text-sm font-medium text-blue-700 hover:text-blue-800"
                    >
                      {t('loginChangeEmail')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('settingsAuthCodeLabel')}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    onChange={(event) => handleCodeChange(event.target.value)}
                    placeholder={t('settingsAuthCodePlaceholder')}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-center text-2xl font-semibold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-2 text-xs text-gray-500">{t('loginCodeHelp')}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full rounded bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {step === 'email'
                ? (resendSeconds > 0
                  ? t('loginResendCountdown', { seconds: resendSeconds })
                  : (sendingCode ? t('settingsAuthSendingCode') : t('settingsAuthRequestCode')))
                : (verifyingCode ? t('settingsAuthVerifyingCode') : t('settingsAuthVerifyCode'))}
            </button>

            {step === 'code' ? (
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={sendingCode || resendSeconds > 0}
                className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {resendSeconds > 0
                  ? t('loginResendCountdown', { seconds: resendSeconds })
                  : (sendingCode ? t('settingsAuthSendingCode') : t('loginResendCode'))}
              </button>
            ) : null}
          </form>
        )}

        {message ? (
          <div
            className={`mt-5 rounded p-3 ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        ) : null}
      </main>
    </div>
  );
}
