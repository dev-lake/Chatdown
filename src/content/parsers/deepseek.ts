import type { Message, ChatParser } from '../../types';

function extractText(element: Element): string {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  return (element.innerText || element.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getDirectMessageRoot(item: Element): HTMLElement | null {
  if (!(item instanceof HTMLElement)) {
    return null;
  }

  const directChild = Array.from(item.children).find((child) =>
    child instanceof HTMLElement && child.classList.contains('ds-message')
  );

  if (directChild instanceof HTMLElement) {
    return directChild;
  }

  const nestedMessage = item.querySelector('.ds-message');
  return nestedMessage instanceof HTMLElement ? nestedMessage : null;
}

function getDirectMessageChildren(messageRoot: HTMLElement): HTMLElement[] {
  return Array.from(messageRoot.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
}

function extractAssistantContent(messageRoot: HTMLElement): string {
  const directMarkdownBlocks = getDirectMessageChildren(messageRoot).filter((child) =>
    child.classList.contains('ds-markdown')
  );

  if (directMarkdownBlocks.length > 0) {
    return directMarkdownBlocks
      .map(extractText)
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  const markdownBlocks = Array.from(messageRoot.querySelectorAll('.ds-markdown'))
    .filter((element) => !element.closest('.ds-think-content'))
    .map(extractText)
    .filter(Boolean);

  return markdownBlocks.join('\n\n').trim();
}

function extractUserContent(messageRoot: HTMLElement): string {
  const directChildren = getDirectMessageChildren(messageRoot);
  const directTextContent = directChildren
    .filter((child) => !child.classList.contains('ds-markdown'))
    .map(extractText)
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (directTextContent) {
    return directTextContent;
  }

  return extractText(messageRoot);
}

export class DeepSeekParser implements ChatParser {
  parse(): Message[] {
    const messages: Message[] = [];
    const items = Array.from(document.querySelectorAll('[data-virtual-list-item-key]'));

    for (const item of items) {
      const messageRoot = getDirectMessageRoot(item);
      if (!messageRoot) {
        continue;
      }

      const directChildren = getDirectMessageChildren(messageRoot);
      const hasDirectMarkdown = directChildren.some((child) => child.classList.contains('ds-markdown'));

      if (hasDirectMarkdown) {
        const assistantContent = extractAssistantContent(messageRoot);
        if (assistantContent) {
          messages.push({
            role: 'assistant',
            content: assistantContent,
          });
        }
        continue;
      }

      const userContent = extractUserContent(messageRoot);
      if (userContent) {
        messages.push({
          role: 'user',
          content: userContent,
        });
      }
    }

    if (messages.length > 0) {
      return messages;
    }

    const fallbackMessages = Array.from(document.querySelectorAll('.ds-message'))
      .map((element) => {
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const assistantContent = extractAssistantContent(element);
        if (assistantContent) {
          return {
            role: 'assistant' as const,
            content: assistantContent,
          };
        }

        const userContent = extractUserContent(element);
        if (userContent) {
          return {
            role: 'user' as const,
            content: userContent,
          };
        }

        return null;
      })
      .filter((message): message is Message => Boolean(message));

    return fallbackMessages;
  }
}
