import type { ApiConfig, ConversationRound, Message } from '../types';

const ARTICLE_SYSTEM_PROMPT = `You are a technical writer.
Convert the following AI conversation into a well-structured tutorial article.

Requirements:
1. Do not include the original chat dialogue.
2. Rewrite the content into a coherent article.
3. Use clear section headings.
4. Output in Markdown format.
5. Write a tutorial or guide.`;

const ROUND_SUMMARY_SYSTEM_PROMPT = `You are an editor preparing a selective summary workflow.
Summarize each conversation round in exactly one concise sentence.

Rules:
- Return valid JSON only.
- Never wrap JSON in markdown fences.
- Return this exact shape:
  { "summaries": ["sentence 1", "sentence 2"] }
- Keep each summary specific enough for a user to decide whether to include that round in the final article.
- Do not mention "user" or "assistant" unless necessary for clarity.
- Preserve the order of rounds exactly.`;

function formatConversation(messages: Message[]): string {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');
}

function formatRounds(rounds: ConversationRound[], messages: Message[]): string {
  return rounds
    .map((round) => {
      const roundMessages = round.messageIndexes
        .map((messageIndex) => messages[messageIndex])
        .filter((message): message is Message => Boolean(message))
        .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
        .join('\n\n');

      return `Round ${round.index}\n${roundMessages}`;
    })
    .join('\n\n---\n\n');
}

async function requestChatCompletion(
  config: ApiConfig,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${config.apiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

async function requestTextCompletion(prompt: string, config: ApiConfig): Promise<string> {
  const response = await requestChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    stream: false,
    temperature: 0.4,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${error}`);
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => item.text || '').join('');
  }

  throw new Error('Model returned an empty response.');
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
  }

  throw new Error('Response is not valid JSON.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeSummaries(value: unknown, expectedLength: number): string[] {
  let summaries: unknown;

  if (Array.isArray(value)) {
    summaries = value;
  } else if (isRecord(value)) {
    summaries = value.summaries;
  } else {
    throw new Error('Round summaries response is malformed.');
  }

  if (!Array.isArray(summaries)) {
    throw new Error('Round summaries response is missing the summaries array.');
  }

  const normalized = summaries
    .map((summary) => typeof summary === 'string' ? summary.trim() : '')
    .filter((summary) => summary.length > 0);

  if (normalized.length !== expectedLength) {
    throw new Error('Round summaries response count does not match the round count.');
  }

  return normalized;
}

export async function summarizeConversationRounds(
  rounds: ConversationRound[],
  messages: Message[],
  config: ApiConfig
): Promise<string[]> {
  const prompt = `${ROUND_SUMMARY_SYSTEM_PROMPT}

Conversation rounds:
${formatRounds(rounds, messages)}`;

  const raw = await requestTextCompletion(prompt, config);
  const parsed = extractJsonObject(raw);

  return sanitizeSummaries(parsed, rounds.length);
}

export async function generateArticle(
  messages: Message[],
  config: ApiConfig,
  onProgress?: (chunk: string) => void | Promise<void>
): Promise<string> {
  const prompt = `${ARTICLE_SYSTEM_PROMPT}\n\nConversation:\n${formatConversation(messages)}`;

  const response = await requestChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    stream: true,
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
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const data = line.slice(6);
        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
              };
            }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;

          if (content) {
            fullContent += content;
            if (onProgress) {
              await onProgress(content);
            }
          }
        } catch {
          // Ignore malformed streaming chunks from compatible providers.
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
    const response = await requestChatCompletion(config, {
      model: config.modelName,
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
      max_tokens: 5,
    });

    return response.ok;
  } catch {
    return false;
  }
}
