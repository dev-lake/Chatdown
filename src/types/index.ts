export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'ja';
export type LocalePreference = 'auto' | Locale;

export type WorkflowPhase = 'idle' | 'summarizing_rounds' | 'selecting_rounds' | 'generating' | 'ready' | 'error';
export type GenerationMode = 'full' | 'partial';
export type LocalEditOperation = 'expand' | 'polish' | 'shorten' | 'custom' | 'delete';

export interface ConversationRound {
  id: string;
  index: number;
  messageIndexes: number[];
  summary: string;
  preview?: string;
}

export interface ArticleState {
  article: string;
  partialArticle: string;
  conversationHash: string;
  messages: Message[];
  sourceUrl: string;
  platform: Platform;
  phase: WorkflowPhase;
  mode: GenerationMode | null;
  rounds: ConversationRound[];
  selectedRoundIds: string[];
  notice: string;
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

export interface ObsidianConfig {
  vault: string;
  folder: string;
}

export interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: any;
}

export interface ChromeMessage {
  action:
    | 'startArticleGeneration'
    | 'generateArticleFromSelection'
    | 'testConnection'
    | 'displayArticle'
    | 'partialSelectionLoading'
    | 'partialSelectionReady'
    | 'generatingArticle'
    | 'articleChunk'
    | 'getArticleState'
    | 'regenerateArticle'
    | 'exportToNotion'
    | 'exportToObsidian'
    | 'testNotionConnection'
    | 'saveArticleContent'
    | 'modifyArticleSelection';
  messages?: Message[];
  config?: ApiConfig;
  article?: string;
  chunk?: string;
  sourceUrl?: string;
  platform?: Platform;
  notionConfig?: NotionConfig;
  articleTitle?: string;
  articleContent?: string;
  useClipboard?: boolean;
  mode?: GenerationMode;
  operation?: LocalEditOperation;
  instruction?: string;
  selectedText?: string;
  selectedMarkdown?: string;
  selectedRoundIds?: string[];
  state?: ArticleState;
}

export interface ChromeResponse {
  article?: string;
  replacement?: string;
  error?: string;
  success?: boolean;
  missingProperties?: string[];
  state?: ArticleState;
}

export type Platform = 'chatgpt' | 'gemini' | 'deepseek' | 'doubao' | 'unknown';

export interface ChatParser {
  parse(): Message[];
}
