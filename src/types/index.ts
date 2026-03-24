export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ArticleState {
  article: string;
  partialArticle: string;
  conversationHash: string;
  messages: Message[];
  sourceUrl: string;
  platform: Platform;
  isGenerating: boolean;
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
  action:
    | 'startArticleGeneration'
    | 'testConnection'
    | 'displayArticle'
    | 'generatingArticle'
    | 'articleChunk'
    | 'getArticleState'
    | 'regenerateArticle'
    | 'exportToNotion'
    | 'testNotionConnection'
    | 'saveArticleContent';
  messages?: Message[];
  config?: ApiConfig;
  article?: string;
  chunk?: string;
  forceRegenerate?: boolean;
  sourceUrl?: string;
  platform?: Platform;
  notionConfig?: NotionConfig;
  articleTitle?: string;
  articleContent?: string;
}

export interface ChromeResponse {
  article?: string;
  error?: string;
  success?: boolean;
  missingProperties?: string[];
  state?: ArticleState;
}

export type Platform = 'chatgpt' | 'gemini' | 'deepseek' | 'unknown';

export interface ChatParser {
  parse(): Message[];
}
