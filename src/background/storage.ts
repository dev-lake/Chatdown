import type { ApiConfig, BuiltInAuthState, NotionConfig, ObsidianConfig } from '../types';

const DEFAULT_OBSIDIAN_FOLDER = 'Chatdown';
const DEFAULT_SERVER_BASE_URL = (import.meta.env.VITE_CHATDOWN_DEFAULT_SERVER_URL || 'https://localhost:5001').replace(/\/+$/, '');
const DEFAULT_BUILT_IN_MODEL = import.meta.env.VITE_CHATDOWN_DEFAULT_MODEL || 'gpt-4o-mini';

const STORAGE_KEYS = {
  API_BASE_URL: 'apiBaseUrl',
  API_KEY: 'apiKey',
  MODEL_NAME: 'modelName',
  BUILT_IN_AUTH_TOKEN: 'builtInAuthToken',
  BUILT_IN_AUTH_USER: 'builtInAuthUser',
  BUILT_IN_QUOTA: 'builtInQuota',
  NOTION_TOKEN: 'notionIntegrationToken',
  NOTION_DATABASE_ID: 'notionDatabaseId',
  OBSIDIAN_VAULT: 'obsidianVault',
  OBSIDIAN_FOLDER: 'obsidianFolder',
};

export async function getApiConfig(): Promise<ApiConfig | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.API_BASE_URL,
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.MODEL_NAME,
    STORAGE_KEYS.BUILT_IN_AUTH_TOKEN,
  ]);

  if (result.apiBaseUrl && result.apiKey && result.modelName) {
    return {
      apiMode: 'custom',
      apiBaseUrl: result.apiBaseUrl,
      apiKey: result.apiKey,
      modelName: result.modelName,
    };
  }

  if (!result.builtInAuthToken) {
    return null;
  }

  return {
    apiMode: 'builtIn',
    apiBaseUrl: DEFAULT_SERVER_BASE_URL,
    apiKey: result.builtInAuthToken,
    modelName: DEFAULT_BUILT_IN_MODEL,
  };
}

export async function setApiConfig(config: ApiConfig): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.API_BASE_URL]: config.apiBaseUrl,
    [STORAGE_KEYS.API_KEY]: config.apiKey,
    [STORAGE_KEYS.MODEL_NAME]: config.modelName,
  });
}

export function getDefaultServerBaseUrl(): string {
  return DEFAULT_SERVER_BASE_URL;
}

export function getDefaultBuiltInModel(): string {
  return DEFAULT_BUILT_IN_MODEL;
}

export async function getBuiltInAuthState(): Promise<BuiltInAuthState | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.BUILT_IN_AUTH_TOKEN,
    STORAGE_KEYS.BUILT_IN_AUTH_USER,
    STORAGE_KEYS.BUILT_IN_QUOTA,
  ]);

  if (!result.builtInAuthToken || !result.builtInAuthUser) {
    return null;
  }

  return {
    token: result.builtInAuthToken,
    user: result.builtInAuthUser,
    quota: result.builtInQuota || {
      limit: 10,
      used: 0,
      remaining: 10,
      resetAt: '',
    },
  };
}

export async function setBuiltInAuthState(state: BuiltInAuthState): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.BUILT_IN_AUTH_TOKEN]: state.token,
    [STORAGE_KEYS.BUILT_IN_AUTH_USER]: state.user,
    [STORAGE_KEYS.BUILT_IN_QUOTA]: state.quota,
  });
}

export async function setBuiltInQuota(quota: BuiltInAuthState['quota']): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.BUILT_IN_QUOTA]: quota,
  });
}

export async function clearBuiltInAuthState(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.BUILT_IN_AUTH_TOKEN,
    STORAGE_KEYS.BUILT_IN_AUTH_USER,
    STORAGE_KEYS.BUILT_IN_QUOTA,
  ]);
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

export async function getObsidianConfig(): Promise<ObsidianConfig | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.OBSIDIAN_VAULT,
    STORAGE_KEYS.OBSIDIAN_FOLDER,
  ]);

  if (typeof result.obsidianVault !== 'string' || !result.obsidianVault.trim()) {
    return null;
  }

  return {
    vault: result.obsidianVault,
    folder: typeof result.obsidianFolder === 'string' && result.obsidianFolder.trim()
      ? result.obsidianFolder
      : DEFAULT_OBSIDIAN_FOLDER,
  };
}

export async function setObsidianConfig(config: ObsidianConfig): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.OBSIDIAN_VAULT]: config.vault,
    [STORAGE_KEYS.OBSIDIAN_FOLDER]: config.folder,
  });
}
