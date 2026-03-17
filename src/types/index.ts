export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApiConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface ChromeMessage {
  action: 'generateArticle' | 'testConnection' | 'displayArticle' | 'generatingArticle' | 'openSidePanel';
  messages?: Message[];
  config?: ApiConfig;
  article?: string;
}

export interface ChromeResponse {
  article?: string;
  error?: string;
  success?: boolean;
}

export type Platform = 'chatgpt' | 'gemini' | 'deepseek' | 'unknown';

export interface ChatParser {
  parse(): Message[];
}
