import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { marked } from 'marked';
import type { ArticleState, ChromeMessage, GenerationMode } from '../types';
import type { TranslateFn } from '../i18n/core';
import { useI18n } from '../i18n/react';
import {
  CHATDOWN_OPEN_OVERLAY_EVENT,
  CHATDOWN_SHOW_ERROR_EVENT,
  chatdownEvents,
  emitChatdownVisibilityChange,
} from './events';
import { detectPlatform, getParser } from './parsers';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const WINDOW_MARGIN = 20;
const DEFAULT_WIDTH = 620;
const DEFAULT_HEIGHT = 760;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 320;
const CHATDOWN_BRAND = 'Chatdown';
const MAX_FILENAME_BASE_LENGTH = 80;

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left';
type ExportTarget = 'notion' | 'obsidian' | null;

interface ResizeState {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  origin: WindowRect;
}

function buildErrorArticle(errorTitle: string, message: string): string {
  return `# ${errorTitle}\n\n${message}`;
}

function isHtmlContent(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
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

function extractHtmlArticleTitle(content: string): string | null {
  if (typeof DOMParser === 'undefined') {
    return null;
  }

  const document = new DOMParser().parseFromString(content, 'text/html');
  const title = document.querySelector('h1')?.textContent?.trim();

  return title || null;
}

function extractArticleTitle(content: string): string | null {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return null;
  }

  if (isHtmlContent(normalizedContent)) {
    return extractHtmlArticleTitle(normalizedContent);
  }

  const titleMatch = normalizedContent.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim();

  return title || null;
}

function getArticleTitle(content: string, locale: string, t: TranslateFn): string {
  return extractArticleTitle(content)
    || t('overlayDefaultArticleTitle', { date: new Date().toLocaleDateString(locale) });
}

function sanitizeFilenameBase(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s._-]+|[\s._-]+$/g, '')
    .slice(0, MAX_FILENAME_BASE_LENGTH)
    .replace(/[\s._-]+$/g, '');

  return sanitized || CHATDOWN_BRAND;
}

function buildMarkdownFilename(content: string, locale: string, t: TranslateFn): string {
  const articleTitle = getArticleTitle(content, locale, t);
  const filenameBase = /^chatdown(?:$|[\s_-]+)/i.test(articleTitle)
    ? articleTitle
    : `${CHATDOWN_BRAND}-${articleTitle}`;

  return `${sanitizeFilenameBase(filenameBase)}.md`;
}

function getRegenerationContext(articleState: ArticleState | null): Pick<ChromeMessage, 'messages' | 'sourceUrl' | 'platform'> {
  const detectedPlatform = detectPlatform();
  const parser = getParser(detectedPlatform);

  if (parser) {
    try {
      const messages = parser.parse();
      if (messages.length > 0) {
        return {
          messages,
          sourceUrl: window.location.href,
          platform: detectedPlatform,
        };
      }
    } catch {
      // Fall back to the persisted article state below.
    }
  }

  return {
    messages: articleState?.messages ?? [],
    sourceUrl: articleState?.sourceUrl || window.location.href,
    platform: articleState?.platform && articleState.platform !== 'unknown'
      ? articleState.platform
      : detectedPlatform,
  };
}

function applyArticleStateToView(
  state: ArticleState | undefined,
  setArticleState: (value: ArticleState | null) => void,
  setMarkdownContent: (value: string) => void,
  setStreamingContent: (value: string) => void,
  setIsEditing: (value: boolean) => void
): void {
  if (!state) {
    setArticleState(null);
    setMarkdownContent('');
    setStreamingContent('');
    setIsEditing(false);
    return;
  }

  setArticleState(state);
  setIsEditing(false);

  if (state.phase === 'generating') {
    setMarkdownContent('');
    setStreamingContent(state.partialArticle || '');
    return;
  }

  if (state.phase === 'ready' || state.phase === 'error') {
    setMarkdownContent(state.article || '');
    setStreamingContent('');
    return;
  }

  setMarkdownContent('');
  setStreamingContent('');
}

