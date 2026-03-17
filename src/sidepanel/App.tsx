import { useState, useEffect } from 'react';
import { marked } from 'marked';
import type { ChromeMessage } from '../types';

export default function App() {
  const [article, setArticle] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown'>('preview');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

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
            setArticle(response.article);
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
        setArticle(message.article);
        setLoading(false);
        setStreamingContent('');
      } else if (message.action === 'generatingArticle') {
        setLoading(true);
        setArticle(null);
        setStreamingContent('');
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
    if (!article) return;
    await navigator.clipboard.writeText(article);
    alert('Copied to clipboard!');
  };

  const handleDownload = () => {
    if (!article) return;
    const blob = new Blob([article], { type: 'text/markdown' });
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

  const renderPreview = () => {
    const content = article || streamingContent;
    if (!content) return null;
    const html = marked(content);
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

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b bg-white">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'preview'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab('markdown')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'markdown'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Markdown
          </button>
        </div>

        {/* Streaming Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {streamingContent ? (
            activeTab === 'preview' ? (
              renderPreview()
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">{streamingContent}</pre>
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin text-4xl mb-4">⏳</div>
                <p className="text-gray-600">Waiting for response...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex items-center justify-center h-screen p-6 bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800">No Article Yet</h2>
          <p className="text-gray-600">
            Click the 📝 button on the chat page to generate an article from the conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b bg-white">
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'preview'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab('markdown')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'markdown'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Markdown
        </button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {activeTab === 'preview' ? (
          renderPreview()
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">{article}</pre>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 flex gap-2 p-2 border-t bg-white justify-end">
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
      </div>
    </div>
  );
}
