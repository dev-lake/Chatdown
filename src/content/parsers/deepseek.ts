import type { Message, ChatParser } from '../../types';

export class DeepSeekParser implements ChatParser {
  parse(): Message[] {
    const messages: Message[] = [];
    const messageElements = document.querySelectorAll('.message, .chat-message');

    messageElements.forEach((element) => {
      const isUser = element.classList.contains('user') ||
                     element.querySelector('.user-message') !== null;
      const isAssistant = element.classList.contains('assistant') ||
                          element.querySelector('.assistant-message') !== null;

      const content = element.textContent?.trim() || '';

      if (content && (isUser || isAssistant)) {
        messages.push({
          role: isUser ? 'user' : 'assistant',
          content,
        });
      }
    });

    return messages;
  }
}
