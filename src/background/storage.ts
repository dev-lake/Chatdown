import type { ApiConfig, NotionConfig } from '../types';

const STORAGE_KEYS = {
  API_BASE_URL: 'apiBaseUrl',
  API_KEY: 'apiKey',
  MODEL_NAME: 'modelName',
  NOTION_TOKEN: 'notionIntegrationToken',
  NOTION_DATABASE_ID: 'notionDatabaseId',
};

export async function getApiConfig(): Promise<ApiConfig | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.API_BASE_URL,
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.MODEL_NAME,
  ]);

  if (!result.apiBaseUrl || !result.apiKey || !result.modelName) {
    return null;
  }

  return {
    apiBaseUrl: result.apiBaseUrl,
    apiKey: result.apiKey,
    modelName: result.modelName,
  };
}

export async function setApiConfig(config: ApiConfig): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.API_BASE_URL]: config.apiBaseUrl,
    [STORAGE_KEYS.API_KEY]: config.apiKey,
    [STORAGE_KEYS.MODEL_NAME]: config.modelName,
  });
}

export async function getNotionConfig(): Promise<NotionConfig | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.NOTION_TOKEN,
    STORAGE_KEYS.NOTION_DATABASE_ID,
  ]);

  if (!result.notionIntegrationToken || !result.notionDatabaseId) {
    return null;
  }

  return {
    integrationToken: result.notionIntegrationToken,
    databaseId: result.notionDatabaseId,
  };
}

export async function setNotionConfig(config: NotionConfig): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.NOTION_TOKEN]: config.integrationToken,
    [STORAGE_KEYS.NOTION_DATABASE_ID]: config.databaseId,
  });
}
