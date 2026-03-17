import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Wait for DOM to be fully loaded and header to be available
function init() {
  // Check if already initialized
  if (document.getElementById('chatdown-root')) {
    return;
  }

  // Find the header actions container
  const headerActions = document.getElementById('conversation-header-actions');

  if (!headerActions) {
    // If header not found yet, try again after a short delay
    setTimeout(init, 500);
    return;
  }

  // Create container with isolated styles
  const container = document.createElement('div');
  container.id = 'chatdown-root';
  container.style.cssText = 'all: initial; display: inline-block;';

  // Insert before the last child (the options menu button)
  const lastChild = headerActions.lastElementChild;
  if (lastChild) {
    headerActions.insertBefore(container, lastChild);
  } else {
    headerActions.appendChild(container);
  }

  const root = createRoot(container);
  root.render(<App />);
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

