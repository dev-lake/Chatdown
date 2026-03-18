import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { marked } from 'marked';
import type { ChromeMessage } from '../types';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

export default function App() {
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Initialize Tiptap editor (only used in edit mode)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start editing...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 hover:underline',
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
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[500px]',
      },
    },
  });

  useEffect(() => {
    // Request last article when side panel opens
    const loadLastArticle = async () => {
      try {
        // Check if generation is in progress
        const generatingResponse = await chrome.runtime.sendMessage({ action: 'isGenerating' });
        const isCurrentlyGenerating = generatingResponse?.success || false;

        // Get the last article (might be partial if generating)
        const response = await chrome.runtime.sendMessage({ action: 'getLastArticle' });
        console.log('Received last article:', response, 'isGenerating:', isCurrentlyGenerating);

        if (response?.article) {
          if (isCurrentlyGenerating) {
            // Show as streaming content if generation is in progress
            setStreamingContent(response.article);
            setLoading(true);
          } else {
            // Show as completed article
            setMarkdownContent(response.article);
          }
        }
      } catch (error) {
        console.error('Failed to load last article:', error);
      }
    };

    loadLastArticle();

    // Listen for messages from background script
    const handleMessage = (message: ChromeMessage) => {
      console.log('Sidepanel received message:', message);

      if (message.action === 'displayArticle' && message.article) {
        setMarkdownContent(message.article);
        setLoading(false);
        setStreamingContent('');
        setIsEditing(false);
      } else if (message.action === 'generatingArticle') {
        setLoading(true);
        setMarkdownContent('');
        setStreamingContent('');
        setIsEditing(false);
      } else if (message.action === 'articleChunk' && message.chunk) {
        setStreamingContent(prev => prev + message.chunk);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleCopy = async () => {
    if (!markdownContent) return;
    await navigator.clipboard.writeText(markdownContent);
    alert('Copied to clipboard!');
  };

  const handleDownload = () => {
    if (!markdownContent) return;
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `chatdown-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEdit = async () => {
    setIsEditing(true);
    if (editor) {
      // Convert markdown to HTML for editing
      const html = await marked.parse(markdownContent);
      editor.commands.setContent(html);
      editor.commands.focus();
    }
  };

  const handleSave = () => {
    if (editor) {
      const html = editor.getHTML();
      // For now, save as HTML (we could convert back to markdown if needed)
      setMarkdownContent(html);
      setIsEditing(false);
      // Save to storage
      chrome.storage.local.set({ lastGeneratedArticle: html });
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

      const response = await chrome.runtime.sendMessage({ action: 'regenerateArticle' });

      if (response?.error) {
        alert(`Failed to regenerate: ${response.error}`);
        setLoading(false);
      }
      // Success case is handled by the message listener
    } catch (error) {
      console.error('Failed to regenerate article:', error);
      alert('Failed to regenerate article');
      setLoading(false);
    }
  };

  const renderMarkdown = (markdown: string) => {
    const html = marked.parse(markdown, { async: false }) as string;
    return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (loading || streamingContent) {
    return (
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 p-4 border-b bg-white">
          <div className="animate-pulse text-blue-600">✍️</div>
          <span className="text-sm text-gray-600">Generating article...</span>
        </div>

        {/* Streaming Content */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-4xl mx-auto py-6 px-8">
            {streamingContent && renderMarkdown(streamingContent)}
          </div>
        </div>
      </div>
    );
  }

  if (!markdownContent) {
    return (
      <div className="flex items-center justify-center h-screen p-6 bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800">No Article Yet</h2>
          <p className="text-gray-600">
            Click the Chatdown button on the chat page to generate an article from the conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header with Edit/Save buttons */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <span className="text-sm text-gray-600">Editing...</span>
              <span className="text-xs text-gray-400">(Click Save when done)</span>
            </>
          ) : (
            <span className="text-sm text-gray-600">Article</span>
          )}
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors"
                title="Save"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleRegenerate}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Regenerate article"
              >
                🔄
              </button>
              <button
                onClick={handleEdit}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Edit article"
              >
                ✏️
              </button>
              <button
                onClick={handleCopy}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Copy to clipboard"
              >
                📋
              </button>
              <button
                onClick={handleDownload}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Download as Markdown"
              >
                💾
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content - WYSIWYG Editor or Rendered View */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-4xl mx-auto py-6 px-8">
          {isEditing ? (
            <EditorContent editor={editor} />
          ) : (
            renderMarkdown(markdownContent)
          )}
        </div>
      </div>
    </div>
  );
}
