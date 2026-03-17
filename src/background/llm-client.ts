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
  config: ApiConfig
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
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
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
