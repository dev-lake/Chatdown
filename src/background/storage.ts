import type { ApiConfig } from '../types';

const STORAGE_KEYS = {
  API_BASE_URL: 'apiBaseUrl',
  API_KEY: 'apiKey',
  MODEL_NAME: 'modelName',
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
