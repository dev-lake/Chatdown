import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '../i18n/react';
import App from './App';
import OverlayApp from './OverlayApp';
import './index.css';
import { detectPlatform } from './parsers';

const BUTTON_ROOT_ID = 'chatdown-root';
const OVERLAY_ROOT_ID = 'chatdown-overlay-root';
const DEEPSEEK_ACTIONS_WRAPPER_ID = 'chatdown-deepseek-actions';

// Platform-specific selectors for button injection
const PLATFORM_SELECTORS = {
  chatgpt: '#conversation-header-actions',
  gemini: '.right-section, .buttons-container',
  deepseek: '._2be88ba',
  doubao: 'button[data-testid="thread_share_btn_right_side"], [data-testid="chat_header_download_client"], button[data-testid="create_conversation_button"]',
  'google-ai-mode': '#gbwa .gb_D > a.gb_C, #gbwa a.gb_C[aria-label], header a.gb_C[href*="/about/products"], div[jsname="oEQ3x"] .KCMqmc, div[jsname="oEQ3x"] .NyTqE, [role="main"], main, #search, #rso, form[role="search"], [role="search"]',
};

let overlayRoot: Root | null = null;
let overlayContainer: HTMLElement | null = null;
let deepSeekAnchorRetries = 0;
const MAX_DEEPSEEK_ANCHOR_RETRIES = 30;
let deepSeekAlignScheduled = false;
let doubaoAnchorRetries = 0;
const MAX_DOUBAO_ANCHOR_RETRIES = 30;
let googleAiModeAnchorRetries = 0;
const MAX_GOOGLE_AI_MODE_ANCHOR_RETRIES = 20;
let googleAiModeHeaderAnchor: HTMLElement | null = null;
let googleAiModeAlignScheduled = false;

function configureButtonContainer(container: HTMLDivElement, platform: keyof typeof PLATFORM_SELECTORS) {
  container.dataset.platform = platform;

  if (platform === 'google-ai-mode') {
    container.dataset.position = 'inline';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.margin = '8px 0';
    container.style.position = 'relative';
    container.style.zIndex = '1';
    return;
  }

  if (platform !== 'deepseek' && platform !== 'doubao') {
    container.style.display = 'inline-block';
    return;
  }

  container.style.display = 'inline-flex';
  container.style.alignItems = 'center';
  container.style.flex = '0 0 auto';
  container.style.alignSelf = 'center';
}

function configureFloatingButtonContainer(container: HTMLDivElement, platform: keyof typeof PLATFORM_SELECTORS) {
  container.dataset.platform = platform;
  container.dataset.position = 'floating';
  container.style.position = 'fixed';
  container.style.top = platform === 'google-ai-mode' ? '72px' : '20px';
  container.style.right = '20px';
  container.style.zIndex = '2147483645';
  container.style.display = 'inline-flex';
  container.style.alignItems = 'center';
}

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
  overlayRoot.render(
    <I18nProvider>
      <OverlayApp />
    </I18nProvider>
  );
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

function findVisibleElementBySelectors(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) {
        continue;
      }

      const rect = getVisibleRect(candidate);
      if (!rect) {
        continue;
      }

      return candidate;
    }
  }

  return null;
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

function findDoubaoAnchor(): HTMLElement | null {
  const primaryAnchor = findVisibleElementBySelectors([
    'button[data-testid="thread_share_btn_right_side"]',
    '[data-testid="chat_header_download_client"]',
    'button[data-testid="create_conversation_button"]',
  ]);

  if (primaryAnchor) {
    return primaryAnchor;
  }

  const headerCandidates = Array.from(document.querySelectorAll('[data-container-name="main"] > div > div'));
  let bestHeader: HTMLElement | null = null;
  let bestScore = -Infinity;

  for (const candidate of headerCandidates) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }

    const rect = getVisibleRect(candidate);
    if (!rect) {
      continue;
    }
    if (rect.top < 0 || rect.top > 180) {
      continue;
    }
    if (rect.height < 40 || rect.width < window.innerWidth * 0.5) {
      continue;
    }

    const containsChatInput = candidate.querySelector('[data-testid="chat_input"]') !== null;
    if (containsChatInput) {
      continue;
    }

    const score = rect.width - rect.top;
    if (score > bestScore) {
      bestScore = score;
      bestHeader = candidate;
    }
  }

  return bestHeader;
}

