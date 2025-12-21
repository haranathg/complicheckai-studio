/**
 * Panel for managing project settings including work type and model preferences
 */
import { useState, useEffect } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { ProjectSettings, WorkTypeTemplate, ProjectSettingsUpdate } from '../types/checksV2';
import { getProjectSettings, updateProjectSettings, getWorkTypeTemplates } from '../services/checksService';

interface ProjectSettingsPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: ProjectSettings) => void;
}

const WORK_TYPE_ICONS: Record<string, string> = {
  solid_fuel_heater: 'fire',
  new_dwelling: 'home',
  minor_works: 'tool',
  commercial_fitout: 'building',
  demolition: 'trash',
  custom: 'settings',
};

export default function ProjectSettingsPanel({
  projectId,
  isOpen,
  onClose,
  onSettingsChange,
}: ProjectSettingsPanelProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [templates, setTemplates] = useState<WorkTypeTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<ProjectSettingsUpdate>({});

  useEffect(() => {
    if (isOpen && projectId) {
      loadData();
    }
  }, [isOpen, projectId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [settingsData, templatesData] = await Promise.all([
        getProjectSettings(projectId),
        getWorkTypeTemplates(),
      ]);
      setSettings(settingsData);
      setTemplates(templatesData.templates);
      setPendingChanges({});
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (key: keyof ProjectSettingsUpdate, value: string) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return;

    setIsSaving(true);
    try {
      const response = await updateProjectSettings(projectId, pendingChanges);
      setSettings(prev => prev ? { ...prev, ...response.settings } : prev);
      setPendingChanges({});
      onSettingsChange?.(response.settings as ProjectSettings);
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkTypeSelect = async (workType: string) => {
    setIsSaving(true);
    try {
      const response = await updateProjectSettings(projectId, { work_type: workType });
      setSettings(prev => prev ? {
        ...prev,
        ...response.settings,
        required_documents: response.settings.required_documents || [],
        optional_documents: response.settings.optional_documents || [],
      } : prev);
      setPendingChanges({});
      onSettingsChange?.(response.settings as ProjectSettings);
    } catch (err) {
      setError('Failed to update work type');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentWorkType = pendingChanges.work_type || settings?.work_type || 'custom';
  const currentTemplate = templates.find(t => t.id === currentWorkType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className={`
        relative w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl shadow-xl
        ${isDark ? 'bg-gray-900' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          sticky top-0 px-6 py-4 border-b flex items-center justify-between
          ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}
        `}>
          <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Project Settings
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600"
              >
                Retry
              </button>
            </div>
          ) : settings && (
            <>
              {/* Work Type Selection */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Work Type Template
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {templates.map((template) => {
                    const isSelected = currentWorkType === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleWorkTypeSelect(template.id)}
                        disabled={isSaving}
                        className={`
                          p-4 rounded-lg border-2 text-left transition-all
                          ${isSelected
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                            : isDark
                              ? 'border-gray-700 hover:border-gray-600'
                              : 'border-gray-200 hover:border-gray-300'}
                          ${isSaving ? 'opacity-50 cursor-wait' : ''}
                        `}
                      >
                        <div className={`font-medium text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                          {template.name}
                        </div>
                        <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {template.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Required Documents */}
              {currentTemplate && (
                <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Required Documents
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {settings.required_documents.map((doc) => (
                      <span
                        key={doc}
                        className="px-2 py-1 text-xs rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300"
                      >
                        {doc.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {settings.required_documents.length === 0 && (
                      <span className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        No required documents for this work type
                      </span>
                    )}
                  </div>
                  {settings.optional_documents.length > 0 && (
                    <>
                      <h4 className={`text-sm font-medium mt-4 mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Optional Documents
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {settings.optional_documents.map((doc) => (
                          <span
                            key={doc}
                            className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                          >
                            {doc.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Model Settings */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Model Preferences
                </h3>
                <div className="space-y-4">
                  {/* Parser */}
                  <div>
                    <label className={`block text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Vision Parser
                    </label>
                    <select
                      value={pendingChanges.vision_parser ?? settings.vision_parser}
                      onChange={(e) => handleChange('vision_parser', e.target.value)}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${isDark
                          ? 'bg-gray-800 border-gray-700 text-gray-200'
                          : 'bg-white border-gray-300 text-gray-800'}
                      `}
                    >
                      <option value="landing_ai">Landing AI</option>
                      <option value="claude_vision">Claude Vision</option>
                      <option value="bedrock_claude">AWS Bedrock Claude</option>
                      <option value="gemini_vision">Google Gemini</option>
                    </select>
                  </div>

                  {/* Chat Model */}
                  <div>
                    <label className={`block text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Chat Model
                    </label>
                    <select
                      value={pendingChanges.chat_model ?? settings.chat_model}
                      onChange={(e) => handleChange('chat_model', e.target.value)}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${isDark
                          ? 'bg-gray-800 border-gray-700 text-gray-200'
                          : 'bg-white border-gray-300 text-gray-800'}
                      `}
                    >
                      <option value="bedrock-claude-sonnet-3.5">Claude Sonnet 3.5</option>
                      <option value="bedrock-claude-opus-3">Claude Opus 3</option>
                      <option value="bedrock-nova-pro">Amazon Nova Pro</option>
                    </select>
                  </div>

                  {/* Compliance Model */}
                  <div>
                    <label className={`block text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Compliance Check Model
                    </label>
                    <select
                      value={pendingChanges.compliance_model ?? settings.compliance_model}
                      onChange={(e) => handleChange('compliance_model', e.target.value)}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${isDark
                          ? 'bg-gray-800 border-gray-700 text-gray-200'
                          : 'bg-white border-gray-300 text-gray-800'}
                      `}
                    >
                      <option value="bedrock-claude-sonnet-3.5">Claude Sonnet 3.5</option>
                      <option value="bedrock-claude-opus-3">Claude Opus 3</option>
                      <option value="bedrock-nova-pro">Amazon Nova Pro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Usage Stats */}
              <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Project Usage
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className={`text-lg font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      {settings.usage.total_parse_credits.toLocaleString()}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Parse Credits</div>
                  </div>
                  <div>
                    <div className={`text-lg font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      {settings.usage.total_input_tokens.toLocaleString()}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Input Tokens</div>
                  </div>
                  <div>
                    <div className={`text-lg font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      {settings.usage.total_output_tokens.toLocaleString()}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Output Tokens</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {settings && Object.keys(pendingChanges).length > 0 && (
          <div className={`
            sticky bottom-0 px-6 py-4 border-t flex justify-end gap-3
            ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}
          `}>
            <button
              onClick={() => setPendingChanges({})}
              className={`px-4 py-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
