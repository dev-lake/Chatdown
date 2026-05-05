import type {
  ApiConfig,
  ArticleState,
  ChromeMessage,
  ChromeResponse,
  ConversationRound,
  GenerationMode,
  LocalEditOperation,
  Message,
  ObsidianConfig,
  Platform,
} from '../types';
import { getCurrentLocaleContext, type TranslateFn } from '../i18n/core';
import {
  clearBuiltInAuthState,
  getApiConfig,
  getBuiltInAuthState,
  getDefaultServerBaseUrl,
  getNotionConfig,
  getObsidianConfig,
  setBuiltInAuthState,
} from './storage';
import {
  generateArticle,
  rewriteArticleSelection,
  summarizeConversationRounds,
  testConnection,
} from './llm-client';
import { exportToNotion, testNotionConnection } from './notion-client';

const ARTICLE_STATE_KEY_PREFIX = 'articleState:';
const ARTICLE_CACHE_KEY_PREFIX = 'articleCache:';
const ROUND_PREVIEW_LENGTH = 180;
const MAX_OBSIDIAN_FILE_NAME_BASE_LENGTH = 80;
const LOCAL_EDIT_OPERATIONS: readonly LocalEditOperation[] = ['expand', 'polish', 'shorten', 'custom', 'delete'];
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type ActiveWorkflowPhase = 'summarizing_rounds' | 'generating';

interface ActiveWorkflow {
  id: number;
  phase: ActiveWorkflowPhase;
  controller: AbortController;
}

const activeWorkflows = new Map<number, ActiveWorkflow>();
let activeWorkflowSequence = 0;

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

function sanitizeObsidianPathSegment(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s._-]+|[\s._-]+$/g, '');

  return sanitized || 'Untitled';
}

function sanitizeObsidianFileNameBase(value: string): string {
  return sanitizeObsidianPathSegment(value)
    .slice(0, MAX_OBSIDIAN_FILE_NAME_BASE_LENGTH)
    .replace(/[\s._-]+$/g, '') || 'Untitled';
}

