import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useProjectSuggestions,
  useCreateProjectFromSuggestion,
  useDismissSuggestion,
} from '../../hooks/useProjectSuggestions';

export const ProjectSuggestionBanner: React.FC = () => {
  const navigate = useNavigate();
  const { data: suggestions, isLoading } = useProjectSuggestions();
  const createMutation = useCreateProjectFromSuggestion();
  const dismissMutation = useDismissSuggestion();

  if (isLoading || !suggestions || suggestions.length === 0) {
    return null;
  }

  // Show only the first suggestion
  const suggestion = suggestions[0];

  const handleCreate = async () => {
    try {
      const { projectId } = await createMutation.mutateAsync(suggestion.topic);
      navigate(`/chat/projects/${projectId}`);
    } catch (err) {
      // Error handled by UI state
    }
  };

  const handleDismiss = () => {
    dismissMutation.mutate(suggestion.topic);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="mx-2 mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 font-medium text-indigo-900 dark:text-indigo-100">
            <span>💡</span>
            <span>
              You've explored "{suggestion.topic}" {suggestion.conversationCount} times without a project
            </span>
          </div>
          <div className="mt-1 text-xs text-indigo-700/80 dark:text-indigo-300/60">
            {formatDate(suggestion.firstSeen)} – {formatDate(suggestion.lastSeen)} • {suggestion.weekCount} weeks
          </div>

          {suggestion.relatedGoals.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-900/50 dark:text-indigo-100/30">
                Recent goals
              </div>
              <ul className="mt-1 space-y-1">
                {suggestion.relatedGoals.map((goal, i) => (
                  <li key={i} className="flex items-start gap-2 text-indigo-800 dark:text-indigo-200">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                    <span className="line-clamp-2">{goal}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {createMutation.isError && (
            <div className="mt-3 text-xs text-red-600 dark:text-red-400">
              Failed to create project. Try again.
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
            <button
              onClick={handleDismiss}
              disabled={dismissMutation.isPending}
              className="rounded px-3 py-1.5 font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/50 disabled:opacity-50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
