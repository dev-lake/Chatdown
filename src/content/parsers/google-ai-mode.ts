import type { ChatParser, Message } from '../../types';

const MIN_ASSISTANT_LENGTH = 80;

const USER_MESSAGE_SELECTORS = [
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
  '[role="navigation"]',
  '[role="search"]',
  '[aria-label*="share" i]',
  '[aria-label*="feedback" i]',
  '[aria-label*="settings" i]',
  '[aria-label*="google apps" i]',
];

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
  for (const selector of REMOVABLE_SELECTORS) {
    container.querySelectorAll(selector).forEach((node) => node.remove());
  }
}

function extractText(element: Element): string {
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
        queries.push(extractText(element));
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
      const rawContent = extractText(element);
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
    const userQueries = extractUserQueries();
    const structuredMessages = extractStructuredMessages(userQueries);
    const hasAssistantMessage = structuredMessages.some((message) => message.role === 'assistant');

    if (hasAssistantMessage) {
      if (structuredMessages.some((message) => message.role === 'user') || userQueries.length === 0) {
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

    const assistantContent = extractAssistantResponse(userQueries);
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
