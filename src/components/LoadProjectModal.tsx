import React, { useState, useEffect } from 'react';
import LoaderIcon from './icons/LoaderIcon';

interface LoadProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (projectData: any) => void;
  client: any; // Amplify Data Client
}

const LoadProjectModal: React.FC<LoadProjectModalProps> = ({ isOpen, onClose, onLoad, client }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const { data: items } = await client.models.Project.list();
      // Sort by updatedAt desc (if available in metadata) or just reverse for now
      setProjects(items);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Load Cloud Project</h2>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><LoaderIcon /></div>
          ) : projects.length > 0 ? (
            <ul className="space-y-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    onClick={() => onLoad(project)}
                    className="w-full text-left px-4 py-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-200 dark:border-slate-600 transition-colors"
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">{project.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Updated: {new Date(project.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">No saved projects found.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadProjectModal;