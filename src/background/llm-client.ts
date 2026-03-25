import type { ApiConfig, ConversationRound, Locale, Message } from '../types';
import type { TranslateFn } from '../i18n/core';

const ARTICLE_SYSTEM_PROMPT = `You are a technical writer.
Convert the following AI conversation into a well-structured tutorial article.

Requirements:
1. Do not include the original chat dialogue.
2. Rewrite the content into a coherent article.
3. Use clear section headings.
4. Output in Markdown format.
5. Write a tutorial or guide.
6. Write in the same language as the original conversation.`;

const ROUND_SUMMARY_SYSTEM_PROMPT = `You are an editor preparing a selective summary workflow.
Summarize each conversation round in exactly one concise sentence.

Rules:
- Return valid JSON only.
- Never wrap JSON in markdown fences.
- Return this exact shape:
  { "summaries": ["sentence 1", "sentence 2"] }
- Keep each summary specific enough for a user to decide whether to include that round in the final article.
- Do not mention "user" or "assistant" unless necessary for clarity.
- Preserve the order of rounds exactly.
- Write each summary in the same language as the original conversation round.`;

const SIMPLIFIED_ONLY_CHARS = '这来时说会后发开关对们国种点样于为从还过边让经实';
const TRADITIONAL_ONLY_CHARS = '這來時說會後發開關對們國種點樣於為從還過邊讓經實';

interface RoundLanguageHint {
  roundIndex: number;
  locale: Locale;
}

function countMatches(value: string, pattern: RegExp): number {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

function countDistinctChars(text: string, charset: string): number {
  let total = 0;

  for (const char of text) {
    if (charset.includes(char)) {
      total += 1;
    }
  }

  return total;
}

function detectTextLocale(text: string): Locale | null {
  const hiraganaKatakanaCount = countMatches(text, /[\u3040-\u30ff]/g);
  if (hiraganaKatakanaCount > 0) {
    return 'ja';
  }

  const cjkCount = countMatches(text, /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  const latinCount = countMatches(text, /[A-Za-z]/g);

  if (cjkCount === 0 && latinCount > 0) {
    return 'en';
  }

  if (cjkCount > 0) {
    const simplifiedCount = countDistinctChars(text, SIMPLIFIED_ONLY_CHARS);
    const traditionalCount = countDistinctChars(text, TRADITIONAL_ONLY_CHARS);

    if (traditionalCount > simplifiedCount) {
      return 'zh-TW';
    }

    return 'zh-CN';
  }

  if (latinCount > 0) {
    return 'en';
  }

  return null;
}

function getDominantLocale(messages: Message[]): Locale {
  const counts: Record<Locale, number> = {
    en: 0,
    'zh-CN': 0,
    'zh-TW': 0,
    ja: 0,
  };

  for (const message of messages) {
    const locale = detectTextLocale(message.content);
    if (locale) {
      counts[locale] += Math.max(1, message.content.trim().length);
    }
  }

  const sorted = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  const [topLocale, topScore] = sorted[0] as [Locale, number];

  if (topScore > 0) {
    return topLocale;
  }

  return 'en';
}

function getRoundLanguageHints(
  rounds: ConversationRound[],
  messages: Message[],
  fallbackLocale: Locale
): RoundLanguageHint[] {
  return rounds.map((round) => {
    const roundText = round.messageIndexes
      .map((messageIndex) => messages[messageIndex]?.content || '')
      .join('\n');

    return {
      roundIndex: round.index,
      locale: detectTextLocale(roundText) ?? fallbackLocale,
    };
  });
}

function getLocaleLabel(locale: Locale): string {
  switch (locale) {
    case 'zh-CN':
      return 'Simplified Chinese';
    case 'zh-TW':
      return 'Traditional Chinese';
    case 'ja':
      return 'Japanese';
    case 'en':
    default:
      return 'English';
  }
}

function buildArticleUserPrompt(messages: Message[], targetLocale: Locale): string {
  return `Target output language: ${getLocaleLabel(targetLocale)}.
Use exactly this language and script for the entire article.
Do not default to English unless the target output language is English.

Conversation:
${formatConversation(messages)}`;
}

function buildSummaryUserPrompt(
  rounds: ConversationRound[],
  messages: Message[],
  hints: RoundLanguageHint[]
): string {
  const languageRequirements = hints
    .map((hint) => `- Round ${hint.roundIndex}: ${getLocaleLabel(hint.locale)}`)
    .join('\n');

  const formattedRounds = rounds
    .map((round) => {
      const hint = hints.find((item) => item.roundIndex === round.index);
      const roundMessages = round.messageIndexes
        .map((messageIndex) => messages[messageIndex])
        .filter((message): message is Message => Boolean(message))
        .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
        .join('\n\n');

      return `Round ${round.index}
Expected summary language: ${getLocaleLabel(hint?.locale ?? 'en')}
${roundMessages}`;
    })
    .join('\n\n---\n\n');

  return `Language requirements:
${languageRequirements}

Each summary must be written in the required language for its round.
Do not translate non-English rounds into English.
If a round is Chinese, preserve the correct script variant (Simplified or Traditional).

Conversation rounds:
${formattedRounds}`;
}

function getLanguageMismatchIndexes(
  summaries: string[],
  hints: RoundLanguageHint[]
): number[] {
  return summaries.flatMap((summary, index) => {
    const expectedLocale = hints[index]?.locale ?? 'en';
    const detectedLocale = detectTextLocale(summary);

    if (!detectedLocale || expectedLocale === 'en') {
      return [];
    }

    return detectedLocale === expectedLocale ? [] : [index];
  });
}

function buildSummaryRetryUserPrompt(
  rounds: ConversationRound[],
  messages: Message[],
  hints: RoundLanguageHint[],
  previousSummaries: string[],
  mismatchIndexes: number[]
): string {
  const mismatchLines = mismatchIndexes
    .map((index) => {
      const hint = hints[index];
      return `- Summary ${index + 1} must be ${getLocaleLabel(hint?.locale ?? 'en')}`;
    })
    .join('\n');

  return `${buildSummaryUserPrompt(rounds, messages, hints)}

Your previous answer used the wrong language for some summaries.
Fix these items:
${mismatchLines}

Previous summaries:
${JSON.stringify({ summaries: previousSummaries }, null, 2)}

Return corrected JSON only.`;
}

function formatConversation(messages: Message[]): string {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');
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

async function requestTextCompletion(
  systemPrompt: string,
  userPrompt: string,
  config: ApiConfig
): Promise<string> {
  const response = await requestChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    stream: false,
    temperature: 0.4,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
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

  throw new Error('MODEL_RETURNED_EMPTY');
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

  throw new Error('RESPONSE_INVALID_JSON');
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
    throw new Error('ROUND_SUMMARIES_MALFORMED');
  }

  if (!Array.isArray(summaries)) {
    throw new Error('ROUND_SUMMARIES_MISSING_ARRAY');
  }

  const normalized = summaries
    .map((summary) => typeof summary === 'string' ? summary.trim() : '')
    .filter((summary) => summary.length > 0);

  if (normalized.length !== expectedLength) {
    throw new Error('ROUND_SUMMARIES_COUNT_MISMATCH');
  }

  return normalized;
}

function toLocalizedErrorMessage(error: unknown, t: TranslateFn): string {
  if (!(error instanceof Error)) {
    return t('commonUnknownError');
  }

  switch (error.message) {
    case 'MODEL_RETURNED_EMPTY':
      return t('llmModelReturnedEmpty');
    case 'RESPONSE_INVALID_JSON':
      return t('llmResponseInvalidJson');
    case 'ROUND_SUMMARIES_MALFORMED':
      return t('llmRoundSummariesMalformed');
    case 'ROUND_SUMMARIES_MISSING_ARRAY':
      return t('llmRoundSummariesMissingArray');
    case 'ROUND_SUMMARIES_COUNT_MISMATCH':
      return t('llmRoundSummariesCountMismatch');
    case 'RESPONSE_BODY_UNREADABLE':
      return t('llmResponseBodyUnreadable');
    default:
      return t('llmApiRequestFailed', { error: error.message });
  }
}

export async function summarizeConversationRounds(
  rounds: ConversationRound[],
  messages: Message[],
  config: ApiConfig,
  t: TranslateFn
): Promise<string[]> {
  try {
    const fallbackLocale = getDominantLocale(messages);
    const hints = getRoundLanguageHints(rounds, messages, fallbackLocale);
    const prompt = buildSummaryUserPrompt(rounds, messages, hints);

    const raw = await requestTextCompletion(ROUND_SUMMARY_SYSTEM_PROMPT, prompt, config);
    const parsed = extractJsonObject(raw);
    const summaries = sanitizeSummaries(parsed, rounds.length);
    const mismatchIndexes = getLanguageMismatchIndexes(summaries, hints);

    if (mismatchIndexes.length === 0) {
      return summaries;
    }

    const retryPrompt = buildSummaryRetryUserPrompt(
      rounds,
      messages,
      hints,
      summaries,
      mismatchIndexes
    );
    const retryRaw = await requestTextCompletion(ROUND_SUMMARY_SYSTEM_PROMPT, retryPrompt, config);
    const retryParsed = extractJsonObject(retryRaw);
    return sanitizeSummaries(retryParsed, rounds.length);
  } catch (error) {
    throw new Error(toLocalizedErrorMessage(error, t));
  }
}

export async function generateArticle(
  messages: Message[],
  config: ApiConfig,
  t: TranslateFn,
  onProgress?: (chunk: string) => void | Promise<void>
): Promise<string> {
  const targetLocale = getDominantLocale(messages);
  const prompt = buildArticleUserPrompt(messages, targetLocale);

  const response = await requestChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: 'system',
        content: ARTICLE_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    stream: true,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(t('llmApiRequestFailed', { error }));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(t('llmResponseBodyUnreadable'));
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

  if (!fullContent.trim()) {
    throw new Error(t('llmModelReturnedEmpty'));
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
