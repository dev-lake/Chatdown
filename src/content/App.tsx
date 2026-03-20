import { useState } from 'react';
import { detectPlatform, getParser } from './parsers';
import type { ChromeMessage, ChromeResponse } from '../types';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (event: React.MouseEvent) => {
    if (loading) return; // Prevent multiple clicks

    setLoading(true);
    setError(null);

    // Check if Shift key is pressed for force regenerate
    const forceRegenerate = event.shiftKey;

    try {
      const platform = detectPlatform();
      const parser = getParser(platform);

      if (!parser) {
        setError('Unsupported platform');
        setLoading(false);
        return;
      }

      const messages = parser.parse();

      if (messages.length === 0) {
        setError('No conversation found');
        setLoading(false);
        return;
      }

      // Send message to background to open side panel and generate article
      const message: ChromeMessage = {
        action: 'openSidePanel',
        messages,
        forceRegenerate,
        sourceUrl: window.location.href,
        platform,
      };

      // Set a timeout to re-enable the button even if no response
      const timeout = setTimeout(() => {
        setLoading(false);
      }, 2000);

      chrome.runtime.sendMessage(message, (response: ChromeResponse) => {
        clearTimeout(timeout);
        if (response?.error) {
          setError(response.error);
        }
        setLoading(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="btn btn-ghost text-token-text-primary"
        title="Generate article in side panel (Shift+Click to force regenerate)"
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
              <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
          <span>Chatdown</span>
        </div>
      </button>

      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-[9999]">
          {error}
        </div>
      )}
    </>
  );
}
