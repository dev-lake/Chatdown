import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChromeMessage, ChromeResponse, GenerationMode, WorkflowPhase } from '../types';
import { useI18n } from '../i18n/react';
import { openChatdownOverlay, showChatdownError } from './events';
import { detectPlatform, getParser } from './parsers';

function isBusyPhase(phase: WorkflowPhase | undefined): boolean {
  return phase === 'summarizing_rounds' || phase === 'generating';
}

function stopHostClickPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export default function App() {
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonGroupRef = useRef<HTMLDivElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const primaryButtonLabel = loading ? t('contentButtonTitleReopen') : t('contentButtonTitleGenerateFull');

  useEffect(() => {
    const loadArticleState = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getArticleState' });
        setLoading(isBusyPhase(response?.state?.phase));
      } catch {
        // Ignore load failures in the button host.
      }
    };

    const handleMessage = (message: ChromeMessage) => {
      if (message.state) {
        setLoading(isBusyPhase(message.state.phase));
        return;
      }

      if (
        message.action === 'partialSelectionLoading'
        || message.action === 'generatingArticle'
        || message.action === 'articleChunk'
      ) {
        setLoading(true);
      } else if (message.action === 'partialSelectionReady' || message.action === 'displayArticle') {
        setLoading(false);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    void loadArticleState();

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!showMenu) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const toggleRect = toggleButtonRef.current?.getBoundingClientRect();
      if (!toggleRect) {
        return;
      }

      const menuWidth = 240;
      const viewportPadding = 8;
      const top = toggleRect.bottom + 6;
      const left = Math.min(
        Math.max(viewportPadding, toggleRect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding
      );

      setMenuPosition({
        top,
        left,
      });
    };

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonGroupRef.current?.contains(target) && !menuPanelRef.current?.contains(target)) {
        setShowMenu(false);
      }
    };

    const handleViewportChange = () => {
      setShowMenu(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [showMenu]);

  const handlePrimaryButtonClick = () => {
    openChatdownOverlay();

    if (loading) {
      return;
    }

    void startGeneration('full');
  };

  const startGeneration = async (mode: GenerationMode) => {
    openChatdownOverlay();
    setShowMenu(false);

    if (loading) {
      return;
    }

    try {
      const platform = detectPlatform();
      const parser = getParser(platform);

      if (!parser) {
        showChatdownError(t('contentErrorUnsupportedPlatform'));
        return;
      }

      const messages = parser.parse();

      if (messages.length === 0) {
        showChatdownError(t('contentErrorNoConversation'));
        return;
      }

      setLoading(true);

      const request: ChromeMessage = {
        action: 'startArticleGeneration',
        mode,
        messages,
        sourceUrl: window.location.href,
        platform,
      };

      chrome.runtime.sendMessage(request, (response: ChromeResponse) => {
        if (chrome.runtime.lastError) {
          setLoading(false);
          showChatdownError(chrome.runtime.lastError.message || t('contentErrorBackgroundUnavailable'));
          return;
        }

        if (response?.state) {
          setLoading(isBusyPhase(response.state.phase));
        } else {
          setLoading(false);
        }

        if (response?.error && !response.state) {
          showChatdownError(response.error);
        }
      });
    } catch (error) {
      setLoading(false);
      showChatdownError(error instanceof Error ? error.message : t('commonUnknownError'));
    }
  };

  return (
    <>
      <div
        className="chatdown-split-button"
        ref={buttonGroupRef}
        lang={locale}
        onClick={stopHostClickPropagation}
        onMouseDown={stopHostClickPropagation}
        onPointerDown={stopHostClickPropagation}
      >
        <button
          type="button"
          onClick={handlePrimaryButtonClick}
          className="btn btn-ghost text-token-text-primary chatdown-split-button__main"
          title={primaryButtonLabel}
          aria-label={primaryButtonLabel}
          aria-busy={loading}
        >
          <div className="flex w-full items-center justify-center gap-1.5">
            {loading ? (
              <svg className="icon-sm animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="32">
                  <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite" />
                </circle>
              </svg>
            ) : (
              <svg className="icon-sm" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            <span className="chatdown-split-button__label">{t('appName')}</span>
          </div>
        </button>

        <button
          type="button"
          className="btn btn-ghost text-token-text-primary chatdown-split-button__toggle"
          ref={toggleButtonRef}
          onClick={() => setShowMenu((current) => !current)}
          aria-label={t('contentGenerationModeAria')}
          aria-expanded={showMenu}
          title={t('contentGenerationModeAria')}
          disabled={loading}
        >
          <svg className="icon-sm" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {showMenu && menuPosition ? createPortal(
        <div id="chatdown-button-menu-root" lang={locale}>
          <div
            className="chatdown-split-button__menu chatdown-split-button__menu--portal"
            ref={menuPanelRef}
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            <button
              type="button"
              className="chatdown-split-button__item"
              onClick={() => void startGeneration('full')}
            >
              <strong>{t('contentModeFullTitle')}</strong>
              <span>{t('contentModeFullDescription')}</span>
            </button>
            <button
              type="button"
              className="chatdown-split-button__item"
              onClick={() => void startGeneration('partial')}
            >
              <strong>{t('contentModePartialTitle')}</strong>
              <span>{t('contentModePartialDescription')}</span>
            </button>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