function normalizeObsidianFolder(folder: string): string {
  return folder
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map(sanitizeObsidianPathSegment)
    .join('/');
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function getObsidianTimestamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildObsidianNewNoteUrl(
  config: ObsidianConfig,
  articleTitle: string,
  articleContent: string,
  useClipboard: boolean
): { url: string; filePath: string } {
  const folder = normalizeObsidianFolder(config.folder);
  const noteName = `${sanitizeObsidianFileNameBase(articleTitle)}-${getObsidianTimestamp()}`;
  const filePath = folder ? `${folder}/${noteName}` : noteName;
  let url = `obsidian://new?file=${encodeURIComponent(filePath)}&vault=${encodeURIComponent(config.vault.trim())}`;

  if (useClipboard) {
    url += '&clipboard';
  } else {
    url += `&content=${encodeURIComponent(articleContent)}`;
  }

  return { url, filePath };
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';
}

function beginActiveWorkflow(tabId: number, phase: ActiveWorkflowPhase): ActiveWorkflow {
  const currentWorkflow = activeWorkflows.get(tabId);

  if (currentWorkflow) {
    currentWorkflow.controller.abort();
  }

  const workflow: ActiveWorkflow = {
    id: activeWorkflowSequence + 1,
    phase,
    controller: new AbortController(),
  };

  activeWorkflowSequence = workflow.id;
  activeWorkflows.set(tabId, workflow);
  return workflow;
}

function isCurrentActiveWorkflow(tabId: number, workflow: ActiveWorkflow): boolean {
  return activeWorkflows.get(tabId)?.id === workflow.id;
}

function clearActiveWorkflow(tabId: number, workflow: ActiveWorkflow): void {
  if (isCurrentActiveWorkflow(tabId, workflow)) {
    activeWorkflows.delete(tabId);
  }
}

function cancelActiveWorkflow(tabId: number): boolean {
  const workflow = activeWorkflows.get(tabId);

  if (!workflow) {
    return false;
  }

  workflow.controller.abort();
  return true;
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

function isLocalEditOperation(value: unknown): value is LocalEditOperation {
  return typeof value === 'string'
    && LOCAL_EDIT_OPERATIONS.includes(value as LocalEditOperation);
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

async function publishCanceledWorkflow(
  tabId: number,
  t: TranslateFn,
  previousVisibleState: ArticleState | null,
  idleState: Partial<ArticleState>
): Promise<ArticleState> {
  const notice = t('backgroundGenerationCanceled');

  if (previousVisibleState) {
    return restoreVisibleArticle(tabId, previousVisibleState, notice);
  }

  const state = await setArticleStateForTab(tabId, {
    article: '',
    partialArticle: '',
    phase: 'idle',
    notice,
    ...idleState,
  });

  await emitStateMessage(tabId, 'displayArticle', state, {
    article: '',
  });

  return state;
}

async function publishCanceledArticleGeneration(
  tabId: number,
  request: GenerationRequest,
  t: TranslateFn,
  conversationHash: string,
  selectedRoundIds: string[],
  partialArticle: string,
  previousVisibleState: ArticleState | null
): Promise<ArticleState> {
  const notice = t('backgroundGenerationCanceled');
  const rounds = request.mode === 'partial' ? request.rounds : [];

  if (partialArticle.trim()) {
    const state = await setArticleStateForTab(tabId, {
      article: partialArticle,
      partialArticle: '',
      conversationHash,
      messages: request.allMessages,
      sourceUrl: request.sourceUrl,
      platform: request.platform,
      phase: 'ready',
      mode: request.mode,
      rounds,
      selectedRoundIds,
      notice,
    });

    await emitStateMessage(tabId, 'displayArticle', state, {
      article: partialArticle,
    });

    return state;
  }

  return publishCanceledWorkflow(tabId, t, previousVisibleState, {
    conversationHash,
    messages: request.allMessages,
    sourceUrl: request.sourceUrl,
    platform: request.platform,
    mode: request.mode,
    rounds,
    selectedRoundIds,
  });
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
  const account = await getBuiltInAuthState();
  if (!account) {
    const errorMessage = t('backgroundBuiltInAuthRequired');
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
  const previousState = await getArticleStateForTab(tabId);
  const previousVisibleState = isVisibleArticleState(previousState) ? previousState : null;
  const workflow = beginActiveWorkflow(tabId, 'generating');

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
      if (!isCurrentActiveWorkflow(tabId, workflow) || workflow.controller.signal.aborted) {
        return;
      }

      partialArticle += chunk;

      await setArticleStateForTab(tabId, {
        partialArticle,
        phase: 'generating',
      });

      await sendMessageToTab(tabId, {
        action: 'articleChunk',
        chunk,
      });
    }, workflow.controller.signal);

    if (!isCurrentActiveWorkflow(tabId, workflow)) {
      return getArticleStateForTab(tabId);
    }

    if (workflow.controller.signal.aborted) {
      return publishCanceledArticleGeneration(
        tabId,
        request,
        t,
        conversationHash,
        normalizedSelectedRoundIds,
        partialArticle,
        previousVisibleState
      );
    }

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
    if (isAbortError(error)) {
      if (!isCurrentActiveWorkflow(tabId, workflow)) {
        return getArticleStateForTab(tabId);
      }

      return publishCanceledArticleGeneration(
        tabId,
        request,
        t,
        conversationHash,
        normalizedSelectedRoundIds,
        partialArticle,
        previousVisibleState
      );
    }

    if (!isCurrentActiveWorkflow(tabId, workflow)) {
      return getArticleStateForTab(tabId);
    }

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
  } finally {
    clearActiveWorkflow(tabId, workflow);
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
  const account = await getBuiltInAuthState();
  if (!account) {
    const errorMessage = t('backgroundBuiltInAuthRequired');
    const conversationHash = hashMessages(messages);

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

  const workflow = beginActiveWorkflow(tabId, 'summarizing_rounds');

  try {
    const summaries = await summarizeConversationRounds(
      baseRounds,
      messages,
      config,
      t,
      workflow.controller.signal
    );

    if (!isCurrentActiveWorkflow(tabId, workflow)) {
      return { state: await getArticleStateForTab(tabId) };
    }

    if (workflow.controller.signal.aborted) {
      const state = await publishCanceledWorkflow(tabId, t, previousVisibleState, {
        conversationHash,
        messages,
        sourceUrl,
        platform,
        mode: 'partial',
        rounds: baseRounds,
        selectedRoundIds: [],
      });

      return { state };
    }

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
    if (isAbortError(error)) {
      if (!isCurrentActiveWorkflow(tabId, workflow)) {
        return { state: await getArticleStateForTab(tabId) };
      }

      const state = await publishCanceledWorkflow(tabId, t, previousVisibleState, {
        conversationHash,
        messages,
        sourceUrl,
        platform,
        mode: 'partial',
        rounds: baseRounds,
        selectedRoundIds: [],
      });

      return { state };
    }

    if (!isCurrentActiveWorkflow(tabId, workflow)) {
      return { state: await getArticleStateForTab(tabId) };
    }

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
  } finally {
    clearActiveWorkflow(tabId, workflow);
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

    if (message.action === 'requestLoginCode') {
      void handleRequestLoginCode(message, sendResponse);
      return true;
    }

    if (message.action === 'verifyLoginCode') {
      void handleVerifyLoginCode(message, sendResponse);
      return true;
    }

    if (message.action === 'getBuiltInAccount') {
      void handleGetBuiltInAccount(sendResponse);
      return true;
    }

    if (message.action === 'logoutBuiltInAccount') {
      void handleLogoutBuiltInAccount(sendResponse);
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

    if (message.action === 'cancelArticleGeneration') {
      void handleCancelArticleGeneration(sender, sendResponse);
      return true;
    }

    if (message.action === 'saveArticleContent') {
      void handleSaveArticleContent(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'modifyArticleSelection') {
      void handleModifyArticleSelection(message, sender, sendResponse);
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

    if (message.action === 'exportToObsidian') {
      void handleExportToObsidian(message, sender, sendResponse);
      return true;
    }

    return false;
  }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  activeWorkflows.get(tabId)?.controller.abort();
  activeWorkflows.delete(tabId);
  void clearArticleStateForTab(tabId);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') {
    return;
  }

  void getBuiltInAuthState().then((account) => {
    if (!account) {
      void chrome.tabs.create({
        url: chrome.runtime.getURL('src/login/index.html'),
      });
    }
  });
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
    const account = await getBuiltInAuthState();
    if (!account) {
      sendResponse({ success: false, error: t('backgroundBuiltInAuthRequired') });
      return;
    }

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

async function requestBuiltInServer(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${getDefaultServerBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function getAuthErrorMessage(response: Response, t: TranslateFn, fallback: string): Promise<string> {
  let payload: { error?: string } = {};
  try {
    payload = await response.json();
  } catch {
    return fallback;
  }

  switch (payload.error) {
    case 'INVALID_EMAIL':
      return t('settingsAuthInvalidEmail');
    case 'INVALID_CODE':
      return t('settingsAuthVerifyCodeFailed');
    case 'TOO_MANY_ATTEMPTS':
      return t('settingsAuthTooManyAttempts');
    case 'CODE_COOLDOWN':
      return t('settingsAuthCodeCooldown');
    case 'CODE_RATE_LIMITED':
      return t('settingsAuthRateLimited');
    case 'EMAIL_DELIVERY_FAILED':
      return t('settingsAuthRequestCodeFailed');
    default:
      return fallback;
  }
}

async function handleRequestLoginCode(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const email = message.email?.trim() ?? '';

  try {
    if (!email) {
      sendResponse({ success: false, error: t('settingsAuthEmailRequired') });
      return;
    }

    if (!AUTH_EMAIL_PATTERN.test(email)) {
      sendResponse({ success: false, error: t('settingsAuthInvalidEmail') });
      return;
    }

    const response = await requestBuiltInServer('/api/auth/request-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      sendResponse({
        success: false,
        error: await getAuthErrorMessage(response, t, t('settingsAuthRequestCodeFailed')),
      });
      return;
    }

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({
      success: false,
      error: t('settingsBuiltInServerUnavailable', {
        error: error instanceof Error ? error.message : t('commonUnknownError'),
      }),
    });
  }
}

async function handleVerifyLoginCode(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const email = message.email?.trim() ?? '';
  const code = message.code?.trim() ?? '';

  try {
    if (!email || !code) {
      sendResponse({ success: false, error: t('settingsAuthCodeRequired') });
      return;
    }

    if (!AUTH_EMAIL_PATTERN.test(email)) {
      sendResponse({ success: false, error: t('settingsAuthInvalidEmail') });
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      sendResponse({ success: false, error: t('settingsAuthInvalidCode') });
      return;
    }

    const response = await requestBuiltInServer('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      sendResponse({
        success: false,
        error: await getAuthErrorMessage(response, t, t('settingsAuthVerifyCodeFailed')),
      });
      return;
    }

    const account = await response.json();
    await setBuiltInAuthState(account);
    sendResponse({ success: true, account });
  } catch (error) {
    sendResponse({
      success: false,
      error: t('settingsBuiltInServerUnavailable', {
        error: error instanceof Error ? error.message : t('commonUnknownError'),
      }),
    });
  }
}

async function handleGetBuiltInAccount(
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const account = await getBuiltInAuthState();

  if (!account) {
    sendResponse({ success: true, account: null });
    return;
  }

  try {
    const response = await requestBuiltInServer('/api/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${account.token}`,
      },
    });

    if (response.status === 401) {
      await clearBuiltInAuthState();
      sendResponse({ success: true, account: null });
      return;
    }

    if (!response.ok) {
      sendResponse({ success: true, account });
      return;
    }

    const payload = await response.json();
    const refreshedAccount = {
      token: account.token,
      user: payload.user,
      quota: payload.quota,
    };
    await setBuiltInAuthState(refreshedAccount);
    sendResponse({ success: true, account: refreshedAccount });
  } catch (error) {
    sendResponse({
      success: false,
      error: t('settingsBuiltInServerUnavailable', {
        error: error instanceof Error ? error.message : t('commonUnknownError'),
      }),
      account,
    });
  }
}

async function handleLogoutBuiltInAccount(
  sendResponse: (response: ChromeResponse) => void
) {
  await clearBuiltInAuthState();
  sendResponse({ success: true, account: null });
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

async function handleCancelArticleGeneration(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  try {
    const canceled = cancelActiveWorkflow(tabId);
    const state = await getArticleStateForTab(tabId);

    if (!canceled) {
      sendResponse({
        success: false,
        error: t('backgroundNoActiveGeneration'),
        state,
      });
      return;
    }

    sendResponse({
      success: true,
      state,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : t('commonUnknownError'),
      state: await getArticleStateForTab(tabId),
    });
  }
}

async function handleModifyArticleSelection(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  const { t } = await getCurrentLocaleContext();
  const tabId = getTabIdFromSender(sender, sendResponse, t);
  if (tabId === null) {
    return;
  }

  const selectedMarkdown = message.selectedMarkdown?.trim() ?? '';
  const selectedText = message.selectedText?.trim() ?? '';

  if (!selectedMarkdown && !selectedText) {
    sendResponse({ error: t('backgroundNoSelectedText') });
    return;
  }

  if (!isLocalEditOperation(message.operation)) {
    sendResponse({ error: t('backgroundFailedToModifySelection') });
    return;
  }

  if (message.operation === 'delete') {
    sendResponse({ success: true, replacement: '' });
    return;
  }

  try {
    const account = await getBuiltInAuthState();
    if (!account) {
      sendResponse({ error: t('backgroundBuiltInAuthRequired') });
      return;
    }

    const config = await getApiConfig();

    if (!config) {
      sendResponse({ error: t('backgroundApiConfigMissing') });
      return;
    }

    const currentState = await getArticleStateForTab(tabId);
    const articleMarkdown = message.articleContent || currentState.article;
    const replacement = await rewriteArticleSelection(
      articleMarkdown,
      selectedMarkdown || selectedText,
      selectedText,
      message.operation,
      message.instruction ?? '',
      currentState.messages,
      config,
      t
    );

    sendResponse({
      success: true,
      replacement,
      state: currentState,
    });
  } catch (error) {
    sendResponse({
      error: error instanceof Error ? error.message : t('backgroundFailedToModifySelection'),
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

async function handleExportToObsidian(
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
    const config = await getObsidianConfig();

    if (!config || !config.vault.trim()) {
      sendResponse({ error: t('backgroundObsidianNotConfigured') });
      return;
    }

    if (!message.articleTitle || !message.articleContent) {
      sendResponse({ error: t('backgroundNoArticleContentToExport') });
      return;
    }

    const { url, filePath } = buildObsidianNewNoteUrl(
      config,
      message.articleTitle,
      message.articleContent,
      Boolean(message.useClipboard)
    );

    await chrome.tabs.update(tabId, { url });
    sendResponse({ success: true, article: filePath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : t('commonUnknownError');

    sendResponse({
      error: t('backgroundFailedToOpenObsidian', { error: errorMessage }),
    });
  }
}