function findGoogleAiModeAppsButton(): HTMLElement | null {
  return findVisibleElementBySelectors([
    '#gbwa .gb_D > a.gb_C',
    '#gbwa a.gb_C[aria-label*="Google" i]',
    'header a.gb_C[href*="/about/products"]',
    'header a.gb_C[href*="about/products"]',
  ]);
}

function findGoogleAiModeAnchor(): HTMLElement | null {
  const googleAppsButton = findGoogleAiModeAppsButton();
  if (googleAppsButton) {
    return googleAppsButton;
  }

  const toolbar = findVisibleElementBySelectors([
    'div[jsname="oEQ3x"] .KCMqmc',
    'div[jsname="oEQ3x"] .NyTqE',
    'div[jsname="oEQ3x"] .eT9Cje',
  ]);

  if (toolbar) {
    return toolbar;
  }

  const mainContent = findVisibleElementBySelectors([
    '[role="main"]',
    'main',
    '#search',
    '#rso',
  ]);

  if (mainContent) {
    return mainContent;
  }

  const searchInput = findVisibleElementBySelectors([
    'textarea[name="q"]',
    'input[name="q"]',
    'textarea[aria-label*="search" i]',
    'input[aria-label*="search" i]',
  ]);

  const searchForm = searchInput?.closest('form[role="search"], form');
  if (searchForm instanceof HTMLElement && getVisibleRect(searchForm)) {
    return searchForm;
  }

  const searchRegion = searchInput?.closest('[role="search"]');
  if (searchRegion instanceof HTMLElement && getVisibleRect(searchRegion)) {
    return searchRegion;
  }

  return findVisibleElementBySelectors([
    'form[role="search"]',
    'form[action*="/search"]',
    '[role="search"]',
    '[role="main"]',
    'main',
    '#search',
    '#rso',
  ]);
}

function insertAfter(newElement: HTMLElement, referenceElement: Element): boolean {
  const parent = referenceElement.parentElement;
  if (!parent) {
    return false;
  }

  parent.insertBefore(newElement, referenceElement.nextSibling);
  return true;
}

function insertGoogleAiModeButton(container: HTMLElement, targetElement: Element) {
  const isGoogleAppsAnchor = (
    targetElement instanceof HTMLAnchorElement
    && targetElement.classList.contains('gb_C')
    && (
      targetElement.closest('#gbwa') !== null
      || (targetElement.getAttribute('href') || '').includes('about/products')
    )
  );

  if (isGoogleAppsAnchor && targetElement.parentElement) {
    googleAiModeHeaderAnchor = targetElement;
    container.dataset.position = 'header';
    container.style.position = 'fixed';
    container.style.margin = '0';
    container.style.visibility = 'hidden';
    container.style.zIndex = '2147483644';
    document.body.appendChild(container);
    return;
  }

  const isToolbarAnchor = (
    targetElement instanceof HTMLElement
    && (
      targetElement.matches('.KCMqmc, .NyTqE, .eT9Cje')
      || targetElement.closest('div[jsname="oEQ3x"]') !== null
    )
  );

  if (isToolbarAnchor) {
    container.dataset.position = 'toolbar';
    container.style.margin = '0 0 0 8px';
    targetElement.appendChild(container);
    return;
  }

  const isSearchAnchor = (
    targetElement instanceof HTMLFormElement
    || targetElement.getAttribute('role') === 'search'
  );

  if (isSearchAnchor && insertAfter(container, targetElement)) {
    return;
  }

  if (targetElement === document.body) {
    const fallbackMainContent = findVisibleElementBySelectors([
      '[role="main"]',
      'main',
      '#search',
      '#rso',
    ]);

    if (fallbackMainContent?.parentElement) {
      fallbackMainContent.parentElement.insertBefore(container, fallbackMainContent);
      return;
    }
  }

  targetElement.insertBefore(container, targetElement.firstChild);
}

