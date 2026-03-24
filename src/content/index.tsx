import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import OverlayApp from './OverlayApp';
import './index.css';
import { detectPlatform } from './parsers';

const BUTTON_ROOT_ID = 'chatdown-root';
const OVERLAY_ROOT_ID = 'chatdown-overlay-root';

// Platform-specific selectors for button injection
const PLATFORM_SELECTORS = {
  chatgpt: '#conversation-header-actions',
  gemini: '.right-section, .buttons-container',
  deepseek: '._2be88ba',
};

let overlayRoot: Root | null = null;
let overlayContainer: HTMLElement | null = null;
let deepSeekAnchorRetries = 0;
const MAX_DEEPSEEK_ANCHOR_RETRIES = 30;
let deepSeekAlignScheduled = false;

function ensureOverlayRoot() {
  if (!document.body) {
    return;
  }

  if (overlayContainer && document.body.contains(overlayContainer)) {
    return;
  }

  if (overlayRoot) {
    overlayRoot.unmount();
    overlayRoot = null;
  }

  overlayContainer = document.getElementById(OVERLAY_ROOT_ID) as HTMLElement | null;

  if (!overlayContainer) {
    overlayContainer = document.createElement('div');
    overlayContainer.id = OVERLAY_ROOT_ID;
    document.body.appendChild(overlayContainer);
  }

  overlayRoot = createRoot(overlayContainer);
  overlayRoot.render(<OverlayApp />);
}

function getVisibleRect(element: Element): DOMRect | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return rect;
}

function isClickableElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    return true;
  }

  const role = element.getAttribute('role');
  if (role === 'button' || role === 'menuitem') {
    return true;
  }

  const tabIndex = element.getAttribute('tabindex');
  if (tabIndex !== null && Number(tabIndex) >= 0) {
    return true;
  }

  if (typeof element.onclick === 'function') {
    return true;
  }

  const style = window.getComputedStyle(element);
  return style.cursor === 'pointer';
}

