import React, { useEffect, useRef } from 'react';
import { useSearch } from '../../hooks/useSearch';
import { SearchResultItem } from './SearchResultItem';
import { SearchResult } from '../../api/search';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  onSelectConversation: (conversationId: string, msgId?: string) => void;
  onSelectProject: (projectId: string) => void;
}

export const SearchPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  onSelectConversation,
  onSelectProject,
}) => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const { query, setQuery, results, isLoading } = useSearch({ projectId });
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setActiveIndex(0);
    } else {
      setQuery('');
    }
  }, [isOpen, setQuery]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    if (result.type === 'conversation' || result.type === 'upload' || result.type === 'download') {
      const msgId = result.id.startsWith('msg-') ? result.id.split('-')[2] : undefined;
      onSelectConversation(result.conversationId!, msgId);
    } else if (result.type === 'project') {
      onSelectProject(result.projectId!);
    } else if (result.type === 'summary') {
      alert(`Summary view not yet implemented. Source: ${result.sourcePath}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) handleSelect(results[activeIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={paletteRef}
        className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden relative border border-gray-200 dark:border-gray-800"
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-lg text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400"
            placeholder="Search everything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading && (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full mb-2" />
              <p className="text-sm">Searching...</p>
            </div>
          )}

          {!isLoading && results.length > 0 && (
            <div>
              {results.map((result, idx) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  isActive={idx === activeIndex}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}

          {!isLoading && query && results.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <p className="text-lg mb-1">No results found</p>
              <p className="text-sm">Try a different keyword or phrase</p>
            </div>
          )}

          {!isLoading && !query && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-sm">Type to start searching across conversations, projects, and summaries.</p>
            </div>
          )}
        </div>

        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-between text-[10px] text-gray-400">
          <div className="flex gap-3">
            <span><kbd className="font-sans border px-1 rounded">↑↓</kbd> to navigate</span>
            <span><kbd className="font-sans border px-1 rounded">↵</kbd> to select</span>
            <span><kbd className="font-sans border px-1 rounded">esc</kbd> to close</span>
          </div>
          {projectId && (
            <div className="text-blue-500 font-medium">
              Boosting results for current project
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
