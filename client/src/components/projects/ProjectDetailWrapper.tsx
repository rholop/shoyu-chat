import { useParams, useNavigate } from 'react-router-dom';
import ProjectDetail from './ProjectDetail';
import { useProject, useProjects } from '../../hooks/useProjects';

export default function ProjectDetailWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { project, updateContext } = useProject(id!);
  const { update } = useProjects();

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ProjectDetail
      project={project}
      onBack={() => navigate('/chat')}
      onDelete={() => navigate('/chat')}
      onSelectConversation={(convId) => navigate(`/chat/${convId}`)}
      onNewChat={() => {}} // Handle new chat in project
      onUpdateName={(name) => update(id!, { name })}
      onUpdateDescription={(description) => update(id!, { description })}
      onUpdateContext={updateContext}
    />
  );
}
