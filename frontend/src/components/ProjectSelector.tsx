import { useState, useEffect, useRef } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project } from '../types/project';
import { listProjects, createProject, deleteProject } from '../services/projectService';

interface ProjectSelectorProps {
  selectedProject: Project | null;
  onProjectChange: (project: Project | null) => void;
  disabled?: boolean;
}

export default function ProjectSelector({
  selectedProject,
  onProjectChange,
  disabled = false,
}: ProjectSelectorProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listProjects();
      setProjects(response.projects);
    } catch (err) {
      setError('Failed to load projects');
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const project = await createProject(newProjectName.trim());
      setProjects([project, ...projects]);
      onProjectChange(project);
      setNewProjectName('');
      setIsCreating(false);
      setIsOpen(false);
    } catch (err) {
      setError('Failed to create project');
      console.error('Failed to create project:', err);
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its documents?')) return;

    try {
      await deleteProject(projectId);
      const updatedProjects = projects.filter(p => p.id !== projectId);
      setProjects(updatedProjects);
      if (selectedProject?.id === projectId) {
        onProjectChange(null);
      }
    } catch (err) {
      setError('Failed to delete project');
      console.error('Failed to delete project:', err);
    }
  };

  const handleSelectProject = (project: Project) => {
    onProjectChange(project);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected project button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${theme.border} ${theme.buttonBg} ${
          disabled ? 'opacity-50 cursor-not-allowed' : `${theme.buttonHover} cursor-pointer`
        } transition-colors min-w-[180px]`}
      >
        <svg className={`w-4 h-4 ${theme.textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className={`text-sm ${theme.textSecondary} flex-1 text-left truncate`}>
          {isLoading ? 'Loading...' : selectedProject?.name || 'Select Project'}
        </span>
        <svg className={`w-4 h-4 ${theme.textMuted} transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`absolute top-full left-0 mt-1 w-72 rounded-lg border ${theme.border} shadow-lg z-50`}
          style={{ background: isDark ? '#1e293b' : '#ffffff' }}
        >
          {/* Create new project */}
          {isCreating ? (
            <div className={`p-3 border-b ${theme.border}`}>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                className={`w-full px-3 py-2 text-sm rounded-lg border ${theme.inputBorder} ${theme.inputBg} ${theme.textPrimary} focus:outline-none focus:ring-2 focus:ring-sky-500`}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  className="flex-1 px-3 py-1.5 text-sm text-white rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className={`px-3 py-1.5 text-sm ${theme.textMuted} ${theme.buttonBg} ${theme.buttonHover} rounded-lg transition-colors`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm ${theme.textSecondary} ${theme.buttonHover} border-b ${theme.border} transition-colors`}
            >
              <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          )}

          {/* Error message */}
          {error && (
            <div className={`px-3 py-2 text-sm text-red-400 bg-red-900/20 border-b ${theme.border}`}>
              {error}
            </div>
          )}

          {/* Project list */}
          <div className="max-h-64 overflow-y-auto">
            {projects.length === 0 ? (
              <div className={`px-3 py-4 text-sm ${theme.textSubtle} text-center`}>
                No projects yet. Create one to get started.
              </div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group ${
                    selectedProject?.id === project.id
                      ? isDark ? 'bg-sky-900/30' : 'bg-sky-50'
                      : theme.buttonHover
                  }`}
                >
                  <svg className={`w-4 h-4 ${selectedProject?.id === project.id ? 'text-sky-400' : theme.textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${theme.textSecondary} truncate`}>{project.name}</div>
                    <div className={`text-xs ${theme.textSubtle}`}>
                      {project.document_count} document{project.document_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteProject(e, project.id)}
                    className={`p-1 rounded opacity-0 group-hover:opacity-100 ${theme.buttonHover} text-red-400 hover:text-red-300 transition-all`}
                    title="Delete project"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Clear selection option */}
          {selectedProject && (
            <button
              onClick={() => {
                onProjectChange(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm ${theme.textMuted} ${theme.buttonHover} border-t ${theme.border} transition-colors`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear Selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
