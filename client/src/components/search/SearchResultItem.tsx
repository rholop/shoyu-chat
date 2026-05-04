import React from 'react';
import { SearchResult } from '../../api/search';

interface SearchResultItemProps {
  result: SearchResult;
  onSelect: (result: SearchResult) => void;
  isActive: boolean;
}

const TypeBadge: React.FC<{ type: SearchResult['type'] }> = ({ type }) => {
  const colors: Record<string, string> = {
    conversation: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    project: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
    summary: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    upload: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
    download: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  };

  return (
    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
      {type}
    </span>
  );
};

export const SearchResultItem: React.FC<SearchResultItemProps> = ({ result, onSelect, isActive }) => {
  return (
    <div
      className={`p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
        isActive ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onClick={() => onSelect(result)}
    >
      <div className="flex justify-between items-start mb-1">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate flex-1 mr-2">
          {result.title}
        </h4>
        <TypeBadge type={result.type} />
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2 italic">
        {result.snippet}
      </p>
      <div className="flex justify-between items-center text-[10px] text-gray-400 dark:text-gray-500">
        <span className="truncate">
          {result.projectName && `${result.projectName} > `}
          {result.conversationTitle || ''}
        </span>
        <span className="ml-2 whitespace-nowrap">
          {new Date(result.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};
