import type { ChromeMessage, ChromeResponse } from '../types';
import { getApiConfig } from './storage';
import { generateArticle, testConnection } from './llm-client';

chrome.runtime.onMessage.addListener(
  (message: ChromeMessage, sender, sendResponse: (response: ChromeResponse) => void) => {
    if (message.action === 'openSidePanel') {
      handleOpenSidePanel(message, sender, sendResponse);
      return true;
    }

    if (message.action === 'generateArticle') {
      handleGenerateArticle(message, sendResponse);
      return true;
    }

    if (message.action === 'testConnection') {
      handleTestConnection(message, sendResponse);
      return true;
    }

    return false;
  }
);

async function handleOpenSidePanel(
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: 'No tab ID found' });
      return;
    }

    // Open the side panel first
    await chrome.sidePanel.open({ tabId });

    // Small delay to ensure side panel is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send loading state to side panel
    await chrome.runtime.sendMessage({ action: 'generatingArticle' });

    console.log('Starting article generation...');

    // Generate the article
    const config = await getApiConfig();

    if (!config) {
      const errorArticle = '# Error\n\nAPI configuration not found. Please configure in settings.';
      await chrome.runtime.sendMessage({
        action: 'displayArticle',
        article: errorArticle
      });
      sendResponse({ error: 'API configuration not found. Please configure in settings.' });
      return;
    }

    if (!message.messages || message.messages.length === 0) {
      const errorArticle = '# Error\n\nNo conversation found.';
      await chrome.runtime.sendMessage({
        action: 'displayArticle',
        article: errorArticle
      });
      sendResponse({ error: 'No conversation found.' });
      return;
    }

    const article = await generateArticle(message.messages, config);

    console.log('Article generated, sending to side panel...');

    // Send the article to the side panel
    await chrome.runtime.sendMessage({ action: 'displayArticle', article });

    sendResponse({ article });
  } catch (error) {
    console.error('Error in handleOpenSidePanel:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorArticle = `# Error\n\n${errorMessage}`;

    try {
      await chrome.runtime.sendMessage({
        action: 'displayArticle',
        article: errorArticle
      });
    } catch (msgError) {
      console.error('Failed to send error message to side panel:', msgError);
    }

    sendResponse({ error: errorMessage });
  }
}

async function handleGenerateArticle(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  try {
    const config = await getApiConfig();

    if (!config) {
      sendResponse({ error: 'API configuration not found. Please configure in settings.' });
      return;
    }

    if (!message.messages || message.messages.length === 0) {
      sendResponse({ error: 'No conversation found.' });
      return;
    }

    const article = await generateArticle(message.messages, config);
    sendResponse({ article });
  } catch (error) {
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
}

async function handleTestConnection(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
) {
  try {
    if (!message.config) {
      sendResponse({ error: 'No configuration provided' });
      return;
    }

    const success = await testConnection(message.config);
    sendResponse({ success });
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
