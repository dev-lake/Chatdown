import type { ChromeMessage, ChromeResponse, Message } from '../types';
import { getApiConfig } from './storage';
import { generateArticle, testConnection } from './llm-client';

// Track if article generation is in progress
let isGenerating = false;

// Simple hash function for conversation content
function hashMessages(messages: Message[]): string {
  const content = messages.map(m => `${m.role}:${m.content}`).join('|');
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

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

    if (message.action === 'getLastArticle') {
      handleGetLastArticle(sendResponse);
      return true;
    }

    if (message.action === 'isGenerating') {
      sendResponse({ success: isGenerating });
      return false;
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

    if (!message.messages || message.messages.length === 0) {
      const errorArticle = '# Error\n\nNo conversation found.';
      chrome.runtime.sendMessage({
        action: 'displayArticle',
        article: errorArticle
      }).catch(() => {});
      sendResponse({ error: 'No conversation found.' });
      return;
    }

    // Generate hash of current conversation
    const conversationHash = hashMessages(message.messages);
    console.log('Conversation hash:', conversationHash);

    // Check if we have a cached article for this conversation (unless force regenerate)
    if (!message.forceRegenerate) {
      const cached = await chrome.storage.local.get(['lastGeneratedArticle', 'conversationHash']);

      if (cached.conversationHash === conversationHash && cached.lastGeneratedArticle) {
        console.log('Using cached article for this conversation');
        // Send cached article to side panel
        chrome.runtime.sendMessage({
          action: 'displayArticle',
          article: cached.lastGeneratedArticle
        }).catch(() => {});
        sendResponse({ article: cached.lastGeneratedArticle });
        return;
      }
    } else {
      console.log('Force regenerate requested');
    }

    // No cache or conversation changed, generate new article
    console.log('Generating new article...');

    // Send loading state to side panel
    chrome.runtime.sendMessage({ action: 'generatingArticle' }).catch(() => {
      // Ignore if side panel is not open
    });

    // Generate the article
    const config = await getApiConfig();

    if (!config) {
      const errorArticle = '# Error\n\nAPI configuration not found. Please configure in settings.';
      chrome.runtime.sendMessage({
        action: 'displayArticle',
        article: errorArticle
      }).catch(() => {});
      sendResponse({ error: 'API configuration not found. Please configure in settings.' });
      return;
    }

    // Clear previous article before starting new generation
    await chrome.storage.local.set({ lastGeneratedArticle: '', conversationHash });
    isGenerating = true;

    const article = await generateArticle(message.messages, config, async (chunk) => {
      // Send each chunk to the side panel as it arrives
      // Silently ignore if side panel is closed
      chrome.runtime.sendMessage({
        action: 'articleChunk',
        chunk
      }).catch(() => {});

      // Also save the partial content to storage in real-time
      const result = await chrome.storage.local.get('lastGeneratedArticle');
      const currentContent = result.lastGeneratedArticle || '';
      await chrome.storage.local.set({ lastGeneratedArticle: currentContent + chunk });
    });

    console.log('Article generated, sending to side panel...');

    isGenerating = false;

    // Append source URL to the article
    const sourceUrl = message.sourceUrl || '';
    const articleWithSource = sourceUrl
      ? `${article}\n\n---\n\n**Source:** [${sourceUrl}](${sourceUrl})`
      : article;

    // Save the article to storage with conversation hash
    await chrome.storage.local.set({ lastGeneratedArticle: articleWithSource, conversationHash });

    // Send the article to the side panel
    chrome.runtime.sendMessage({ action: 'displayArticle', article: articleWithSource }).catch(() => {
      // Ignore if side panel is closed
    });

    sendResponse({ article: articleWithSource });
  } catch (error) {
    console.error('Error in handleOpenSidePanel:', error);
    isGenerating = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorArticle = `# Error\n\n${errorMessage}`;

    try {
      await chrome.runtime.sendMessage({
        action: 'displayArticle',
        article: errorArticle
      });
    } catch (msgError) {
      // Ignore if side panel is closed
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

async function handleGetLastArticle(
  sendResponse: (response: ChromeResponse) => void
) {
  try {
    const result = await chrome.storage.local.get('lastGeneratedArticle');
    console.log('Retrieved last article from storage:', result);
    sendResponse({ article: result.lastGeneratedArticle || undefined });
  } catch (error) {
    console.error('Error getting last article:', error);
    sendResponse({ article: undefined });
  }
}
