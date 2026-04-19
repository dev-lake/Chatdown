import type { ChatParser, Message } from '../../types';

const MIN_ASSISTANT_LENGTH = 80;

const TURN_CONTAINER_SELECTOR = '.CKgc1d[data-scope-id="turn"], [data-scope-id="turn"].CKgc1d, [data-scope-id="turn"]';

const TURN_USER_SELECTOR = [
  '.VndcI[role="heading"]',
  '[role="heading"].VndcI',
  '[aria-level="2"][role="heading"]',
].join(', ');

const TURN_ASSISTANT_SELECTOR = [
  '[data-subtree="aimc"] [data-container-id="main-col"]',
  '[data-subtree="aimc"] [data-xid="VpUvz"]',
  '[data-subtree="aimc"] [jsname="KFl8ub"]',
  '[data-subtree="aimc"]',
].join(', ');

const USER_MESSAGE_SELECTORS = [
  '[data-scope-id="turn"] .VndcI[role="heading"]',
  '[data-scope-id="turn"] [aria-level="2"][role="heading"]',
  '[data-dq]',
  '[data-query]',
  '[data-testid*="user" i]',
  '[data-test-id*="user" i]',
  '[data-user-query]',
  '[data-query-text]',
  '[data-attrid*="user" i]',
  '[data-attrid*="query" i]',
  '[aria-label*="user query" i]',
  '[aria-label*="search query" i]',
  '[aria-label*="question" i]',
];

const USER_QUERY_ATTRIBUTE_NAMES = [
  'data-user-query',
  'data-query-text',
  'data-query',
  'data-dq',
];

const ASSISTANT_MESSAGE_SELECTORS = [
  '[data-testid*="assistant" i]',
  '[data-testid*="response" i]',
  '[data-testid*="answer" i]',
  '[data-test-id*="assistant" i]',
  '[data-test-id*="response" i]',
  '[data-test-id*="answer" i]',
  '[data-attrid*="sge" i]',
  '[data-attrid*="ai" i]',
  '[aria-label*="ai mode" i]',
  '[aria-label*="ai answer" i]',
  '[aria-label*="ai response" i]',
  '[aria-label*="overview" i]',
  'article',
  '[role="article"]',
];

const SEARCH_INPUT_SELECTORS = [
  'textarea[name="q"]',
  'input[name="q"]',
  'textarea[aria-label*="search" i]',
  'input[aria-label*="search" i]',
];

const MAIN_ROOT_SELECTORS = [
  '[role="main"]',
  'main',
  '#main',
  '#search',
  '#rso',
];

const ASSISTANT_BLOCK_SELECTORS = [
  'article',
  '[role="article"]',
  'section',
  '[data-attrid]',
  '[aria-label*="ai" i]',
  '[aria-label*="overview" i]',
  'div',
];

const REMOVABLE_SELECTORS = [
  '#chatdown-root',
  '#chatdown-overlay-root',
  '#chatdown-button-menu-root',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'img',
  'g-img',
  'picture',
  'video',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'form',
  'header',
  'footer',
  'nav',
  '[hidden]',
  '[role="navigation"]',
  '[role="search"]',
  '[role="dialog"]',
  '[role="alert"]',
  '[aria-hidden="true"]',
  '[aria-label*="share" i]',
  '[aria-label*="feedback" i]',
  '[aria-label*="settings" i]',
  '[aria-label*="google apps" i]',
  '[style*="display:none"]',
  '[style*="display: none"]',
  '[style*="visibility:hidden"]',
  '[style*="visibility: hidden"]',
  '[data-crb-el]',
  '[data-type="hovc"]',
  '[data-xid="aim-aside-initial-corroboration-container"]',
  '[data-container-id="rhs-col"]',
  '[data-skip-highlighting]',
  '.DBd2Wb',
  '.Dr5uic',
  '.Fsg96',
  '.FYF80',
  '.HvurC',
  '.MFrAxb',
  '.OUQe0e',
  '.SGF5Lb',
  '.UrecDd',
  '.W94uae',
  '.YHsVn',
  '.alk4p',
  '.bKxaof',
  '.dcCF7d',
  '.eGAasd',
  '.jKhXsc',
  '.qacuz',
  '.rBl3me',
  '.txxDge',
  '.uJ19be',
];

