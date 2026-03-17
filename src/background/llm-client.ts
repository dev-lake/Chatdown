import type { ApiConfig, Message } from '../types';

const SYSTEM_PROMPT = `You are a technical writer.
Convert the following AI conversation into a well-structured tutorial article.

Requirements:
1. Do not include the original chat dialogue.
2. Rewrite the content into a coherent article.
3. Use clear section headings.
4. Output in Markdown format.
5. Write a tutorial or guide.`;

export async function generateArticle(
  messages: Message[],
  config: ApiConfig,
  onProgress?: (chunk: string) => void
): Promise<string> {
  const formattedMessages = messages
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n\n');

  const prompt = `${SYSTEM_PROMPT}\n\nConversation:\n${formattedMessages}`;

  const response = await fetch(`${config.apiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              if (onProgress) {
                onProgress(content);
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

export async function testConnection(config: ApiConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 5,
      }),
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}