function resetDeepSeekButtonPosition(chatdownRoot: HTMLElement) {
  chatdownRoot.style.position = '';
  chatdownRoot.style.top = '';
  chatdownRoot.style.right = '';
  chatdownRoot.style.transform = '';
  chatdownRoot.style.zIndex = '';
}

function ensureDeepSeekActionsWrapper(chatdownRoot: HTMLElement, shareButton: HTMLElement): HTMLElement | null {
  const currentParent = shareButton.parentElement;
  if (!(currentParent instanceof HTMLElement)) {
    return null;
  }

  let wrapper: HTMLElement | null = currentParent.id === DEEPSEEK_ACTIONS_WRAPPER_ID
    ? currentParent
    : document.getElementById(DEEPSEEK_ACTIONS_WRAPPER_ID) as HTMLElement | null;

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = DEEPSEEK_ACTIONS_WRAPPER_ID;
    currentParent.insertBefore(wrapper, shareButton);
  } else if (wrapper !== currentParent && wrapper.parentElement !== currentParent) {
    currentParent.insertBefore(wrapper, shareButton);
  }

  if (!wrapper.contains(chatdownRoot)) {
    wrapper.appendChild(chatdownRoot);
  }

  if (!wrapper.contains(shareButton)) {
    wrapper.appendChild(shareButton);
  }

  return wrapper;
}

function applyDeepSeekButtonSpacing(chatdownRoot: HTMLElement, shareButton: HTMLElement) {
  resetDeepSeekButtonPosition(chatdownRoot);
  chatdownRoot.style.marginLeft = '0';
  chatdownRoot.style.marginRight = '0';
  shareButton.style.marginLeft = '0';
}

function alignDeepSeekButtonToShare() {
  const chatdownRoot = document.getElementById(BUTTON_ROOT_ID);
  const shareButton = findDeepSeekShareButton();

  if (!(chatdownRoot instanceof HTMLElement) || !(shareButton instanceof HTMLElement) || !shareButton.parentElement) {
    return;
  }

  const wrapper = ensureDeepSeekActionsWrapper(chatdownRoot, shareButton);
  if (!wrapper) {
    return;
  }

  if (wrapper.parentElement?.lastElementChild !== wrapper) {
    wrapper.parentElement?.appendChild(wrapper);
  }

  applyDeepSeekButtonSpacing(chatdownRoot, shareButton);
}

function scheduleDeepSeekAlignment() {
  if (detectPlatform() !== 'deepseek' || deepSeekAlignScheduled) {
    return;
  }

  deepSeekAlignScheduled = true;
  window.requestAnimationFrame(() => {
    deepSeekAlignScheduled = false;
    alignDeepSeekButtonToShare();
  });
}

