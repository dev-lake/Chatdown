export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApiConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface NotionConfig {
  integrationToken: string;
  databaseId: string;
}

export interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: any;
}

export interface ChromeMessage {
  action: 'generateArticle' | 'testConnection' | 'displayArticle' | 'generatingArticle' | 'openSidePanel' | 'articleChunk' | 'getLastArticle' | 'isGenerating' | 'regenerateArticle' | 'exportToNotion' | 'testNotionConnection';
  messages?: Message[];
  config?: ApiConfig;
  article?: string;
  chunk?: string;
  forceRegenerate?: boolean;
  sourceUrl?: string;
  notionConfig?: NotionConfig;
  articleTitle?: string;
  articleContent?: string;
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