const REMOVABLE_SELECTOR = REMOVABLE_SELECTORS.join(', ');

const BLOCK_TEXT_SEPARATOR_SELECTOR = [
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
].join(', ');

const UI_ONLY_LINES = new Set([
  'ai mode',
  'all',
  'ask a follow up',
  'ask a follow-up',
  'ask anything',
  'books',
  'close',
  'feedback',
  'finance',
  'flights',
  'google',
  'google apps',
  'google search',
  'images',
  'maps',
  'more',
  'news',
  'search',
  'search labs',
  'search tools',
  'settings',
  'share',
  'shopping',
  'show more',
  'sign in',
  'sources',
  'tools',
  'videos',
]);

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getComparableText(text: string): string {
  return normalizeText(text).toLowerCase().replace(/\s+/g, ' ');
}

function isUiOnlyText(text: string): boolean {
  const comparableText = getComparableText(text);

  return (
    UI_ONLY_LINES.has(comparableText)
    || comparableText.startsWith('ask anything')
    || comparableText.startsWith('ask google')
    || comparableText.startsWith('people also ask')
    || comparableText.startsWith('related searches')
    || comparableText.startsWith('search results')
  );
}

function removeNoisyElements(container: HTMLElement) {
  container.querySelectorAll(REMOVABLE_SELECTOR).forEach((node) => node.remove());
}

function isHiddenElement(element: HTMLElement): boolean {
  if (element.matches(REMOVABLE_SELECTOR)) {
    return true;
  }

  const style = window.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

function appendVisibleText(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent || '');
    return;
  }

  if (!(node instanceof HTMLElement)) {
    node.childNodes.forEach((child) => appendVisibleText(child, parts));
    return;
  }

  if (isHiddenElement(node)) {
    return;
  }

  if (node instanceof HTMLBRElement) {
    parts.push('\n');
    return;
  }

  node.childNodes.forEach((child) => appendVisibleText(child, parts));

  if (node.matches(BLOCK_TEXT_SEPARATOR_SELECTOR)) {
    parts.push('\n');
  }
}

function extractVisibleText(element: Element): string {
  const parts: string[] = [];
  appendVisibleText(element, parts);

  return normalizeText(parts.join('').replace(/[ \t]*\n[ \t]*/g, '\n'));
}

function extractText(element: Element): string {
  if (document.documentElement.contains(element)) {
    const visibleText = extractVisibleText(element);
    if (visibleText) {
      return visibleText;
    }
  }

  if (!(element instanceof HTMLElement)) {
    return normalizeText(element.textContent || '');
  }

  const clone = element.cloneNode(true);
  if (clone instanceof HTMLElement) {
    removeNoisyElements(clone);
    return normalizeText(clone.innerText || clone.textContent || '');
  }

  return normalizeText(element.innerText || element.textContent || '');
}

function getInputValue(element: Element): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return normalizeText(element.value || element.getAttribute('value') || '');
  }

  return extractText(element);
}

function getAttributeText(element: Element, attributeNames: string[]): string {
  for (const attributeName of attributeNames) {
    const value = normalizeText(element.getAttribute(attributeName) || '');
    if (value) {
      return value;
    }
  }

  return '';
}

function extractUserText(element: Element): string {
  const attributeText = getAttributeText(element, USER_QUERY_ATTRIBUTE_NAMES);
  if (attributeText) {
    return attributeText;
  }

  return extractText(element);
}

function uniqueTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const text of texts) {
    const normalized = normalizeText(text);
    const comparable = getComparableText(normalized);
    if (!normalized || seen.has(comparable) || isUiOnlyText(normalized)) {
      continue;
    }

    seen.add(comparable);
    unique.push(normalized);
  }

  return unique;
}

