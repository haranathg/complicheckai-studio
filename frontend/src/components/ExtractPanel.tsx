import { useState } from 'react';
import { API_URL } from '../config';
import ModelSelector from './ModelSelector';
import ParserSelector from './ParserSelector';
import { formatTokensWithCost } from '../utils/tokenCost';

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
}

interface UsageData {
  input_tokens: number;
  output_tokens: number;
  model?: string;
}

interface ExtractPanelProps {
  markdown: string;
  disabled: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  selectedParser: string;
  onParserChange: (parser: string) => void;
  chatUsage?: UsageData;
  complianceUsage?: UsageData;
  parseCredits?: number | null;
  parseUsage?: UsageData | null;
}

const PRESET_SCHEMAS = {
  'project info': [
    { name: 'project_name', type: 'string' as const, description: 'Name or title of the project', required: true },
    { name: 'project_type', type: 'string' as const, description: 'Type of work (new build, alteration, addition)', required: true },
    { name: 'consent_number', type: 'string' as const, description: 'Building consent or application number', required: false },
    { name: 'date', type: 'string' as const, description: 'Date of plans or submission', required: true },
    { name: 'revision', type: 'string' as const, description: 'Drawing revision number', required: false },
  ],
  'applicant': [
    { name: 'applicant_name', type: 'string' as const, description: 'Name of applicant or owner', required: true },
    { name: 'contact_phone', type: 'string' as const, description: 'Contact phone number', required: false },
    { name: 'contact_email', type: 'string' as const, description: 'Contact email address', required: false },
    { name: 'designer_name', type: 'string' as const, description: 'Name of designer or architect', required: false },
    { name: 'designer_company', type: 'string' as const, description: 'Design company name', required: false },
  ],
  'site details': [
    { name: 'site_address', type: 'string' as const, description: 'Full street address of the site', required: true },
    { name: 'legal_description', type: 'string' as const, description: 'Legal lot and DP reference', required: true },
    { name: 'site_area_sqm', type: 'number' as const, description: 'Total site area in square meters', required: true },
    { name: 'site_coverage_percent', type: 'number' as const, description: 'Building coverage percentage', required: false },
    { name: 'zone', type: 'string' as const, description: 'District plan zone (residential, rural, etc)', required: false },
  ],
  'building': [
    { name: 'building_area_sqm', type: 'number' as const, description: 'Gross floor area of building', required: true },
    { name: 'building_height_m', type: 'number' as const, description: 'Maximum building height in meters', required: false },
    { name: 'num_storeys', type: 'number' as const, description: 'Number of storeys', required: false },
    { name: 'construction_type', type: 'string' as const, description: 'Construction materials (timber, steel, etc)', required: false },
    { name: 'setbacks', type: 'array' as const, description: 'Boundary setback distances', required: false },
  ],
};

