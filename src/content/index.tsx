import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { detectPlatform } from './parsers';

// Platform-specific selectors for button injection
const PLATFORM_SELECTORS = {
  chatgpt: '#conversation-header-actions',
  gemini: '.right-section, .buttons-container',
  deepseek: '._2be88ba',
};

// Wait for DOM to be fully loaded and header to be available
function init() {
  // Check if already initialized
  if (document.getElementById('chatdown-root')) {
    return;
  }

  const platform = detectPlatform();
  console.log('[Chatdown] Detected platform:', platform);

  if (platform === 'unknown') {
    console.warn('[Chatdown] Unknown platform, cannot inject button');
    return;
  }

  // Try platform-specific selectors
  const selectors = PLATFORM_SELECTORS[platform].split(', ');
  let targetElement: Element | null = null;

  for (const selector of selectors) {
    console.log('[Chatdown] Trying selector:', selector);
    targetElement = document.querySelector(selector);
    if (targetElement) {
      console.log('[Chatdown] Found target element with selector:', selector);
      break;
    }
  }

  if (!targetElement) {
    console.log('[Chatdown] Target element not found, retrying...');
    // If target not found yet, try again after a short delay
    setTimeout(init, 500);
    return;
  }

  // Create container with isolated styles
  const container = document.createElement('div');
  container.id = 'chatdown-root';
  container.style.cssText = 'display: inline-block;';

  // Platform-specific insertion logic
  if (platform === 'chatgpt') {
    // Insert before the last child (the options menu button)
    const lastChild = targetElement.lastElementChild;
    if (lastChild) {
      targetElement.insertBefore(container, lastChild);
    } else {
      targetElement.appendChild(container);
    }
  } else if (platform === 'gemini') {
    // For Gemini, insert before the last buttons-container (which contains the more_vert menu)
    const lastButtonsContainer = targetElement.querySelector('.buttons-container:last-child');
    if (lastButtonsContainer) {
      targetElement.insertBefore(container, lastButtonsContainer);
    } else {
      targetElement.appendChild(container);
    }
  } else if (platform === 'deepseek') {
    // For DeepSeek, insert before the share button (element with class _57370c5)
    const shareButton = targetElement.querySelector('._57370c5');
    if (shareButton) {
      targetElement.insertBefore(container, shareButton);
    } else {
      targetElement.appendChild(container);
    }
  } else {
    // Default: append to target element
    targetElement.appendChild(container);
  }

  const root = createRoot(container);
  root.render(<App />);
  console.log('[Chatdown] Button rendered successfully');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also watch for navigation changes (ChatGPT is a SPA)
const observer = new MutationObserver(() => {
  if (!document.getElementById('chatdown-root')) {
    init();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

