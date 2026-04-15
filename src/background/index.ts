import type {
  ApiConfig,
  ArticleState,
  ChromeMessage,
  ChromeResponse,
  ConversationRound,
  GenerationMode,
  Message,
  Platform,
} from '../types';
import { getCurrentLocaleContext, type TranslateFn } from '../i18n/core';
import { getApiConfig, getNotionConfig } from './storage';
import {
  generateArticle,
  summarizeConversationRounds,
  testConnection,
} from './llm-client';
import { exportToNotion, testNotionConnection } from './notion-client';

const ARTICLE_STATE_KEY_PREFIX = 'articleState:';
const ARTICLE_CACHE_KEY_PREFIX = 'articleCache:';
const ROUND_PREVIEW_LENGTH = 180;

interface ArticleCacheEntry {
  article: string;
  updatedAt: number;
}

interface GenerationRequest {
  allMessages: Message[];
  articleMessages: Message[];
  sourceUrl: string;
  platform: Platform;
  mode: GenerationMode;
  rounds: ConversationRound[];
  selectedRoundIds: string[];
}

interface SelectionPreparationResult {
  state: ArticleState;
  error?: string;
}

function getArticleStateStorageKey(tabId: number): string {
  return `${ARTICLE_STATE_KEY_PREFIX}${tabId}`;
}

function getArticleCacheStorageKey(conversationHash: string, variantKey: string): string {
  return `${ARTICLE_CACHE_KEY_PREFIX}${conversationHash}:${variantKey}`;
}

function createEmptyArticleState(): ArticleState {
  return {
    article: '',
    partialArticle: '',
    conversationHash: '',
    messages: [],
    sourceUrl: '',
    platform: 'unknown',
    phase: 'idle',
    mode: null,
    rounds: [],
    selectedRoundIds: [],
    notice: '',
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

async function getCachedArticle(
  conversationHash: string,
  variantKey: string
): Promise<ArticleCacheEntry | null> {
  const key = getArticleCacheStorageKey(conversationHash, variantKey);
  const result = await chrome.storage.local.get(key);

  return (result[key] as ArticleCacheEntry | undefined) ?? null;
}

async function setCachedArticle(
  conversationHash: string,
  variantKey: string,
  article: string
): Promise<void> {
  const key = getArticleCacheStorageKey(conversationHash, variantKey);
  const entry: ArticleCacheEntry = {
    article,
    updatedAt: Date.now(),
  };

  await chrome.storage.local.set({ [key]: entry });
}

async function sendMessageToTab(tabId: number, message: ChromeMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Ignore when the content script is not available for this tab.
  }
}

function buildErrorArticle(errorTitle: string, errorMessage: string): string {
  return `# ${errorTitle}\n\n${errorMessage}`;
}

function appendSourceUrl(article: string, sourceUrl: string): string {
  if (!sourceUrl) {
    return article;
  }

  return `${article}\n\n---\n\n[${sourceUrl}](${sourceUrl})`;
}

function getTabIdFromSender(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void,
  t: TranslateFn
): number | null {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') {
    sendResponse({ error: t('backgroundNoTabId') });
    return null;
  }

  return tabId;
}

function hashString(content: string): string {
  let hash = 0;

  for (let index = 0; index < content.length; index += 1) {
    const char = content.charCodeAt(index);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }

  return hash.toString(36);
}

