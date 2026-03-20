import type { Message, ChatParser } from '../../types';

export class GeminiParser implements ChatParser {
  parse(): Message[] {
    const messages: Message[] = [];

    // Try multiple selectors for Gemini's message structure
    // Gemini uses message-content elements with data-test-id attributes
    const messageContainers = document.querySelectorAll('message-content, [data-test-id*="conversation-turn"]');

    messageContainers.forEach((container) => {
      // Check if this is a user message or model response
      const isUserMessage = container.querySelector('[data-test-id="user-query-text"], .query-content') !== null;
      const isModelMessage = container.querySelector('[data-test-id="model-response-text"], .model-response-text') !== null;

      let content = '';
      let role: 'user' | 'assistant' | null = null;

      if (isUserMessage) {
        const userTextElement = container.querySelector('[data-test-id="user-query-text"], .query-content');
        content = userTextElement?.textContent?.trim() || '';
        role = 'user';
      } else if (isModelMessage) {
        const modelTextElement = container.querySelector('[data-test-id="model-response-text"], .model-response-text, .response-content');
        content = modelTextElement?.textContent?.trim() || '';
        role = 'assistant';
      }

      if (content && role) {
        messages.push({ role, content });
      }
    });

    // Fallback: try to find any elements with message-like class names
    if (messages.length === 0) {
      const fallbackElements = document.querySelectorAll('[class*="message"], [class*="query"], [class*="response"]');

      fallbackElements.forEach((element) => {
        const classList = element.className;
        const content = element.textContent?.trim() || '';

        if (content) {
          if (classList.includes('user') || classList.includes('query')) {
            messages.push({ role: 'user', content });
          } else if (classList.includes('model') || classList.includes('assistant') || classList.includes('response')) {
            messages.push({ role: 'assistant', content });
          }
        }
      });
    }

    return messages;
  }
}