function getDocumentOrder(a: Element, b: Element): number {
  if (a === b) {
    return 0;
  }

  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function getRoot(): HTMLElement {
  for (const selector of MAIN_ROOT_SELECTORS) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement && isVisible(element)) {
      return element;
    }
  }

  return document.body;
}

function getQueryFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeText(params.get('q') || '');
  } catch {
    return '';
  }
}

function getQueryFromTitle(): string {
  const title = normalizeText(document.title);
  const match = title.match(/^(.*?)\s+-\s+Google(?: Search)?$/i);
  return normalizeText(match?.[1] || '');
}

function extractUserQueries(): string[] {
  const queries: string[] = [getQueryFromUrl()];

  for (const selector of SEARCH_INPUT_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => {
      const value = getInputValue(element);
      if (value) {
        queries.push(value);
      }
    });
  }

  for (const selector of USER_MESSAGE_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => {
      if (isVisible(element)) {
        queries.push(extractUserText(element));
      }
    });
  }

  document.querySelectorAll('h1, h2, [role="heading"]').forEach((element) => {
    if (!isVisible(element)) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const text = extractText(element);
    if (rect.top >= 0 && rect.top < 480 && text.length >= 3 && text.length <= 500) {
      queries.push(text);
    }
  });

  queries.push(getQueryFromTitle());

  return uniqueTexts(queries);
}

function cleanAssistantText(text: string, userQueries: string[]): string {
  const queryTexts = new Set(userQueries.map(getComparableText));
  const lines = normalizeText(text)
    .split('\n')
    .map((line) => normalizeText(line))
    .filter((line) => {
      if (!line || isUiOnlyText(line)) {
        return false;
      }

      return !queryTexts.has(getComparableText(line));
    });

  return normalizeText(lines.join('\n'));
}

function isKnownQueryLine(line: string, userQueries: string[]): boolean {
  const comparableLine = getComparableText(line);
  return userQueries.some((query) => getComparableText(query) === comparableLine);
}

function hasQuestionSignal(line: string): boolean {
  return (
    /[?？]$/.test(line)
    || /^(how|what|why|when|where|which|who|can|could|should|would|is|are|do|does|did|explain|compare|show|list|tell me)\b/i.test(line)
    || /^(如何|怎么|怎样|什么|为什么|为何|是否|能否|可以|可否|应该|哪|哪些|谁|何时|何处|请问|请|继续|比较|解释|展开|还有|如果)/.test(line)
  );
}

function looksLikeFollowUpLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (
    normalized.length < 4
    || normalized.length > 180
    || isUiOnlyText(normalized)
    || /^https?:\/\//i.test(normalized)
    || /^[•\-–—*]\s/.test(normalized)
    || /^\d+[\).、]\s/.test(normalized)
  ) {
    return false;
  }

  return hasQuestionSignal(normalized);
}

