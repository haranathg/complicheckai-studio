import { useState } from 'react';

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
}

interface ExtractPanelProps {
  markdown: string;
  disabled: boolean;
}

const PRESET_SCHEMAS = {
  invoice: [
    { name: 'invoice_number', type: 'string' as const, description: 'Invoice number or ID', required: true },
    { name: 'date', type: 'string' as const, description: 'Invoice date', required: true },
    { name: 'vendor', type: 'string' as const, description: 'Vendor or company name', required: true },
    { name: 'total', type: 'number' as const, description: 'Total amount', required: true },
    { name: 'line_items', type: 'array' as const, description: 'List of line items', required: false },
  ],
  receipt: [
    { name: 'store_name', type: 'string' as const, description: 'Store or merchant name', required: true },
    { name: 'date', type: 'string' as const, description: 'Transaction date', required: true },
    { name: 'total', type: 'number' as const, description: 'Total amount', required: true },
    { name: 'payment_method', type: 'string' as const, description: 'Payment method used', required: false },
  ],
  resume: [
    { name: 'name', type: 'string' as const, description: 'Candidate full name', required: true },
    { name: 'email', type: 'string' as const, description: 'Email address', required: true },
    { name: 'phone', type: 'string' as const, description: 'Phone number', required: false },
    { name: 'skills', type: 'array' as const, description: 'List of skills', required: false },
    { name: 'experience_years', type: 'number' as const, description: 'Years of experience', required: false },
  ],
};

export default function ExtractPanel({ markdown, disabled }: ExtractPanelProps) {
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
      const response = await fetch('http://localhost:8000/api/extract', {
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

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <p>Parse a document first to extract data</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
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
      </div>
    </div>
  );
}
