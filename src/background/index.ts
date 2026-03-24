import type {
  ArticleState,
  ChromeMessage,
  ChromeResponse,
  Message,
  Platform,
} from '../types';
import { getApiConfig, getNotionConfig } from './storage';
import { generateArticle, testConnection } from './llm-client';
import { testNotionConnection, exportToNotion } from './notion-client';

const ARTICLE_STATE_KEY_PREFIX = 'articleState:';

function getArticleStateStorageKey(tabId: number): string {
  return `${ARTICLE_STATE_KEY_PREFIX}${tabId}`;
}

function createEmptyArticleState(): ArticleState {
  return {
    article: '',
    partialArticle: '',
    conversationHash: '',
    messages: [],
    sourceUrl: '',
    platform: 'unknown',
    isGenerating: false,
  };
}

async function getArticleStateForTab(tabId: number): Promise<ArticleState> {
  const key = getArticleStateStorageKey(tabId);
  const result = await chrome.storage.local.get(key);

  return {
    ...createEmptyArticleState(),
    ...(result[key] as Partial<ArticleState> | undefined),
  };
}

async function setArticleStateForTab(
  tabId: number,
  updates: Partial<ArticleState>
): Promise<ArticleState> {
  const key = getArticleStateStorageKey(tabId);
  const currentState = await getArticleStateForTab(tabId);
  const nextState: ArticleState = {
    ...currentState,
    ...updates,
  };

  await chrome.storage.local.set({ [key]: nextState });
  return nextState;
}

async function clearArticleStateForTab(tabId: number): Promise<void> {
  await chrome.storage.local.remove(getArticleStateStorageKey(tabId));
}

async function sendMessageToTab(tabId: number, message: ChromeMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Ignore when the content script is not available for this tab.
  }
}

function buildErrorArticle(errorMessage: string): string {
  return `# Error\n\n${errorMessage}`;
}

function appendSourceUrl(article: string, sourceUrl: string): string {
  if (!sourceUrl) {
    return article;
  }

  return `${article}\n\n---\n\n**Source:** [${sourceUrl}](${sourceUrl})`;
}

function getTabIdFromSender(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
): number | null {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') {
    sendResponse({ error: 'No tab ID found' });
    return null;
  }

  return tabId;
}

// Simple hash function for conversation content
function hashMessages(messages: Message[]): string {
  const content = messages.map((message) => `${message.role}:${message.content}`).join('|');
  let hash = 0;

  for (let index = 0; index < content.length; index += 1) {
    const char = content.charCodeAt(index);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }

  return hash.toString(36);
}

async function publishError(
  tabId: number,
  errorMessage: string,
  extraState: Partial<ArticleState> = {}
): Promise<void> {
  const article = buildErrorArticle(errorMessage);

  await setArticleStateForTab(tabId, {
    article,
    partialArticle: '',
    isGenerating: false,
    ...extraState,
  });

  await sendMessageToTab(tabId, {
    action: 'displayArticle',
    article,
  });
}

async function runArticleGeneration(
  tabId: number,
  messages: Message[],
  sourceUrl: string,
  platform: Platform
): Promise<ArticleState> {
  const config = await getApiConfig();

  if (!config) {
    const errorMessage = 'API configuration not found. Please configure in settings.';
    await publishError(tabId, errorMessage, {
      messages,
      sourceUrl,
      platform,
    });
    throw new Error(errorMessage);
  }

  const conversationHash = hashMessages(messages);
  let partialArticle = '';

  await setArticleStateForTab(tabId, {
    article: '',
    partialArticle: '',
    conversationHash,
    messages,
    sourceUrl,
    platform,
    isGenerating: true,
  });

  await sendMessageToTab(tabId, { action: 'generatingArticle' });

  try {
    const article = await generateArticle(messages, config, async (chunk) => {
      partialArticle += chunk;

      await setArticleStateForTab(tabId, {
        partialArticle,
        isGenerating: true,
      });

      await sendMessageToTab(tabId, {
        action: 'articleChunk',
        chunk,
      });
    });

    const articleWithSource = appendSourceUrl(article, sourceUrl);

    const nextState = await setArticleStateForTab(tabId, {
      article: articleWithSource,
      partialArticle: '',
      conversationHash,
      messages,
      sourceUrl,
      platform,
      isGenerating: false,
    });

    await sendMessageToTab(tabId, {
      action: 'displayArticle',
      article: articleWithSource,
    });

    return nextState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    await publishError(tabId, errorMessage, {
      conversationHash,
      messages,
      sourceUrl,
      platform,
    });

    throw new Error(errorMessage);
  }
}