function splitAssistantContentIntoTurns(userQueries: string[], rawAssistantContent: string): Message[] {
  const normalizedQueries = uniqueTexts(userQueries);
  const initialUserQuery = normalizedQueries[0];
  if (!initialUserQuery) {
    return [];
  }

  const lines = normalizeText(rawAssistantContent)
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const messages: Message[] = [];
  let currentUserQuery = initialUserQuery;
  let currentAssistantLines: string[] = [];

  const pushCurrentRound = () => {
    const assistantContent = cleanAssistantText(currentAssistantLines.join('\n'), [currentUserQuery]);
    if (assistantContent.length < MIN_ASSISTANT_LENGTH) {
      return;
    }

    messages.push({
      role: 'user',
      content: currentUserQuery,
    });
    messages.push({
      role: 'assistant',
      content: assistantContent,
    });
  };

  for (const line of lines) {
    const isKnownQuery = isKnownQueryLine(line, normalizedQueries);
    const isFollowUp = currentAssistantLines.join('\n').length >= MIN_ASSISTANT_LENGTH && looksLikeFollowUpLine(line);

    if (isKnownQuery || isFollowUp) {
      const sameAsCurrentQuery = getComparableText(line) === getComparableText(currentUserQuery);
      if (sameAsCurrentQuery && currentAssistantLines.length === 0) {
        continue;
      }

      if (currentAssistantLines.join('\n').length >= MIN_ASSISTANT_LENGTH) {
        pushCurrentRound();
        currentUserQuery = line;
        currentAssistantLines = [];
        continue;
      }

      currentUserQuery = line;
      currentAssistantLines = [];
      continue;
    }

    if (!isUiOnlyText(line) && !isKnownQueryLine(line, normalizedQueries)) {
      currentAssistantLines.push(line);
    }
  }

  pushCurrentRound();

  const userMessageCount = messages.filter((message) => message.role === 'user').length;
  return userMessageCount > 1 ? normalizeMessages(messages) : [];
}

function extractTurnMessages(): Message[] {
  const messages: Message[] = [];

  document.querySelectorAll(TURN_CONTAINER_SELECTOR).forEach((turn) => {
    if (turn.closest('#chatdown-root, #chatdown-overlay-root, #chatdown-button-menu-root')) {
      return;
    }

    const userElement = turn.querySelector(TURN_USER_SELECTOR);
    const userContent = userElement ? extractUserText(userElement) : '';
    if (!userContent || isUiOnlyText(userContent)) {
      return;
    }

    const assistantElement = turn.querySelector(TURN_ASSISTANT_SELECTOR);
    const assistantContent = assistantElement
      ? cleanAssistantText(extractText(assistantElement), [userContent])
      : '';

    messages.push({
      role: 'user',
      content: userContent,
    });

    if (assistantContent.length >= MIN_ASSISTANT_LENGTH) {
      messages.push({
        role: 'assistant',
        content: assistantContent,
      });
    }
  });

  return normalizeMessages(messages);
}

function normalizeMessages(messages: Message[]): Message[] {
  const normalized: Message[] = [];

  for (const message of messages) {
    const content = normalizeText(message.content);
    if (!content || isUiOnlyText(content)) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (previous && previous.role === message.role) {
      const previousComparable = getComparableText(previous.content);
      const contentComparable = getComparableText(content);

      if (previousComparable === contentComparable || previousComparable.includes(contentComparable)) {
        continue;
      }

      if (contentComparable.includes(previousComparable)) {
        previous.content = content;
        continue;
      }
    }

    normalized.push({
      role: message.role,
      content,
    });
  }

  return normalized;
}

function extractStructuredMessages(userQueries: string[]): Message[] {
  const candidates: Array<{ element: Element; role: Message['role'] }> = [];
  const seenElements = new Set<Element>();

  for (const selector of USER_MESSAGE_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => {
      if (!seenElements.has(element) && isVisible(element)) {
        seenElements.add(element);
        candidates.push({ element, role: 'user' });
      }
    });
  }

  for (const selector of ASSISTANT_MESSAGE_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => {
      if (!seenElements.has(element) && isVisible(element)) {
        seenElements.add(element);
        candidates.push({ element, role: 'assistant' });
      }
    });
  }

  const messages = candidates
    .sort((a, b) => getDocumentOrder(a.element, b.element))
    .map(({ element, role }) => {
      const rawContent = role === 'user' ? extractUserText(element) : extractText(element);
      const content = role === 'assistant' ? cleanAssistantText(rawContent, userQueries) : rawContent;

      if (role === 'assistant' && content.length < MIN_ASSISTANT_LENGTH) {
        return null;
      }

      return { role, content };
    })
    .filter((message): message is Message => Boolean(message));

  return normalizeMessages(messages);
}

