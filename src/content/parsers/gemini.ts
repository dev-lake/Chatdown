import type { Message, ChatParser } from '../../types';

export class GeminiParser implements ChatParser {
  parse(): Message[] {
    const messages: Message[] = [];
    const messageElements = document.querySelectorAll('[data-role], .message-content');

    messageElements.forEach((element) => {
      const role = element.getAttribute('data-role');
      const content = element.textContent?.trim() || '';

      if (content) {
        if (role === 'user' || role === 'model') {
          messages.push({
            role: role === 'model' ? 'assistant' : 'user',
            content,
          });
        } else if (element.classList.contains('user-message')) {
          messages.push({ role: 'user', content });
        } else if (element.classList.contains('model-message')) {
          messages.push({ role: 'assistant', content });
        }
      }
    });

    return messages;
  }
}