chrome.runtime.onMessage.addListener(
  (message: ChromeMessage, sender, sendResponse: (response: ChromeResponse) => void) => {
    if (message.action === 'startArticleGeneration') {
      handleStartArticleGeneration(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'testConnection') {
      handleTestConnection(message, sendResponse);
      return true;
    }

    if (message.action === 'getArticleState') {
      handleGetArticleState(sender, sendResponse);
      return true;
    }

    if (message.action === 'regenerateArticle') {
      handleRegenerateArticle(sender, sendResponse);
      return true;
    }

    if (message.action === 'saveArticleContent') {
      handleSaveArticleContent(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'testNotionConnection') {
      handleTestNotionConnection(message, sendResponse);
      return true;
    }

    if (message.action === 'exportToNotion') {
      handleExportToNotion(message, sender, sendResponse);
      return true;
    }

    return false;
  }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearArticleStateForTab(tabId);
});

async function handleStartArticleGeneration(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const tabId = getTabIdFromSender(sender, sendResponse);
  if (tabId === null) {
    return;
  }

  const messages = message.messages ?? [];
  const sourceUrl = message.sourceUrl ?? '';
  const platform = message.platform ?? 'unknown';

  try {
    if (messages.length === 0) {
      const errorMessage = 'No conversation found.';
      await publishError(tabId, errorMessage, {
        messages,
        sourceUrl,
        platform,
      });
      sendResponse({ error: errorMessage });
      return;
    }

    const conversationHash = hashMessages(messages);
    const currentState = await getArticleStateForTab(tabId);

    await setArticleStateForTab(tabId, {
      conversationHash,
      messages,
      sourceUrl,
      platform,
    });

    if (
      !message.forceRegenerate &&
      currentState.conversationHash === conversationHash &&
      currentState.article
    ) {
      await sendMessageToTab(tabId, {
        action: 'displayArticle',
        article: currentState.article,
      });

      sendResponse({
        article: currentState.article,
        state: {
          ...currentState,
          messages,
          sourceUrl,
          platform,
        },
      });
      return;
    }

    const nextState = await runArticleGeneration(tabId, messages, sourceUrl, platform);
    sendResponse({ article: nextState.article, state: nextState });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

async function handleTestConnection(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  try {
    if (!message.config) {
      sendResponse({ error: 'No configuration provided' });
      return;
    }

    const success = await testConnection(message.config);
    sendResponse({ success });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleGetArticleState(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const tabId = getTabIdFromSender(sender, sendResponse);
  if (tabId === null) {
    return;
  }

  try {
    const state = await getArticleStateForTab(tabId);
    sendResponse({
      article: state.isGenerating ? state.partialArticle || state.article : state.article,
      state,
    });
  } catch (error) {
    sendResponse({ error: 'Failed to load article state.' });
  }
}

async function handleRegenerateArticle(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const tabId = getTabIdFromSender(sender, sendResponse);
  if (tabId === null) {
    return;
  }

  try {
    const currentState = await getArticleStateForTab(tabId);

    if (currentState.messages.length === 0) {
      const errorMessage = 'No conversation found to regenerate.';
      await publishError(tabId, errorMessage);
      sendResponse({ error: errorMessage });
      return;
    }

    const nextState = await runArticleGeneration(
      tabId,
      currentState.messages,
      currentState.sourceUrl,
      currentState.platform
    );

    sendResponse({ article: nextState.article, state: nextState });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

async function handleSaveArticleContent(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const tabId = getTabIdFromSender(sender, sendResponse);
  if (tabId === null) {
    return;
  }

  if (!message.articleContent) {
    sendResponse({ error: 'No article content to save.' });
    return;
  }

  try {
    const state = await setArticleStateForTab(tabId, {
      article: message.articleContent,
      partialArticle: '',
      isGenerating: false,
    });

    sendResponse({
      success: true,
      article: state.article,
      state,
    });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

async function handleTestNotionConnection(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  try {
    if (!message.notionConfig) {
      sendResponse({ error: 'No Notion configuration provided' });
      return;
    }

    const result = await testNotionConnection(message.notionConfig);

    if (result.success) {
      sendResponse({ success: true });
      return;
    }

    if (result.missingProperties && result.missingProperties.length > 0) {
      sendResponse({
        success: false,
        missingProperties: result.missingProperties,
      });
      return;
    }

    sendResponse({
      success: false,
      error: result.error || 'Connection failed',
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleExportToNotion(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const tabId = getTabIdFromSender(sender, sendResponse);
  if (tabId === null) {
    return;
  }

  try {
    const config = await getNotionConfig();

    if (!config) {
      sendResponse({ error: 'Notion not configured. Please configure in settings.' });
      return;
    }

    if (!message.articleTitle || !message.articleContent) {
      sendResponse({ error: 'No article content to export' });
      return;
    }

    const state = await getArticleStateForTab(tabId);

    const result = await exportToNotion(
      config,
      message.articleTitle,
      message.articleContent,
      state.sourceUrl,
      state.platform
    );

    if (result.success) {
      sendResponse({ success: true, article: result.pageUrl });
      return;
    }

    sendResponse({ error: result.error });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