function hasLargeChildWithSameText(element: HTMLElement, text: string): boolean {
  return Array.from(element.children).some((child) => {
    if (!(child instanceof HTMLElement)) {
      return false;
    }

    const childText = cleanAssistantText(extractText(child), []);
    return childText.length >= MIN_ASSISTANT_LENGTH && childText.length >= text.length * 0.85;
  });
}

function getElementToken(element: Element): string {
  return [
    element.tagName,
    element.getAttribute('id'),
    element.getAttribute('class'),
    element.getAttribute('role'),
    element.getAttribute('aria-label'),
    element.getAttribute('data-testid'),
    element.getAttribute('data-test-id'),
    element.getAttribute('data-attrid'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreAssistantBlock(element: HTMLElement, content: string): number {
  const token = getElementToken(element);
  const linkCount = element.querySelectorAll('a').length;
  let score = content.length;

  if (token.includes('answer') || token.includes('response') || token.includes('overview')) {
    score += 1200;
  }
  if (token.includes('ai') || token.includes('sge')) {
    score += 900;
  }
  if (element.matches('article, [role="article"], section')) {
    score += 300;
  }
  if (content.includes('.') || content.includes('?') || content.includes('!')) {
    score += 80;
  }

  score -= Math.min(linkCount * 20, 500);
  return score;
}

function extractAssistantResponse(userQueries: string[]): string {
  const root = getRoot();
  const candidates = Array.from(root.querySelectorAll(ASSISTANT_BLOCK_SELECTORS.join(', ')))
    .filter((element): element is HTMLElement => (
      element instanceof HTMLElement
      && !element.closest('#chatdown-root, #chatdown-overlay-root, form, header, nav, footer')
      && isVisible(element)
    ))
    .map((element) => {
      const content = cleanAssistantText(extractText(element), userQueries);
      if (content.length < MIN_ASSISTANT_LENGTH || hasLargeChildWithSameText(element, content)) {
        return null;
      }

      return {
        element,
        content,
        score: scoreAssistantBlock(element, content),
      };
    })
    .filter((candidate): candidate is { element: HTMLElement; content: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  if (candidates[0]) {
    return candidates[0].content;
  }

  return cleanAssistantText(extractText(root), userQueries);
}

export class GoogleAiModeParser implements ChatParser {
  parse(): Message[] {
    const turnMessages = extractTurnMessages();
    if (turnMessages.some((message) => message.role === 'assistant')) {
      return turnMessages;
    }

    const userQueries = extractUserQueries();
    const structuredMessages = extractStructuredMessages(userQueries);
    const hasAssistantMessage = structuredMessages.some((message) => message.role === 'assistant');

    if (hasAssistantMessage) {
      const structuredUserMessageCount = structuredMessages.filter((message) => message.role === 'user').length;
      if (structuredUserMessageCount > 1) {
        return structuredMessages;
      }

      const rawAssistantContent = extractAssistantResponse([]);
      const splitTurnMessages = splitAssistantContentIntoTurns(userQueries, rawAssistantContent);
      if (splitTurnMessages.length > 0) {
        return splitTurnMessages;
      }

      if (structuredUserMessageCount === 1 || userQueries.length === 0) {
        return structuredMessages;
      }

      return normalizeMessages([
        {
          role: 'user',
          content: userQueries.join('\n\n'),
        },
        ...structuredMessages,
      ]);
    }

    const rawAssistantContent = extractAssistantResponse([]);
    const splitTurnMessages = splitAssistantContentIntoTurns(userQueries, rawAssistantContent);
    if (splitTurnMessages.length > 0) {
      return splitTurnMessages;
    }

    const assistantContent = cleanAssistantText(rawAssistantContent, userQueries);
    const messages: Message[] = [];

    if (userQueries.length > 0) {
      messages.push({
        role: 'user',
        content: userQueries.join('\n\n'),
      });
    }

    if (assistantContent.length >= MIN_ASSISTANT_LENGTH) {
      messages.push({
        role: 'assistant',
        content: assistantContent,
      });
    }

    return normalizeMessages(messages);
  }
}