function hashMessages(messages: Message[]): string {
  const content = messages.map((message) => `${message.role}:${message.content}`).join('|');
  return hashString(content);
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildConversationRounds(messages: Message[]): ConversationRound[] {
  if (messages.length === 0) {
    return [];
  }

  const rounds: ConversationRound[] = [];
  let currentIndexes: number[] = [];
  let roundNumber = 1;
  let hasSeenUser = false;

  const pushRound = () => {
    if (currentIndexes.length === 0) {
      return;
    }

    const preview = truncateText(
      currentIndexes
        .map((messageIndex) => messages[messageIndex]?.content || '')
        .join(' '),
      ROUND_PREVIEW_LENGTH
    );

    rounds.push({
      id: `round-${roundNumber}`,
      index: roundNumber,
      messageIndexes: [...currentIndexes],
      summary: '',
      preview: preview || undefined,
    });

    roundNumber += 1;
    currentIndexes = [];
  };

  messages.forEach((message, index) => {
    if (message.role === 'user') {
      if (currentIndexes.length > 0) {
        pushRound();
      }

      currentIndexes = [index];
      hasSeenUser = true;
      return;
    }

    if (!hasSeenUser && currentIndexes.length === 0) {
      currentIndexes = [index];
      return;
    }

    currentIndexes.push(index);
  });

  pushRound();
  return rounds;
}

function applyRoundSummaries(
  rounds: ConversationRound[],
  summaries: string[]
): ConversationRound[] {
  return rounds.map((round, index) => ({
    ...round,
    summary: summaries[index] || round.summary,
  }));
}

function normalizeSelectedRoundIds(
  rounds: ConversationRound[],
  selectedRoundIds: string[]
): string[] {
  const allowed = new Set(selectedRoundIds);

  return rounds
    .filter((round) => allowed.has(round.id))
    .map((round) => round.id);
}

function getSelectedRoundMessages(
  allMessages: Message[],
  rounds: ConversationRound[],
  selectedRoundIds: string[]
): Message[] {
  const selectedSet = new Set(normalizeSelectedRoundIds(rounds, selectedRoundIds));
  const selectedIndexes = rounds
    .filter((round) => selectedSet.has(round.id))
    .flatMap((round) => round.messageIndexes)
    .sort((left, right) => left - right);

  return selectedIndexes
    .map((messageIndex) => allMessages[messageIndex])
    .filter((message): message is Message => Boolean(message));
}

function getCacheVariantKey(mode: GenerationMode, selectedRoundIds: string[]): string {
  if (mode === 'full') {
    return 'full';
  }

  return `partial:${hashString(selectedRoundIds.join('|'))}`;
}

function getCacheVariantKeyFromState(state: ArticleState): string | null {
  if (!state.mode) {
    return null;
  }

  if (state.mode === 'full') {
    return getCacheVariantKey('full', []);
  }

  if (state.selectedRoundIds.length === 0) {
    return null;
  }

  return getCacheVariantKey('partial', state.selectedRoundIds);
}

function isVisibleArticleState(state: ArticleState): boolean {
  return Boolean(state.article) && (state.phase === 'ready' || state.phase === 'error');
}

async function emitStateMessage(
  tabId: number,
  action: ChromeMessage['action'],
  state: ArticleState,
  extras: Partial<ChromeMessage> = {}
): Promise<void> {
  await sendMessageToTab(tabId, {
    action,
    state,
    ...extras,
  });
}

async function publishError(
  tabId: number,
  t: TranslateFn,
  errorMessage: string,
  extraState: Partial<ArticleState> = {}
): Promise<ArticleState> {
  const article = buildErrorArticle(t('commonErrorTitle'), errorMessage);

  const state = await setArticleStateForTab(tabId, {
    article,
    partialArticle: '',
    phase: 'error',
    notice: '',
    ...extraState,
  });

  await emitStateMessage(tabId, 'displayArticle', state, {
    article,
  });

  return state;
}

async function restoreVisibleArticle(
  tabId: number,
  stateToRestore: ArticleState,
  notice: string
): Promise<ArticleState> {
  const restoredState = await setArticleStateForTab(tabId, {
    ...stateToRestore,
    notice,
  });

  await emitStateMessage(tabId, 'displayArticle', restoredState, {
    article: restoredState.article,
  });

  return restoredState;
}

async function resumeWorkflowForState(tabId: number, state: ArticleState): Promise<void> {
  if (state.phase === 'summarizing_rounds') {
    await emitStateMessage(tabId, 'partialSelectionLoading', state);
    return;
  }

  if (state.phase === 'selecting_rounds') {
    await emitStateMessage(tabId, 'partialSelectionReady', state);
    return;
  }

  if (state.phase === 'generating') {
    await emitStateMessage(tabId, 'generatingArticle', state);
    return;
  }

  await emitStateMessage(tabId, 'displayArticle', state, {
    article: state.article,
  });
}

async function runArticleGeneration(
  tabId: number,
  request: GenerationRequest,
  t: TranslateFn,
  options: {
    bypassCache?: boolean;
    notice?: string;
  } = {}
): Promise<ArticleState> {
  const config = await getApiConfig();

  if (!config) {
    const errorMessage = t('backgroundApiConfigMissing');
    await publishError(tabId, t, errorMessage, {
      messages: request.allMessages,
      sourceUrl: request.sourceUrl,
      platform: request.platform,
      mode: request.mode,
      rounds: request.mode === 'partial' ? request.rounds : [],
      selectedRoundIds: request.mode === 'partial' ? normalizeSelectedRoundIds(request.rounds, request.selectedRoundIds) : [],
    });
    throw new Error(errorMessage);
  }

  const conversationHash = hashMessages(request.allMessages);
  const normalizedSelectedRoundIds = request.mode === 'partial'
    ? normalizeSelectedRoundIds(request.rounds, request.selectedRoundIds)
    : [];
  const cacheVariantKey = getCacheVariantKey(request.mode, normalizedSelectedRoundIds);
  const notice = options.notice ?? '';

  if (!options.bypassCache) {
    const cachedArticle = await getCachedArticle(conversationHash, cacheVariantKey);

    if (cachedArticle) {
      const cachedState = await setArticleStateForTab(tabId, {
        article: cachedArticle.article,
        partialArticle: '',
        conversationHash,
        messages: request.allMessages,
        sourceUrl: request.sourceUrl,
        platform: request.platform,
        phase: 'ready',
        mode: request.mode,
        rounds: request.mode === 'partial' ? request.rounds : [],
        selectedRoundIds: normalizedSelectedRoundIds,
        notice,
      });

      await emitStateMessage(tabId, 'displayArticle', cachedState, {
        article: cachedArticle.article,
      });

      return cachedState;
    }
  }

  let partialArticle = '';

  const generatingState = await setArticleStateForTab(tabId, {
    article: '',
    partialArticle: '',
    conversationHash,
    messages: request.allMessages,
    sourceUrl: request.sourceUrl,
    platform: request.platform,
    phase: 'generating',
    mode: request.mode,
    rounds: request.mode === 'partial' ? request.rounds : [],
    selectedRoundIds: normalizedSelectedRoundIds,
    notice,
  });

  await emitStateMessage(tabId, 'generatingArticle', generatingState);

  try {
    const article = await generateArticle(request.articleMessages, config, t, async (chunk) => {
      partialArticle += chunk;

      await setArticleStateForTab(tabId, {
        partialArticle,
        phase: 'generating',
      });

      await sendMessageToTab(tabId, {
        action: 'articleChunk',
        chunk,
      });
    });

    const articleWithSource = appendSourceUrl(article, request.sourceUrl);

    await setCachedArticle(conversationHash, cacheVariantKey, articleWithSource);

    const nextState = await setArticleStateForTab(tabId, {
      article: articleWithSource,
      partialArticle: '',
      conversationHash,
      messages: request.allMessages,
      sourceUrl: request.sourceUrl,
      platform: request.platform,
      phase: 'ready',
      mode: request.mode,
      rounds: request.mode === 'partial' ? request.rounds : [],
      selectedRoundIds: normalizedSelectedRoundIds,
      notice,
    });

    await emitStateMessage(tabId, 'displayArticle', nextState, {
      article: articleWithSource,
    });

    return nextState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : t('commonUnknownError');

    await publishError(tabId, t, errorMessage, {
      conversationHash,
      messages: request.allMessages,
      sourceUrl: request.sourceUrl,
      platform: request.platform,
      mode: request.mode,
      rounds: request.mode === 'partial' ? request.rounds : [],
      selectedRoundIds: normalizedSelectedRoundIds,
    });

    throw new Error(errorMessage);
  }
}

async function preparePartialSelection(
  tabId: number,
  messages: Message[],
  sourceUrl: string,
  platform: Platform,
  previousVisibleState: ArticleState | null,
  t: TranslateFn
): Promise<SelectionPreparationResult> {
  const config = await getApiConfig();
  const conversationHash = hashMessages(messages);
  const baseRounds = buildConversationRounds(messages);

  if (!config) {
    const errorMessage = t('backgroundApiConfigMissing');

    if (previousVisibleState) {
      const restoredState = await restoreVisibleArticle(tabId, previousVisibleState, errorMessage);
      return { state: restoredState, error: errorMessage };
    }

    const errorState = await publishError(tabId, t, errorMessage, {
      conversationHash,
      messages,
      sourceUrl,
      platform,
      mode: 'partial',
      rounds: [],
      selectedRoundIds: [],
    });

    return { state: errorState, error: errorMessage };
  }

  const loadingState = await setArticleStateForTab(tabId, {
    article: '',
    partialArticle: '',
    conversationHash,
    messages,
    sourceUrl,
    platform,
    phase: 'summarizing_rounds',
    mode: 'partial',
    rounds: baseRounds,
    selectedRoundIds: [],
    notice: '',
  });

  await emitStateMessage(tabId, 'partialSelectionLoading', loadingState);

  try {
    const summaries = await summarizeConversationRounds(baseRounds, messages, config, t);
    const rounds = applyRoundSummaries(baseRounds, summaries);

    const nextState = await setArticleStateForTab(tabId, {
      article: '',
      partialArticle: '',
      conversationHash,
      messages,
      sourceUrl,
      platform,
      phase: 'selecting_rounds',
      mode: 'partial',
      rounds,
      selectedRoundIds: [],
      notice: '',
    });

    await emitStateMessage(tabId, 'partialSelectionReady', nextState);

    return { state: nextState };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : t('backgroundFailedToSummarizeRounds');

    if (previousVisibleState) {
      const restoredState = await restoreVisibleArticle(tabId, previousVisibleState, errorMessage);
      return { state: restoredState, error: errorMessage };
    }

    const errorState = await publishError(tabId, t, errorMessage, {
      conversationHash,
      messages,
      sourceUrl,
      platform,
      mode: 'partial',
      rounds: [],
      selectedRoundIds: [],
    });

    return { state: errorState, error: errorMessage };
  }
}

chrome.runtime.onMessage.addListener(
  (message: ChromeMessage, sender, sendResponse: (response: ChromeResponse) => void) => {
    if (message.action === 'startArticleGeneration') {
      void handleStartArticleGeneration(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'generateArticleFromSelection') {
      void handleGenerateArticleFromSelection(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'testConnection') {
      void handleTestConnection(message, sendResponse);
      return true;
    }

    if (message.action === 'getArticleState') {
      void handleGetArticleState(sender, sendResponse);
      return true;
    }

    if (message.action === 'regenerateArticle') {
      void handleRegenerateArticle(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'saveArticleContent') {
      void handleSaveArticleContent(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'testNotionConnection') {
      void handleTestNotionConnection(message, sendResponse);
      return true;
    }

    if (message.action === 'exportToNotion') {
      void handleExportToNotion(message, sender, sendResponse);
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
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  const messages = message.messages ?? [];
  const sourceUrl = message.sourceUrl ?? '';
  const platform = message.platform ?? 'unknown';
  const mode = message.mode ?? 'full';

  try {
    if (messages.length === 0) {
      const errorMessage = t('backgroundNoConversationFound');
      const state = await publishError(tabId, t, errorMessage, {
        messages,
        sourceUrl,
        platform,
        mode,
        rounds: [],
        selectedRoundIds: [],
      });
      sendResponse({ error: errorMessage, state });
      return;
    }

    const currentState = await getArticleStateForTab(tabId);
    const conversationHash = hashMessages(messages);
    const canResumeCurrentState = currentState.conversationHash === conversationHash
      && currentState.mode === mode
      && (
        (mode === 'full' && (currentState.phase === 'ready' || currentState.phase === 'generating'))
        || (mode === 'partial' && (currentState.phase === 'summarizing_rounds' || currentState.phase === 'selecting_rounds'))
      );

    if (canResumeCurrentState) {
      await resumeWorkflowForState(tabId, currentState);
      sendResponse({
        article: currentState.article,
        state: currentState,
      });
      return;
    }

    if (mode === 'full') {
      const nextState = await runArticleGeneration(tabId, {
        allMessages: messages,
        articleMessages: messages,
        sourceUrl,
        platform,
        mode: 'full',
        rounds: [],
        selectedRoundIds: [],
      }, t);

      sendResponse({ article: nextState.article, state: nextState });
      return;
    }

    const previousVisibleState = isVisibleArticleState(currentState) ? currentState : null;
    const result = await preparePartialSelection(
      tabId,
      messages,
      sourceUrl,
      platform,
      previousVisibleState,
      t
    );

    sendResponse({
      article: result.state.article,
      error: result.error,
      state: result.state,
    });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : t('commonUnknownError'),
      state: await getArticleStateForTab(tabId),
    });
  }
}

async function handleGenerateArticleFromSelection(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  try {
    const currentState = await getArticleStateForTab(tabId);

    if (currentState.mode !== 'partial' || currentState.phase !== 'selecting_rounds') {
      sendResponse({ error: t('backgroundNoPartialSelectionReady') });
      return;
    }

    const selectedRoundIds = normalizeSelectedRoundIds(
      currentState.rounds,
      message.selectedRoundIds ?? []
    );

    if (selectedRoundIds.length === 0) {
      sendResponse({ error: t('backgroundChooseAtLeastOneRound') });
      return;
    }

    const articleMessages = getSelectedRoundMessages(
      currentState.messages,
      currentState.rounds,
      selectedRoundIds
    );

    if (articleMessages.length === 0) {
      sendResponse({ error: t('backgroundSelectedRoundsNoMessages') });
      return;
    }

    const nextState = await runArticleGeneration(tabId, {
      allMessages: currentState.messages,
      articleMessages,
      sourceUrl: currentState.sourceUrl,
      platform: currentState.platform,
      mode: 'partial',
      rounds: currentState.rounds,
      selectedRoundIds,
    }, t);

    sendResponse({ article: nextState.article, state: nextState });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : t('commonUnknownError'),
      state: await getArticleStateForTab(tabId),
    });
  }
}

async function handleTestConnection(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();

  try {
    if (!message.config) {
      sendResponse({ error: t('backgroundNoConfigurationProvided') });
      return;
    }

    const success = await testConnection(message.config as ApiConfig);
    sendResponse({ success });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : t('commonUnknownError'),
    });
  }
}

async function handleGetArticleState(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  try {
    const state = await getArticleStateForTab(tabId);
    sendResponse({
      article: state.phase === 'generating' ? state.partialArticle || state.article : state.article,
      state,
    });
  } catch {
    sendResponse({ error: t('backgroundFailedToLoadArticleState') });
  }
}

async function handleRegenerateArticle(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  try {
    const currentState = await getArticleStateForTab(tabId);
    const messages = message.messages?.length ? message.messages : currentState.messages;
    const sourceUrl = message.sourceUrl ?? currentState.sourceUrl;
    const platform = message.platform ?? currentState.platform;

    if (messages.length === 0) {
      const errorMessage = t('backgroundNoConversationToRegenerate');
      const state = await publishError(tabId, t, errorMessage, {
        sourceUrl,
        platform,
      });
      sendResponse({ error: errorMessage, state });
      return;
    }

    const mode = message.mode ?? currentState.mode ?? 'full';

    if (mode === 'full') {
      const nextState = await runArticleGeneration(
        tabId,
        {
          allMessages: messages,
          articleMessages: messages,
          sourceUrl,
          platform,
          mode: 'full',
          rounds: [],
          selectedRoundIds: [],
        },
        t,
        { bypassCache: true }
      );

      sendResponse({ article: nextState.article, state: nextState });
      return;
    }

    const previousVisibleState = isVisibleArticleState(currentState) ? currentState : null;
    const result = await preparePartialSelection(
      tabId,
      messages,
      sourceUrl,
      platform,
      previousVisibleState,
      t
    );

    sendResponse({
      article: result.state.article,
      error: result.error,
      state: result.state,
    });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : t('commonUnknownError'),
      state: await getArticleStateForTab(tabId),
    });
  }
}