export default function ExtractPanel({ markdown, disabled, selectedModel, onModelChange, selectedParser, onParserChange, chatUsage, complianceUsage, parseCredits, parseUsage }: ExtractPanelProps) {
  const [fields, setFields] = useState<SchemaField[]>([
    { name: '', type: 'string', description: '', required: false },
  ]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addField = () => {
    setFields([...fields, { name: '', type: 'string', description: '', required: false }]);
  };

  const updateField = (index: number, updates: Partial<SchemaField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => {
    if (fields.length > 1) {
      setFields(fields.filter((_, i) => i !== index));
    }
  };

  const loadPreset = (preset: keyof typeof PRESET_SCHEMAS) => {
    setFields(PRESET_SCHEMAS[preset]);
  };

  const buildSchema = () => {
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];

    fields.forEach((field) => {
      if (field.name) {
        properties[field.name] = {
          type: field.type,
          description: field.description,
        };
        if (field.required) required.push(field.name);
      }
    });

    return {
      type: 'object',
      properties,
      required,
    };
  };

  const handleExtract = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          schema_def: buildSchema(),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Extraction failed');
      }

      const data = await response.json();
      setResult(data.extraction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        {/* Settings Section - Always visible */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Settings</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-24">Parser:</span>
              <ParserSelector
                selectedParser={selectedParser}
                onParserChange={onParserChange}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-24">Chat/Compliance:</span>
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                parser="bedrock_claude"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Parser: Used for document processing. Chat/Compliance: Model used for Chat and Compliance checks.
          </p>

          {/* Usage Stats */}
          {(parseCredits || parseUsage || chatUsage || complianceUsage) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Usage</h5>
              <div className="space-y-1.5">
                {parseCredits != null && parseCredits > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Parse (Landing AI):</span>
                    <span className="text-gray-600 font-mono">{parseCredits} credits</span>
                  </div>
                )}
                {parseUsage && parseUsage.input_tokens > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Parse (Claude Vision):</span>
                    <span className="text-gray-600 font-mono">
                      {formatTokensWithCost(parseUsage.input_tokens, parseUsage.output_tokens, parseUsage.model)}
                    </span>
                  </div>
                )}
                {chatUsage && chatUsage.input_tokens > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Chat:</span>
                    <span className="text-gray-600 font-mono">
                      {formatTokensWithCost(chatUsage.input_tokens, chatUsage.output_tokens, chatUsage.model)}
                    </span>
                  </div>
                )}
                {complianceUsage && complianceUsage.input_tokens > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Compliance:</span>
                    <span className="text-gray-600 font-mono">
                      {formatTokensWithCost(complianceUsage.input_tokens, complianceUsage.output_tokens, complianceUsage.model)}
                    </span>
                  </div>
                )}
                {(() => {
                  const totalInput = (parseUsage?.input_tokens || 0) + (chatUsage?.input_tokens || 0) + (complianceUsage?.input_tokens || 0);
                  const totalOutput = (parseUsage?.output_tokens || 0) + (chatUsage?.output_tokens || 0) + (complianceUsage?.output_tokens || 0);
                  const model = parseUsage?.model || chatUsage?.model || complianceUsage?.model;
                  if (totalInput > 0) {
                    return (
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200">
                        <span className="text-gray-600 font-medium">Total Tokens:</span>
                        <span className="text-gray-700 font-mono font-medium">
                          {formatTokensWithCost(totalInput, totalOutput, model)}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Data Extraction Section - requires parsed document */}
        {disabled ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <p className="text-sm">Parse a document first to use data extraction</p>
          </div>
        ) : (
          <>
            {/* Preset Templates */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Start Templates</h4>
              <div className="flex gap-2">
                {Object.keys(PRESET_SCHEMAS).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => loadPreset(preset as keyof typeof PRESET_SCHEMAS)}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg capitalize transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Schema Builder */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Define Extraction Schema</h4>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      placeholder="Field name"
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      className="border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value as SchemaField['type'] })}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="array">Array</option>
                    </select>
                    <input
                      placeholder="Description"
                      value={field.description}
                      onChange={(e) => updateField(index, { description: e.target.value })}
                      className="border rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                        className="rounded"
                      />
                      Req
                    </label>
                    <button
                      onClick={() => removeField(index)}
                      disabled={fields.length === 1}
                      className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mb-6">
              <button
                onClick={addField}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Field
              </button>
              <button
                onClick={handleExtract}
                disabled={isLoading || !fields.some((f) => f.name)}
                className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Extracting...
                  </>
                ) : (
                  'Extract Data'
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="bg-gray-50 rounded-lg border p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Extraction Results</h4>
                <div className="space-y-3">
                  {Object.entries(result).map(([key, value]) => (
                    <div key={key} className="bg-white rounded-lg p-3 border">
                      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{key}</div>
                      <div className="text-gray-800">
                        {typeof value === 'object' ? (
                          <pre className="text-sm font-mono overflow-x-auto">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          String(value)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
