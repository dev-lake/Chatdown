import type { Platform, ChatParser } from '../../types';
import { ChatGPTParser } from './chatgpt';
import { GeminiParser } from './gemini';
import { DeepSeekParser } from './deepseek';

export function detectPlatform(): Platform {
  const hostname = window.location.hostname;

  if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) {
    return 'chatgpt';
  }
  if (hostname.includes('gemini.google.com')) {
    return 'gemini';
  }
  if (hostname.includes('deepseek.com')) {
    return 'deepseek';
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
    default:
      return null;
  }
}