async function handleSaveArticleContent(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  if (!message.articleContent) {
    sendResponse({ error: t('backgroundNoArticleContentToSave') });
    return;
  }

  try {
    const currentState = await getArticleStateForTab(tabId);
    const cacheVariantKey = getCacheVariantKeyFromState(currentState);

    if (cacheVariantKey) {
      await setCachedArticle(
        currentState.conversationHash || hashMessages(currentState.messages),
        cacheVariantKey,
        message.articleContent
      );
    }

    const state = await setArticleStateForTab(tabId, {
      article: message.articleContent,
      partialArticle: '',
      phase: 'ready',
      notice: '',
    });

    sendResponse({
      success: true,
      article: state.article,
      state,
    });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : t('commonUnknownError'),
    });
  }
}

async function handleTestNotionConnection(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();

  try {
    if (!message.notionConfig) {
      sendResponse({ error: t('backgroundNoNotionConfigurationProvided') });
      return;
    }

    const result = await testNotionConnection(message.notionConfig, t);

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
      error: result.error || t('settingsNotionConnectionFailed'),
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : t('commonUnknownError'),
    });
  }
}

async function handleExportToNotion(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  try {
    const config = await getNotionConfig();

    if (!config) {
      sendResponse({ error: t('backgroundNotionNotConfigured') });
      return;
    }

    if (!message.articleTitle || !message.articleContent) {
      sendResponse({ error: t('backgroundNoArticleContentToExport') });
      return;
    }

    const state = await getArticleStateForTab(tabId);

    const result = await exportToNotion(
      config,
      message.articleTitle,
      message.articleContent,
      state.sourceUrl,
      state.platform,
      t
    );

    if (result.success) {
      sendResponse({ success: true, article: result.pageUrl });
      return;
    }

    sendResponse({ error: result.error });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : t('commonUnknownError'),
    });
  }
}
