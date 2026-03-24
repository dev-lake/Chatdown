import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { marked } from 'marked';
import type { ArticleState, ChromeMessage } from '../types';
import {
  CHATDOWN_OPEN_OVERLAY_EVENT,
  CHATDOWN_SHOW_ERROR_EVENT,
  chatdownEvents,
  emitChatdownVisibilityChange,
} from './events';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const WINDOW_MARGIN = 20;
const DEFAULT_WIDTH = 620;
const DEFAULT_HEIGHT = 760;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 320;

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left';

interface ResizeState {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  origin: WindowRect;
}

function buildErrorArticle(message: string): string {
  return `# Error\n\n${message}`;
}

function getViewportLimits() {
  return {
    maxWidth: Math.max(280, window.innerWidth - WINDOW_MARGIN * 2),
    maxHeight: Math.max(240, window.innerHeight - WINDOW_MARGIN * 2),
  };
}

function getMinimumWidth(maxWidth: number): number {
  return Math.min(MIN_WIDTH, maxWidth);
}

function getMinimumHeight(maxHeight: number): number {
  return Math.min(MIN_HEIGHT, maxHeight);
}

function clampWindowRect(rect: WindowRect): WindowRect {
  const { maxWidth, maxHeight } = getViewportLimits();
  const width = Math.min(Math.max(rect.width, getMinimumWidth(maxWidth)), maxWidth);
  const height = Math.min(Math.max(rect.height, getMinimumHeight(maxHeight)), maxHeight);
  const maxX = window.innerWidth - width - WINDOW_MARGIN;
  const maxY = window.innerHeight - height - WINDOW_MARGIN;

  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, maxX)),
    y: Math.min(Math.max(rect.y, WINDOW_MARGIN), Math.max(WINDOW_MARGIN, maxY)),
  };
}

function resizeWindowRect(
  origin: WindowRect,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number
): WindowRect {
  const { maxWidth, maxHeight } = getViewportLimits();
  const minWidth = getMinimumWidth(maxWidth);
  const minHeight = getMinimumHeight(maxHeight);
  const originRight = origin.x + origin.width;
  const originBottom = origin.y + origin.height;

  if (direction === 'right') {
    return clampWindowRect({
      ...origin,
      width: Math.min(
        Math.max(origin.width + deltaX, minWidth),
        window.innerWidth - origin.x - WINDOW_MARGIN
      ),
    });
  }

  if (direction === 'bottom') {
    return clampWindowRect({
      ...origin,
      height: Math.min(
        Math.max(origin.height + deltaY, minHeight),
        window.innerHeight - origin.y - WINDOW_MARGIN
      ),
    });
  }

  if (direction === 'left') {
    const nextX = Math.min(
      Math.max(origin.x + deltaX, WINDOW_MARGIN),
      originRight - minWidth
    );

    return clampWindowRect({
      ...origin,
      x: nextX,
      width: originRight - nextX,
    });
  }

  const nextY = Math.min(
    Math.max(origin.y + deltaY, WINDOW_MARGIN),
    originBottom - minHeight
  );

  return clampWindowRect({
    ...origin,
    y: nextY,
    height: originBottom - nextY,
  });
}

function getDefaultWindowRect(): WindowRect {
  const { maxWidth, maxHeight } = getViewportLimits();
  const width = Math.min(DEFAULT_WIDTH, maxWidth);
  const height = Math.min(DEFAULT_HEIGHT, maxHeight);

  return clampWindowRect({
    width,
    height,
    x: window.innerWidth - width - 24,
    y: window.innerHeight - height - 24,
  });
}

function applyArticleStateToView(
  state: ArticleState | undefined,
  setMarkdownContent: (value: string) => void,
  setStreamingContent: (value: string) => void,
  setLoading: (value: boolean) => void
): void {
  if (!state) {
    setMarkdownContent('');
    setStreamingContent('');
    setLoading(false);
    return;
  }

  if (state.isGenerating) {
    setMarkdownContent('');
    setStreamingContent(state.partialArticle || '');
    setLoading(true);
    return;
  }

  setMarkdownContent(state.article || '');
  setStreamingContent('');
  setLoading(false);
}

export default function OverlayApp() {
  const [visible, setVisible] = useState(false);
  const [windowRect, setWindowRect] = useState<WindowRect>(() => getDefaultWindowRect());
  const [markdownContent, setMarkdownContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; origin: WindowRect } | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start editing...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'chatdown-link',
        },
      }),
      Image,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: '',
    editable: true,
    editorProps: {
      attributes: {
        class: 'chatdown-editor',
      },
    },
  });

  const stopPointerInteraction = useCallback(() => {
    dragStateRef.current = null;
    resizeStateRef.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopPointerInteraction);
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (dragStateRef.current) {
      const { startX, startY, origin } = dragStateRef.current;
      const nextRect = clampWindowRect({
        ...origin,
        x: origin.x + (event.clientX - startX),
        y: origin.y + (event.clientY - startY),
      });

      setWindowRect(nextRect);
      return;
    }

    if (resizeStateRef.current) {
      const { direction, startX, startY, origin } = resizeStateRef.current;
      const nextRect = resizeWindowRect(
        origin,
        direction,
        event.clientX - startX,
        event.clientY - startY
      );

      setWindowRect(nextRect);
    }
  }, []);

  useEffect(() => {
    const loadArticleState = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getArticleState' });
        applyArticleStateToView(response?.state, setMarkdownContent, setStreamingContent, setLoading);
      } catch (error) {
        // Ignore initialization failures in the overlay host.
      }
    };

    const handleRuntimeMessage = (message: ChromeMessage) => {
      if (message.action === 'displayArticle') {
        setMarkdownContent(message.article || '');
        setStreamingContent('');
        setLoading(false);
        setIsEditing(false);
      } else if (message.action === 'generatingArticle') {
        setLoading(true);
        setMarkdownContent('');
        setStreamingContent('');
        setIsEditing(false);
      } else if (message.action === 'articleChunk') {
        setStreamingContent((current) => current + (message.chunk || ''));
      }
    };

    const handleOpenOverlay = () => {
      setVisible(true);
    };

    const handleShowError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setVisible(true);
      setMarkdownContent(buildErrorArticle(detail?.message || 'Unknown error'));
      setStreamingContent('');
      setLoading(false);
      setIsEditing(false);
    };

    const handleViewportResize = () => {
      setWindowRect((current) => clampWindowRect(current));
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    chatdownEvents.addEventListener(CHATDOWN_OPEN_OVERLAY_EVENT, handleOpenOverlay);
    chatdownEvents.addEventListener(CHATDOWN_SHOW_ERROR_EVENT, handleShowError);
    window.addEventListener('resize', handleViewportResize);
    void loadArticleState();

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      chatdownEvents.removeEventListener(CHATDOWN_OPEN_OVERLAY_EVENT, handleOpenOverlay);
      chatdownEvents.removeEventListener(CHATDOWN_SHOW_ERROR_EVENT, handleShowError);
      window.removeEventListener('resize', handleViewportResize);
      stopPointerInteraction();
      emitChatdownVisibilityChange(false);
    };
  }, [stopPointerInteraction]);

  useEffect(() => {
    emitChatdownVisibilityChange(visible);
  }, [visible]);

  useEffect(() => {
    if (!showExportMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showExportMenu]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setShowExportMenu(false);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: windowRect,
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopPointerInteraction);
  };

  const startResize = (
    event: React.PointerEvent<HTMLButtonElement>,
    direction: ResizeDirection
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setShowExportMenu(false);
    resizeStateRef.current = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      origin: windowRect,
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopPointerInteraction);
  };

  const handleCopy = async () => {
    if (!markdownContent) {
      return;
    }

    await navigator.clipboard.writeText(markdownContent);
    window.alert('Copied to clipboard.');
  };

  const handleDownload = () => {
    if (!markdownContent) {
      return;
    }

    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];

    link.href = url;
    link.download = `chatdown-${date}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEdit = async () => {
    if (!editor || !markdownContent) {
      return;
    }

    setIsEditing(true);
    const html = await marked.parse(markdownContent);
    editor.commands.setContent(html);
    editor.commands.focus();
  };

  const handleSave = async () => {
    if (!editor) {
      return;
    }

    const html = editor.getHTML();
    setMarkdownContent(html);
    setIsEditing(false);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveArticleContent',
        articleContent: html,
      });

      if (response?.error) {
        window.alert(`Failed to save article: ${response.error}`);
      }
    } catch (error) {
      window.alert('Failed to save article.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    try {
      setLoading(true);
      setMarkdownContent('');
      setStreamingContent('');
      setIsEditing(false);
      setShowExportMenu(false);

      const response = await chrome.runtime.sendMessage({ action: 'regenerateArticle' });

      if (response?.error) {
        window.alert(`Failed to regenerate: ${response.error}`);
        setLoading(false);
      }
    } catch (error) {
      window.alert('Failed to regenerate article.');
      setLoading(false);
    }
  };

  const handleExportToNotion = async () => {
    if (!markdownContent) {
      return;
    }

    setExporting(true);
    setShowExportMenu(false);

    const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `Chatdown Article ${new Date().toLocaleDateString()}`;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportToNotion',
        articleTitle: title,
        articleContent: markdownContent,
      });

      if (response?.success) {
        window.alert(`Exported to Notion successfully.\n${response.article || ''}`);
      } else {
        window.alert(`Export failed: ${response?.error || 'Unknown error'}`);
      }
    } catch (error) {
      window.alert('Export to Notion failed.');
    } finally {
      setExporting(false);
    }
  };

  const renderMarkdown = useCallback((markdown: string) => {
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(markdown);
    const html = isHtml ? markdown : (marked.parse(markdown, { async: false }) as string);

    return (
      <div
        className="chatdown-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }, []);

  const overlayStyle = useMemo(() => ({
    width: `${windowRect.width}px`,
    height: `${windowRect.height}px`,
    left: `${windowRect.x}px`,
    top: `${windowRect.y}px`,
  }), [windowRect]);

  const closeOverlay = () => {
    setVisible(false);
    setShowExportMenu(false);
    setIsEditing(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="chatdown-overlay">
      <section className="chatdown-window" style={overlayStyle}>
        <header className="chatdown-window__header">
          <div className="chatdown-window__topbar">
            <div className="chatdown-window__drag-region" onPointerDown={startDrag}>
              <div className="chatdown-window__eyebrow">Chatdown</div>
              <div className="chatdown-window__title">
                {isEditing ? 'Editing article' : loading ? 'Generating article' : markdownContent ? 'Article ready' : 'Article workspace'}
              </div>
            </div>

            <button
              type="button"
              className="chatdown-icon-button"
              onClick={closeOverlay}
              title="Close"
            >
              Close
            </button>
          </div>

          <div className="chatdown-window__toolbar">
            {isEditing ? (
              <>
                <span className="chatdown-status">Edit mode</span>
                <div className="chatdown-toolbar__buttons">
                  <button type="button" className="chatdown-secondary-button" onClick={handleCancel}>
                    Cancel
                  </button>
                  <button type="button" className="chatdown-primary-button" onClick={handleSave}>
                    Save
                  </button>
                </div>
              </>
            ) : loading ? (
              <span className="chatdown-status">Streaming article content...</span>
            ) : exporting ? (
              <span className="chatdown-status">Exporting to Notion...</span>
            ) : markdownContent ? (
              <>
                <span className="chatdown-status">Ready</span>
                <div className="chatdown-toolbar__buttons">
                  <button type="button" className="chatdown-secondary-button" onClick={handleRegenerate}>
                    Regenerate
                  </button>
                  <button type="button" className="chatdown-secondary-button" onClick={handleEdit}>
                    Edit
                  </button>
                  <div className="chatdown-menu" ref={exportMenuRef}>
                    <button
                      type="button"
                      className="chatdown-secondary-button"
                      onClick={() => setShowExportMenu((current) => !current)}
                    >
                      Export
                    </button>

                    {showExportMenu ? (
                      <div className="chatdown-menu__content">
                        <button type="button" className="chatdown-menu__item" onClick={handleCopy}>
                          Copy to clipboard
                        </button>
                        <button type="button" className="chatdown-menu__item" onClick={handleDownload}>
                          Download Markdown
                        </button>
                        <button type="button" className="chatdown-menu__item" onClick={handleExportToNotion}>
                          Export to Notion
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <span className="chatdown-status">Generate an article from the current conversation.</span>
            )}
          </div>
        </header>

        <div className="chatdown-window__body">
          {loading || streamingContent ? (
            <div className="chatdown-window__scroll">
              {streamingContent ? (
                renderMarkdown(streamingContent)
              ) : (
                <div className="chatdown-empty-state">
                  <h2>Preparing article...</h2>
                  <p>Waiting for the model to return the first chunk.</p>
                </div>
              )}
            </div>
          ) : !markdownContent ? (
            <div className="chatdown-empty-state">
              <h2>No article yet</h2>
              <p>Click the Chatdown button in the chat header to generate an article.</p>
            </div>
          ) : isEditing ? (
            <div className="chatdown-window__scroll chatdown-window__scroll--editor">
              <EditorContent editor={editor} />
            </div>
          ) : (
            <div className="chatdown-window__scroll">
              {renderMarkdown(markdownContent)}
            </div>
          )}
        </div>

        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--top"
          onPointerDown={(event) => startResize(event, 'top')}
          aria-label="Resize window from top edge"
          title="Resize from top edge"
        />
        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--right"
          onPointerDown={(event) => startResize(event, 'right')}
          aria-label="Resize window from right edge"
          title="Resize from right edge"
        />
        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--bottom"
          onPointerDown={(event) => startResize(event, 'bottom')}
          aria-label="Resize window from bottom edge"
          title="Resize from bottom edge"
        />
        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--left"
          onPointerDown={(event) => startResize(event, 'left')}
          aria-label="Resize window from left edge"
          title="Resize from left edge"
        />
      </section>
    </div>
  );
}
