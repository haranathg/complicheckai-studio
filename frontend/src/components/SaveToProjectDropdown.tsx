import { useState, useEffect, useRef } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project } from '../types/project';
import { listProjects } from '../services/projectService';

interface SaveToProjectDropdownProps {
  onSave: (project: Project) => void;
  currentProject: Project | null;
}

export default function SaveToProjectDropdown({
  onSave,
  currentProject,
}: SaveToProjectDropdownProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load projects when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const response = await listProjects();
      setProjects(response.projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProject = (project: Project) => {
    onSave(project);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
          isDark
            ? 'bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30'
            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
        }`}
        title="Save document to a project"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        Save
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 top-full mt-1 w-56 rounded-lg shadow-lg border z-50 ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          <div className={`px-3 py-2 border-b ${theme.border}`}>
            <p className={`text-xs font-medium ${theme.textMuted}`}>Save to project</p>
          </div>

          {isLoading ? (
            <div className={`flex items-center justify-center py-4 ${theme.textSubtle}`}>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : projects.length === 0 ? (
            <div className={`px-3 py-4 text-center text-sm ${theme.textSubtle}`}>
              No projects available
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto py-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    isDark
                      ? 'hover:bg-slate-700 text-gray-300'
                      : 'hover:bg-slate-50 text-slate-700'
                  } ${currentProject?.id === project.id ? (isDark ? 'bg-slate-700/50' : 'bg-slate-100') : ''}`}
                >
                  <svg className={`w-4 h-4 ${theme.textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="flex-1 truncate">{project.name}</span>
                  {currentProject?.id === project.id && (
                    <span className={`text-xs ${theme.textSubtle}`}>(current)</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
