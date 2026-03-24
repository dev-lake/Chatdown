import { useEffect, useState } from 'react';
import { detectPlatform, getParser } from './parsers';
import {
  openChatdownOverlay,
  showChatdownError,
} from './events';
import type { ChromeMessage, ChromeResponse } from '../types';

export default function App() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadArticleState = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getArticleState' });
        setLoading(Boolean(response?.state?.isGenerating));
      } catch (error) {
        // Ignore load failures in the button host.
      }
    };

    const handleMessage = (message: ChromeMessage) => {
      if (message.action === 'generatingArticle') {
        setLoading(true);
      } else if (message.action === 'articleChunk') {
        setLoading(true);
      } else if (message.action === 'displayArticle') {
        setLoading(false);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    void loadArticleState();

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleGenerate = async (event: React.MouseEvent) => {
    const forceRegenerate = event.shiftKey;

    openChatdownOverlay();

    if (loading) {
      return;
    }

    try {
      const platform = detectPlatform();
      const parser = getParser(platform);

      if (!parser) {
        showChatdownError('Unsupported platform');
        return;
      }

      const messages = parser.parse();

      if (messages.length === 0) {
        showChatdownError('No conversation found');
        return;
      }

      setLoading(true);

      const message: ChromeMessage = {
        action: 'startArticleGeneration',
        messages,
        forceRegenerate,
        sourceUrl: window.location.href,
        platform,
      };

      chrome.runtime.sendMessage(message, (response: ChromeResponse) => {
        if (chrome.runtime.lastError) {
          setLoading(false);
          showChatdownError(chrome.runtime.lastError.message || 'Failed to contact the background worker.');
          return;
        }

        if (response?.error) {
          setLoading(false);
          showChatdownError(response.error);
          return;
        }

        setLoading(Boolean(response?.state?.isGenerating));
      });
    } catch (error) {
      setLoading(false);
      showChatdownError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <button
      onClick={handleGenerate}
      className="btn btn-ghost text-token-text-primary"
      title="Open floating article window (Shift+Click to force regenerate)"
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
        <span>Chatdown</span>
      </div>
    </button>
  );
}