function findDeepSeekShareButton(): Element | null {
  const selectorCandidates = [
    'button[aria-label="Share"]',
    'button[aria-label="分享"]',
    'button[title="Share"]',
    'button[title="分享"]',
    'button[data-testid*="share" i]',
    'button[class*="share" i]',
    '._57370c5',
  ];

  for (const selector of selectorCandidates) {
    const shareButton = document.querySelector(selector);
    if (shareButton) {
      return shareButton;
    }
  }

  const allButtons = Array.from(document.querySelectorAll('button'));
  for (const button of allButtons) {
    const buttonText = [
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.textContent,
    ]
      .join(' ')
      .toLowerCase();

    if (buttonText.includes('share') || buttonText.includes('分享')) {
      return button;
    }
  }

  const clickables = Array.from(document.querySelectorAll('*'));
  let bestCandidate: Element | null = null;
  let bestScore = -Infinity;

  for (const candidate of clickables) {
    if (candidate.id === BUTTON_ROOT_ID || candidate.closest(`#${BUTTON_ROOT_ID}`)) {
      continue;
    }

    const rect = getVisibleRect(candidate);
    if (!rect) {
      continue;
    }
    if (rect.top < 0 || rect.top > 180) {
      continue;
    }
    if (rect.left < window.innerWidth * 0.45) {
      continue;
    }
    if (rect.width > 140 || rect.height > 90) {
      continue;
    }

    const text = (candidate.textContent || '').trim();
    const labelText = [
      candidate.getAttribute('aria-label'),
      candidate.getAttribute('title'),
      text,
    ]
      .join(' ')
      .toLowerCase();
    const hasSvg = candidate.querySelector('svg') !== null;
    const looksLikeIconButton = hasSvg && text.length <= 2;
    const mentionsShare = labelText.includes('share') || labelText.includes('分享');
    const clickable = isClickableElement(candidate);

    if (!clickable && !looksLikeIconButton && !mentionsShare) {
      continue;
    }

    let score = rect.left;
    if (rect.top < 90) {
      score += 60;
    }
    if (clickable) {
      score += 80;
    }
    if (candidate.tagName === 'BUTTON' || candidate.getAttribute('role') === 'button') {
      score += 100;
    }
    if (looksLikeIconButton) {
      score += 300;
    }
    if (mentionsShare) {
      score += 1000;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function alignDeepSeekButtonToShare() {
  const chatdownRoot = document.getElementById(BUTTON_ROOT_ID);
  const shareButton = findDeepSeekShareButton();

  if (!chatdownRoot || !shareButton?.parentElement) {
    return;
  }

  const expectedParent = shareButton.parentElement;
  const isAlreadyBeforeShare =
    chatdownRoot.parentElement === expectedParent &&
    chatdownRoot.nextElementSibling === shareButton;

  if (!isAlreadyBeforeShare) {
    expectedParent.insertBefore(chatdownRoot, shareButton);
    console.log('[Chatdown] Re-aligned DeepSeek button next to share');
  }
}

function init() {
  ensureOverlayRoot();

  if (document.getElementById(BUTTON_ROOT_ID)) {
    return;
  }

  const platform = detectPlatform();
  console.log('[Chatdown] Detected platform:', platform);

  if (platform === 'unknown') {
    console.warn('[Chatdown] Unknown platform, cannot inject button');
    return;
  }

  let targetElement: Element | null = null;
  let deepSeekShareButton: Element | null = null;

  if (platform === 'deepseek') {
    deepSeekShareButton = findDeepSeekShareButton();
    if (deepSeekShareButton?.parentElement) {
      deepSeekAnchorRetries = 0;
      targetElement = deepSeekShareButton.parentElement;
      console.log('[Chatdown] Found DeepSeek share button anchor');
    } else if (deepSeekAnchorRetries < MAX_DEEPSEEK_ANCHOR_RETRIES) {
      deepSeekAnchorRetries += 1;
      console.log('[Chatdown] DeepSeek share button not ready, retrying...');
      setTimeout(init, 300);
      return;
    } else {
      deepSeekAnchorRetries = 0;
      console.warn('[Chatdown] DeepSeek share button not found after retries, using fallback container');
    }
  }

  if (!targetElement) {
    const selectors = PLATFORM_SELECTORS[platform].split(', ');
    for (const selector of selectors) {
      console.log('[Chatdown] Trying selector:', selector);
      targetElement = document.querySelector(selector);
      if (targetElement) {
        console.log('[Chatdown] Found target element with selector:', selector);
        break;
      }
    }
  }

  if (!targetElement) {
    console.log('[Chatdown] Target element not found, retrying...');
    setTimeout(init, 500);
    return;
  }

  const container = document.createElement('div');
  container.id = BUTTON_ROOT_ID;
  container.style.cssText = 'display: inline-block;';

  if (platform === 'deepseek' && !deepSeekShareButton) {
    container.style.marginLeft = 'auto';
  }

  if (platform === 'chatgpt') {
    const lastChild = targetElement.lastElementChild;
    if (lastChild) {
      targetElement.insertBefore(container, lastChild);
    } else {
      targetElement.appendChild(container);
    }
  } else if (platform === 'gemini') {
    const lastButtonsContainer = targetElement.querySelector('.buttons-container:last-child');
    if (lastButtonsContainer) {
      targetElement.insertBefore(container, lastButtonsContainer);
    } else {
      targetElement.appendChild(container);
    }
  } else if (platform === 'deepseek') {
    if (deepSeekShareButton && deepSeekShareButton.parentElement) {
      deepSeekShareButton.parentElement.insertBefore(container, deepSeekShareButton);
    } else {
      const fallbackShareButton = findDeepSeekShareButton();
      if (fallbackShareButton?.parentElement) {
        fallbackShareButton.parentElement.insertBefore(container, fallbackShareButton);
      } else {
        targetElement.appendChild(container);
      }
    }
  } else {
    targetElement.appendChild(container);
  }

  createRoot(container).render(<App />);
  console.log('[Chatdown] Button rendered successfully');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

const observer = new MutationObserver(() => {
  if (!document.getElementById(OVERLAY_ROOT_ID)) {
    overlayContainer = null;
    ensureOverlayRoot();
  }

  if (!document.getElementById(BUTTON_ROOT_ID)) {
    init();
    return;
  }

  if (detectPlatform() === 'deepseek') {
    if (deepSeekAlignScheduled) {
      return;
    }

    deepSeekAlignScheduled = true;
    window.requestAnimationFrame(() => {
      deepSeekAlignScheduled = false;
      alignDeepSeekButtonToShare();
    });
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
