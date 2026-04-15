import type { Platform, ChatParser } from '../../types';
import { ChatGPTParser } from './chatgpt';
import { GeminiParser } from './gemini';
import { DeepSeekParser } from './deepseek';
import { DoubaoParser } from './doubao';

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
    default:
      return null;
  }
}
