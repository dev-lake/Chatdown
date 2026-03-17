import type { Message, ChatParser } from '../../types';

export class ChatGPTParser implements ChatParser {
  parse(): Message[] {
    const messages: Message[] = [];
    const messageElements = document.querySelectorAll('[data-message-author-role]');

    messageElements.forEach((element) => {
      const role = element.getAttribute('data-message-author-role');
      const contentElement = element.querySelector('.markdown, [class*="message"]');

      if (role && contentElement) {
        const content = contentElement.textContent?.trim() || '';
        if (content && (role === 'user' || role === 'assistant')) {
          messages.push({
            role: role as 'user' | 'assistant',
            content,
          });
        }
      }
    });

    return messages;
  }
}
