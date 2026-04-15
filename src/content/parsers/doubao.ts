import type { ChatParser, Message } from '../../types';

const DOUBAO_MESSAGE_TEXT_SELECTOR = '[data-testid="message_text_content"]';

function extractText(element: Element): string {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  return (element.innerText || element.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMessageContent(container: Element): string {
  const clonedContainer = container.cloneNode(true);
  if (clonedContainer instanceof HTMLElement) {
    const removableSelectors = [
      '[data-testid="message_action_bar"]',
      '[data-testid="suggest_message_list"]',
      '[data-testid="search-reference-ui-v3"]',
      '[data-testid="message_action_copy"]',
      '[data-testid="message_action_regenerate"]',
      '[data-testid="audio_play_button"]',
      '[data-testid="message_action_like"]',
      '[data-testid="message_action_dislike"]',
      '[data-testid="message_action_share"]',
      '[data-testid="message_action_more"]',
    ];

    for (const selector of removableSelectors) {
      clonedContainer.querySelectorAll(selector).forEach((node) => node.remove());
    }
  }

  const normalizedContainer = clonedContainer instanceof HTMLElement ? clonedContainer : container;
  const textBlocks = Array.from(normalizedContainer.querySelectorAll(DOUBAO_MESSAGE_TEXT_SELECTOR))
    .map(extractText)
    .filter(Boolean);

  if (textBlocks.length > 0) {
    return textBlocks.join('\n\n').trim();
  }

  return extractText(container);
}

function normalizeMessages(messages: Message[]): Message[] {
  const normalized: Message[] = [];

  for (const message of messages) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (previous && previous.role === message.role && previous.content === content) {
      continue;
    }

    normalized.push({
      role: message.role,
      content,
    });
  }

  return normalized;
}

function detectRole(element: Element): 'user' | 'assistant' | null {
  if (element.closest('[data-testid="send_message"]')) {
    return 'user';
  }

  if (element.closest('[data-testid="receive_message"]')) {
    return 'assistant';
  }

  const justifyEndAncestor = element.closest('.justify-end');
  if (justifyEndAncestor) {
    return 'user';
  }

  if (element.querySelector('ol, ul, h1, h2, h3, h4, h5, h6, .flow-markdown-body')) {
    return 'assistant';
  }

  return null;
}

function logDiagnostics(messages: Message[]) {
  const counters = {
    messageContent: document.querySelectorAll('[data-testid="message_content"]').length,
    messageContentWithId: document.querySelectorAll('[data-testid="message_content"][data-message-id]').length,
    sendMessage: document.querySelectorAll('[data-testid="send_message"]').length,
    receiveMessage: document.querySelectorAll('[data-testid="receive_message"]').length,
    unionMessage: document.querySelectorAll('[data-testid="union_message"]').length,
    textContent: document.querySelectorAll(DOUBAO_MESSAGE_TEXT_SELECTOR).length,
  };

  console.log('[Chatdown][Doubao] Parser diagnostics', {
    counters,
    extractedMessages: messages.length,
    sample: messages.slice(0, 3),
  });
}

export class DoubaoParser implements ChatParser {
  parse(): Message[] {
    const messageCandidates = Array.from(document.querySelectorAll(
      '[data-testid="message_content"][data-message-id], [data-testid="message_content"], [data-message-id]'
    ));

    const directMessages = messageCandidates
      .map((messageContent) => {
        const role = detectRole(messageContent);

        if (!role) {
          return null;
        }

        const content = extractMessageContent(messageContent);
        if (!content) {
          return null;
        }

        return { role, content };
      })
      .filter((message): message is Message => Boolean(message));

    if (directMessages.length > 0) {
      const normalizedMessages = normalizeMessages(directMessages);
      logDiagnostics(normalizedMessages);
      return normalizedMessages;
    }

    const messages: Message[] = [];
    const messageGroups = Array.from(document.querySelectorAll('[data-testid="union_message"]'));
    for (const group of messageGroups) {
      const userMessage = group.querySelector('[data-testid="send_message"]');
      if (userMessage) {
        const content = extractMessageContent(userMessage);
        if (content) {
          messages.push({
            role: 'user',
            content,
          });
        }
        continue;
      }

      const assistantMessage = group.querySelector('[data-testid="receive_message"]');
      if (assistantMessage) {
        const content = extractMessageContent(assistantMessage);
        if (content) {
          messages.push({
            role: 'assistant',
            content,
          });
        }
      }
    }

    if (messages.length > 0) {
      const normalizedMessages = normalizeMessages(messages);
      logDiagnostics(normalizedMessages);
      return normalizedMessages;
    }

    const fallbackMessages = Array.from(document.querySelectorAll('[data-testid="send_message"], [data-testid="receive_message"]'))
      .map((element) => {
        const testId = element.getAttribute('data-testid');
        const role = testId === 'send_message' ? 'user' : testId === 'receive_message' ? 'assistant' : null;

        if (!role) {
          return null;
        }

        const content = extractMessageContent(element);
        if (!content) {
          return null;
        }

        return { role, content };
      })
      .filter((message): message is Message => Boolean(message));

    const normalizedMessages = normalizeMessages(fallbackMessages);
    logDiagnostics(normalizedMessages);
    return normalizedMessages;
  }
}
