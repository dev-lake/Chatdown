import type { Platform, ChatParser } from '../../types';
import { ChatGPTParser } from './chatgpt';
import { GeminiParser } from './gemini';
import { DeepSeekParser } from './deepseek';
import { DoubaoParser } from './doubao';
import { GoogleAiModeParser } from './google-ai-mode';

function isGoogleSearchHost(hostname: string): boolean {
  return hostname === 'www.google.com' || hostname === 'google.com';
}

function isGoogleAiModePage(pathname: string): boolean {
  const params = new URLSearchParams(window.location.search);

  return (
    pathname === '/ai'
    || pathname.startsWith('/ai/')
    || pathname === '/aimode'
    || pathname.startsWith('/aimode/')
    || params.get('udm') === '50'
  );
}

export function detectPlatform(): Platform {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  const isDoubaoHost = hostname === 'www.doubao.com' || hostname === 'doubao.com';

  if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) {
    return 'chatgpt';
  }
  if (hostname.includes('gemini.google.com')) {
    return 'gemini';
  }
  if (isGoogleSearchHost(hostname) && isGoogleAiModePage(pathname)) {
    return 'google-ai-mode';
  }
  if (hostname.includes('deepseek.com')) {
    return 'deepseek';
  }
  if (
    isDoubaoHost
    && (
      pathname.startsWith('/chat')
      || document.querySelector('[data-testid="chat_input_input"], [data-testid="scroll_view"], [aria-label="doc_editor"]')
    )
  ) {
    return 'doubao';
  }

  return 'unknown';
}

export function getParser(platform: Platform): ChatParser | null {
  switch (platform) {
    case 'chatgpt':
      return new ChatGPTParser();
    case 'gemini':
      return new GeminiParser();
    case 'deepseek':
      return new DeepSeekParser();
    case 'doubao':
      return new DoubaoParser();
    case 'google-ai-mode':
      return new GoogleAiModeParser();
    default:
      return null;
  }
}