function alignGoogleAiModeHeaderButton() {
  const chatdownRoot = document.getElementById(BUTTON_ROOT_ID);
  const anchor = googleAiModeHeaderAnchor && document.body.contains(googleAiModeHeaderAnchor)
    ? googleAiModeHeaderAnchor
    : findGoogleAiModeAppsButton();

  if (!(chatdownRoot instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
    return;
  }

  if (chatdownRoot.dataset.platform !== 'google-ai-mode' || chatdownRoot.dataset.position !== 'header') {
    return;
  }

  const anchorRect = getVisibleRect(anchor);
  const rootRect = chatdownRoot.getBoundingClientRect();
  if (!anchorRect || rootRect.width <= 0 || rootRect.height <= 0) {
    return;
  }

  const gap = 8;
  const top = anchorRect.top + ((anchorRect.height - rootRect.height) / 2);
  const left = anchorRect.left - rootRect.width - gap;

  chatdownRoot.style.top = `${Math.max(0, Math.round(top))}px`;
  chatdownRoot.style.left = `${Math.max(8, Math.round(left))}px`;
  chatdownRoot.style.right = 'auto';
  chatdownRoot.style.visibility = '';
  googleAiModeHeaderAnchor = anchor;
}

function scheduleGoogleAiModeHeaderAlignment() {
  if (detectPlatform() !== 'google-ai-mode' || googleAiModeAlignScheduled) {
    return;
  }

  googleAiModeAlignScheduled = true;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      googleAiModeAlignScheduled = false;
      alignGoogleAiModeHeaderButton();
    });
  });
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
  let doubaoAnchor: HTMLElement | null = null;
  let googleAiModeAnchor: HTMLElement | null = null;

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
  } else if (platform === 'doubao') {
    doubaoAnchor = findDoubaoAnchor();
    if (doubaoAnchor) {
      doubaoAnchorRetries = 0;
      targetElement = doubaoAnchor;
      console.log('[Chatdown] Found Doubao anchor');
    } else if (doubaoAnchorRetries < MAX_DOUBAO_ANCHOR_RETRIES) {
      doubaoAnchorRetries += 1;
      console.log('[Chatdown] Doubao anchor not ready, retrying...');
      setTimeout(init, 300);
      return;
    } else {
      doubaoAnchorRetries = 0;
      targetElement = document.body;
      console.warn('[Chatdown] Doubao anchor not found after retries, using floating fallback');
    }
  } else if (platform === 'google-ai-mode') {
    googleAiModeAnchor = findGoogleAiModeAnchor();
    if (googleAiModeAnchor) {
      googleAiModeAnchorRetries = 0;
      targetElement = googleAiModeAnchor;
      console.log('[Chatdown] Found Google AI Mode anchor');
    } else if (googleAiModeAnchorRetries < MAX_GOOGLE_AI_MODE_ANCHOR_RETRIES) {
      googleAiModeAnchorRetries += 1;
      console.log('[Chatdown] Google AI Mode anchor not ready, retrying...');
      setTimeout(init, 300);
      return;
    } else {
      googleAiModeAnchorRetries = 0;
      targetElement = document.body;
      console.warn('[Chatdown] Google AI Mode anchor not found after retries, using inline body fallback');
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
  if (
    platform === 'doubao'
    && targetElement === document.body
  ) {
    configureFloatingButtonContainer(container, platform);
  } else {
    configureButtonContainer(container, platform);
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
  } else if (platform === 'doubao') {
    if (
      targetElement instanceof HTMLElement
      && targetElement.matches('button[data-testid="thread_share_btn_right_side"], [data-testid="chat_header_download_client"], button[data-testid="create_conversation_button"]')
      && targetElement.parentElement
    ) {
      targetElement.parentElement.insertBefore(container, targetElement);
    } else {
      targetElement.appendChild(container);
    }
  } else if (platform === 'google-ai-mode') {
    insertGoogleAiModeButton(container, targetElement);
  } else {
    targetElement.appendChild(container);
  }

  createRoot(container).render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );

  if (platform === 'deepseek') {
    scheduleDeepSeekAlignment();
  } else if (platform === 'google-ai-mode') {
    scheduleGoogleAiModeHeaderAlignment();
  }

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

  scheduleDeepSeekAlignment();
  scheduleGoogleAiModeHeaderAlignment();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

window.addEventListener('resize', scheduleDeepSeekAlignment);
window.addEventListener('resize', scheduleGoogleAiModeHeaderAlignment);
window.addEventListener('scroll', scheduleGoogleAiModeHeaderAlignment, true);