function getOverlayTitle(
  articleState: ArticleState | null,
  isEditing: boolean,
  markdownContent: string,
  t: TranslateFn
): string {
  if (isEditing) {
    return t('overlayTitleEditing');
  }

  if (articleState?.phase === 'summarizing_rounds') {
    return t('overlayTitlePreparingSummaries');
  }

  if (articleState?.phase === 'selecting_rounds') {
    return t('overlayTitleChooseRounds');
  }

  if (articleState?.phase === 'generating') {
    return t('overlayTitleGenerating');
  }

  if (articleState?.phase === 'error') {
    return t('commonErrorTitle');
  }

  if (markdownContent) {
    return t('overlayTitleReady');
  }

  return t('overlayTitleWorkspace');
}

export default function OverlayApp() {
  const { locale, t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [windowRect, setWindowRect] = useState<WindowRect>(() => getDefaultWindowRect());
  const [articleState, setArticleState] = useState<ArticleState | null>(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showRegenerateMenu, setShowRegenerateMenu] = useState(false);
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const regenerateMenuRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; origin: WindowRect } | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: t('overlayPlaceholderStartEditing'),
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
  }, [locale]);

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

  const stopPointerInteraction = useCallback(() => {
    dragStateRef.current = null;
    resizeStateRef.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopPointerInteraction);
  }, [handlePointerMove]);

  useEffect(() => {
    const loadArticleState = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getArticleState' });
        applyArticleStateToView(
          response?.state,
          setArticleState,
          setMarkdownContent,
          setStreamingContent,
          setIsEditing
        );
      } catch {
        // Ignore initialization failures in the overlay host.
      }
    };

    const handleRuntimeMessage = (message: ChromeMessage) => {
      if (message.state) {
        applyArticleStateToView(
          message.state,
          setArticleState,
          setMarkdownContent,
          setStreamingContent,
          setIsEditing
        );
      }

      if (message.action === 'displayArticle') {
        setMarkdownContent(message.article || message.state?.article || '');
        setStreamingContent('');
        setIsEditing(false);
      } else if (message.action === 'generatingArticle') {
        setMarkdownContent('');
        setStreamingContent(message.state?.partialArticle || '');
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
      const errorMessage = detail?.message || t('commonUnknownError');
      setVisible(true);
      setArticleState({
        article: buildErrorArticle(t('commonErrorTitle'), errorMessage),
        partialArticle: '',
        conversationHash: '',
        messages: [],
        sourceUrl: '',
        platform: 'unknown',
        phase: 'error',
        mode: null,
        rounds: [],
        selectedRoundIds: [],
        notice: '',
      });
      setMarkdownContent(buildErrorArticle(t('commonErrorTitle'), errorMessage));
      setStreamingContent('');
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
  }, [stopPointerInteraction, t]);

  useEffect(() => {
    emitChatdownVisibilityChange(visible);
  }, [visible]);

  useEffect(() => {
    if (!showExportMenu && !showRegenerateMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!exportMenuRef.current?.contains(target)) {
        setShowExportMenu(false);
      }

      if (!regenerateMenuRef.current?.contains(target)) {
        setShowRegenerateMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showExportMenu, showRegenerateMenu]);

  useEffect(() => {
    if (articleState?.phase !== 'selecting_rounds') {
      setSelectedRoundIds([]);
      return;
    }

    setSelectedRoundIds(articleState.selectedRoundIds);
  }, [articleState?.phase, articleState?.conversationHash, articleState?.rounds, articleState?.selectedRoundIds]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setShowExportMenu(false);
    setShowRegenerateMenu(false);
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
    setShowRegenerateMenu(false);
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
    window.alert(t('overlayCopiedToClipboard'));
  };

  const handleDownload = () => {
    if (!markdownContent) {
      return;
    }

    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = buildMarkdownFilename(markdownContent, locale, t);
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
    const html = isHtmlContent(markdownContent)
      ? markdownContent
      : await marked.parse(markdownContent);
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

      if (response?.state) {
        setArticleState(response.state);
      }

      if (response?.error && !response.state) {
        window.alert(t('overlayFailedToSaveWithReason', { error: response.error }));
      }
    } catch {
      window.alert(t('overlayFailedToSave'));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleRegenerate = async (mode: GenerationMode) => {
    try {
      setShowRegenerateMenu(false);
      const regenerationContext = getRegenerationContext(articleState);
      const response = await chrome.runtime.sendMessage({
        action: 'regenerateArticle',
        mode,
        ...regenerationContext,
      });

      if (response?.state) {
        applyArticleStateToView(
          response.state,
          setArticleState,
          setMarkdownContent,
          setStreamingContent,
          setIsEditing
        );
      }

      if (response?.error && !response.state) {
        window.alert(t('overlayFailedToRegenerateWithReason', { error: response.error }));
      }
    } catch {
      window.alert(t('overlayFailedToRegenerate'));
    }
  };

  const handleGenerateFromSelection = async () => {
    if (selectedRoundIds.length === 0) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'generateArticleFromSelection',
        selectedRoundIds,
      });

      if (response?.state) {
        applyArticleStateToView(
          response.state,
          setArticleState,
          setMarkdownContent,
          setStreamingContent,
          setIsEditing
        );
      }

      if (response?.error && !response.state) {
        window.alert(t('overlayFailedToGenerateWithReason', { error: response.error }));
      }
    } catch {
      window.alert(t('overlayFailedToGenerate'));
    }
  };

  const handleExportToNotion = async () => {
    if (!markdownContent) {
      return;
    }

    setExporting(true);
    setExportTarget('notion');
    setShowExportMenu(false);

    const title = getArticleTitle(markdownContent, locale, t);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportToNotion',
        articleTitle: title,
        articleContent: markdownContent,
      });

      if (response?.success) {
        window.alert(t('overlayExportSuccess', { url: response.article || '' }));
      } else {
        window.alert(t('overlayExportFailed', { error: response?.error || t('commonUnknownError') }));
      }
    } catch {
      window.alert(t('overlayExportToNotionFailed'));
    } finally {
      setExporting(false);
      setExportTarget(null);
    }
  };

  const handleExportToObsidian = async () => {
    if (!markdownContent) {
      return;
    }

    setExporting(true);
    setExportTarget('obsidian');
    setShowExportMenu(false);

    const title = getArticleTitle(markdownContent, locale, t);
    let useClipboard = false;
    let hasObsidianVault = false;

    try {
      const settings = await chrome.storage.local.get('obsidianVault');
      hasObsidianVault = typeof settings.obsidianVault === 'string'
        && settings.obsidianVault.trim().length > 0;
    } catch {
      hasObsidianVault = false;
    }

    if (hasObsidianVault && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(markdownContent);
        useClipboard = true;
      } catch {
        useClipboard = false;
      }
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportToObsidian',
        articleTitle: title,
        articleContent: markdownContent,
        useClipboard,
      });

      if (response?.success) {
        window.alert(t('overlayExportToObsidianSuccess', { path: response.article || '' }));
      } else {
        window.alert(t('overlayExportToObsidianFailedWithReason', {
          error: response?.error || t('commonUnknownError'),
        }));
      }
    } catch {
      window.alert(t('overlayExportToObsidianFailed'));
    } finally {
      setExporting(false);
      setExportTarget(null);
    }
  };

  const renderMarkdown = useCallback((markdown: string) => {
    const html = isHtmlContent(markdown)
      ? markdown
      : (marked.parse(markdown, { async: false }) as string);

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
    setShowRegenerateMenu(false);
    setIsEditing(false);
    setExporting(false);
    setExportTarget(null);
  };

  const title = getOverlayTitle(articleState, isEditing, markdownContent, t);

  const renderSelectionBody = () => {
    if (!articleState) {
      return null;
    }

    return (
      <div className="chatdown-selection">
        <div className="chatdown-selection__header">
          <span className="chatdown-selection__eyebrow">{t('overlaySelectionEyebrow')}</span>
          <h2>{t('overlaySelectionHeading')}</h2>
          <p>{t('overlaySelectionDescription')}</p>
        </div>

        <div className="chatdown-selection__list">
          {articleState.rounds.map((round) => {
            const selected = selectedRoundIds.includes(round.id);

            return (
              <button
                key={round.id}
                type="button"
                className={`chatdown-round-card${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  setSelectedRoundIds((current) => (
                    current.includes(round.id)
                      ? current.filter((roundId) => roundId !== round.id)
                      : [...current, round.id]
                  ));
                }}
              >
                <div className="chatdown-round-card__top">
                  <span className="chatdown-round-card__checkbox" aria-hidden="true">
                    {selected ? '☑' : '☐'}
                  </span>
                  <div className="chatdown-round-card__meta">
                    <strong>{t('overlayRoundLabel', { index: round.index })}</strong>
                    <span>{round.summary}</span>
                  </div>
                </div>

                {round.preview ? (
                  <p className="chatdown-round-card__preview">{round.preview}</p>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="chatdown-selection__actions">
          <button
            type="button"
            className="chatdown-primary-button"
            onClick={handleGenerateFromSelection}
            disabled={selectedRoundIds.length === 0}
          >
            {t('commonGenerate')}
          </button>
        </div>
      </div>
    );
  };

  const renderBody = () => {
    if (articleState?.phase === 'summarizing_rounds') {
      return (
        <div className="chatdown-empty-state">
          <h2>{t('overlaySummariesHeading')}</h2>
          <p>{t('overlaySummariesDescription')}</p>
        </div>
      );
    }

    if (articleState?.phase === 'selecting_rounds') {
      return (
        <div className="chatdown-window__scroll">
          {renderSelectionBody()}
        </div>
      );
    }

    if (articleState?.phase === 'generating' || streamingContent) {
      return (
        <div className="chatdown-window__scroll">
          {streamingContent ? (
            renderMarkdown(streamingContent)
          ) : (
            <div className="chatdown-empty-state">
              <h2>{t('overlayPreparingArticleHeading')}</h2>
              <p>{t('overlayPreparingArticleDescription')}</p>
            </div>
          )}
        </div>
      );
    }

    if (!markdownContent) {
      return (
        <div className="chatdown-empty-state">
          <h2>{t('overlayNoArticleHeading')}</h2>
          <p>{t('overlayNoArticleDescription')}</p>
        </div>
      );
    }

    if (isEditing) {
      return (
        <div className="chatdown-window__scroll chatdown-window__scroll--editor">
          <EditorContent editor={editor} />
        </div>
      );
    }

    return (
      <div className="chatdown-window__scroll">
        {renderMarkdown(markdownContent)}
      </div>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="chatdown-overlay">
      <section className="chatdown-window" style={overlayStyle} lang={locale}>
        <header className="chatdown-window__header">
          <div className="chatdown-window__topbar">
            <div className="chatdown-window__drag-region" onPointerDown={startDrag}>
              <div className="chatdown-window__eyebrow">{t('appName')}</div>
              <div className="chatdown-window__title">{title}</div>
            </div>

            <button
              type="button"
              className="chatdown-icon-button"
              onClick={closeOverlay}
              title={t('commonClose')}
            >
              {t('commonClose')}
            </button>
          </div>

          {articleState?.notice ? (
            <div className="chatdown-banner">
              {articleState.notice}
            </div>
          ) : null}

          <div className="chatdown-window__toolbar">
            {isEditing ? (
              <>
                <span className="chatdown-status">{t('overlayStatusEditMode')}</span>
                <div className="chatdown-toolbar__buttons">
                  <button type="button" className="chatdown-secondary-button" onClick={handleCancel}>
                    {t('commonCancel')}
                  </button>
                  <button type="button" className="chatdown-primary-button" onClick={handleSave}>
                    {t('commonSave')}
                  </button>
                </div>
              </>
            ) : articleState?.phase === 'summarizing_rounds' ? (
              <span className="chatdown-status">{t('overlayStatusSummarizing')}</span>
            ) : articleState?.phase === 'selecting_rounds' ? (
              <span className="chatdown-status">{t('overlayStatusSelecting')}</span>
            ) : articleState?.phase === 'generating' ? (
              <span className="chatdown-status">{t('overlayStatusGenerating')}</span>
            ) : exporting ? (
              <span className="chatdown-status">
                {t(exportTarget === 'obsidian' ? 'overlayStatusExportingToObsidian' : 'overlayStatusExporting')}
              </span>
            ) : markdownContent ? (
              <>
                <span className="chatdown-status">{t('commonReady')}</span>
                <div className="chatdown-toolbar__buttons">
                  <div className="chatdown-menu" ref={regenerateMenuRef}>
                    <button
                      type="button"
                      className="chatdown-secondary-button"
                      onClick={() => setShowRegenerateMenu((current) => !current)}
                    >
                      {t('commonRegenerate')}
                    </button>

                    {showRegenerateMenu ? (
                      <div className="chatdown-menu__content">
                        <button
                          type="button"
                          className="chatdown-menu__item"
                          onClick={() => void handleRegenerate('full')}
                        >
                          {t('contentModeFullTitle')}
                        </button>
                        <button
                          type="button"
                          className="chatdown-menu__item"
                          onClick={() => void handleRegenerate('partial')}
                        >
                          {t('contentModePartialTitle')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button type="button" className="chatdown-secondary-button" onClick={handleEdit}>
                    {t('commonEdit')}
                  </button>
                  <div className="chatdown-menu" ref={exportMenuRef}>
                    <button
                      type="button"
                      className="chatdown-secondary-button"
                      onClick={() => setShowExportMenu((current) => !current)}
                    >
                      {t('commonExport')}
                    </button>

                    {showExportMenu ? (
                      <div className="chatdown-menu__content">
                        <button type="button" className="chatdown-menu__item" onClick={handleCopy}>
                          {t('overlayCopyToClipboard')}
                        </button>
                        <button type="button" className="chatdown-menu__item" onClick={handleDownload}>
                          {t('overlayDownloadMarkdown')}
                        </button>
                        <button type="button" className="chatdown-menu__item" onClick={handleExportToNotion}>
                          {t('overlayExportToNotion')}
                        </button>
                        <button type="button" className="chatdown-menu__item" onClick={handleExportToObsidian}>
                          {t('overlayExportToObsidian')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <span className="chatdown-status">{t('overlayStatusChooseGenerationMode')}</span>
            )}
          </div>
        </header>

        <div className="chatdown-window__body">
          {renderBody()}
        </div>

        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--top"
          onPointerDown={(event) => startResize(event, 'top')}
          aria-label={t('overlayResizeTop')}
          title={t('overlayResizeTop')}
        />
        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--right"
          onPointerDown={(event) => startResize(event, 'right')}
          aria-label={t('overlayResizeRight')}
          title={t('overlayResizeRight')}
        />
        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--bottom"
          onPointerDown={(event) => startResize(event, 'bottom')}
          aria-label={t('overlayResizeBottom')}
          title={t('overlayResizeBottom')}
        />
        <button
          type="button"
          className="chatdown-window__resize-edge chatdown-window__resize-edge--left"
          onPointerDown={(event) => startResize(event, 'left')}
          aria-label={t('overlayResizeLeft')}
          title={t('overlayResizeLeft')}
        />
      </section>
    </div>
  );
}
