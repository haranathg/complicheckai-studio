import { useState } from 'react';
import type { ComplianceCheck } from '../types/compliance';

interface ComplianceChecksManagerProps {
  completenessChecks: ComplianceCheck[];
  complianceChecks: ComplianceCheck[];
  onCompletenessChecksChange: (checks: ComplianceCheck[]) => void;
  onComplianceChecksChange: (checks: ComplianceCheck[]) => void;
}

type CheckType = 'completeness' | 'compliance';

const CATEGORIES = {
  completeness: ['identification', 'drawing_standards', 'site_information'],
  compliance: ['zoning', 'services', 'access', 'approval', 'fire_safety', 'legal'],
};

export default function ComplianceChecksManager({
  completenessChecks,
  complianceChecks,
  onCompletenessChecksChange,
  onComplianceChecksChange,
}: ComplianceChecksManagerProps) {
  const [activeTab, setActiveTab] = useState<CheckType>('completeness');
  const [editingCheck, setEditingCheck] = useState<ComplianceCheck | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const checks = activeTab === 'completeness' ? completenessChecks : complianceChecks;
  const setChecks = activeTab === 'completeness' ? onCompletenessChecksChange : onComplianceChecksChange;

  const generateId = (type: CheckType) => {
    const prefix = type === 'completeness' ? 'comp_' : 'comply_';
    const existingIds = checks.map(c => parseInt(c.id.replace(prefix, '')) || 0);
    const nextId = Math.max(0, ...existingIds) + 1;
    return `${prefix}${String(nextId).padStart(3, '0')}`;
  };

  const createEmptyCheck = (): ComplianceCheck => ({
    id: generateId(activeTab),
    name: '',
    description: '',
    category: CATEGORIES[activeTab][0],
    required: activeTab === 'completeness' ? true : undefined,
    search_terms: [],
    rule_reference: activeTab === 'compliance' ? '' : undefined,
  });

  const handleAdd = () => {
    setEditingCheck(createEmptyCheck());
    setIsAdding(true);
  };

  const handleEdit = (check: ComplianceCheck) => {
    setEditingCheck({ ...check });
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this check?')) {
      setChecks(checks.filter(c => c.id !== id));
    }
  };

  const handleSave = () => {
    if (!editingCheck || !editingCheck.name.trim()) return;

    if (isAdding) {
      setChecks([...checks, editingCheck]);
    } else {
      setChecks(checks.map(c => c.id === editingCheck.id ? editingCheck : c));
    }
    setEditingCheck(null);
    setIsAdding(false);
  };

  const handleCancel = () => {
    setEditingCheck(null);
    setIsAdding(false);
  };

  const updateEditingCheck = (updates: Partial<ComplianceCheck>) => {
    if (editingCheck) {
      setEditingCheck({ ...editingCheck, ...updates });
    }
  };

  const handleSearchTermsChange = (value: string) => {
    const terms = value.split(',').map(t => t.trim()).filter(t => t);
    updateEditingCheck({ search_terms: terms });
  };

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">Compliance Checks Configuration</h4>
          <button
            onClick={handleAdd}
            disabled={!!editingCheck}
            className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Check
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { setActiveTab('completeness'); setEditingCheck(null); }}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'completeness'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Completeness ({completenessChecks.length})
          </button>
          <button
            onClick={() => { setActiveTab('compliance'); setEditingCheck(null); }}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'compliance'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Compliance ({complianceChecks.length})
          </button>
        </div>
      </div>

      {/* Edit Form */}
      {editingCheck && (
        <div className="p-4 border-b bg-blue-50">
          <h5 className="text-xs font-medium text-gray-600 mb-3">
            {isAdding ? 'Add New Check' : 'Edit Check'}
          </h5>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input
                  type="text"
                  value={editingCheck.name}
                  onChange={(e) => updateEditingCheck({ name: e.target.value })}
                  placeholder="Check name"
                  className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <select
                  value={editingCheck.category}
                  onChange={(e) => updateEditingCheck({ category: e.target.value })}
                  className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {CATEGORIES[activeTab].map(cat => (
                    <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input
                type="text"
                value={editingCheck.description}
                onChange={(e) => updateEditingCheck({ description: e.target.value })}
                placeholder="What this check verifies"
                className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search Terms (comma separated)</label>
              <input
                type="text"
                value={editingCheck.search_terms?.join(', ') || ''}
                onChange={(e) => handleSearchTermsChange(e.target.value)}
                placeholder="term1, term2, term3"
                className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {activeTab === 'compliance' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rule Reference</label>
                <input
                  type="text"
                  value={editingCheck.rule_reference || ''}
                  onChange={(e) => updateEditingCheck({ rule_reference: e.target.value })}
                  placeholder="e.g., District Plan - Site Coverage"
                  className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            {activeTab === 'completeness' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="required"
                  checked={editingCheck.required || false}
                  onChange={(e) => updateEditingCheck({ required: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="required" className="text-xs text-gray-600">Required field</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={!editingCheck.name.trim()}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAdding ? 'Add' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checks List */}
      <div className="max-h-64 overflow-auto">
        {checks.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            No checks configured. Click "Add Check" to create one.
          </div>
        ) : (
          <div className="divide-y">
            {checks.map((check) => (
              <div
                key={check.id}
                className={`p-3 hover:bg-gray-50 ${expandedId === check.id ? 'bg-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === check.id ? null : check.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{check.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {check.category.replace('_', ' ')}
                      </span>
                      {activeTab === 'completeness' && check.required && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">
                          required
                        </span>
                      )}
                    </div>
                    {expandedId === check.id && (
                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                        <p>{check.description}</p>
                        {check.search_terms && check.search_terms.length > 0 && (
                          <p><span className="text-gray-400">Search terms:</span> {check.search_terms.join(', ')}</p>
                        )}
                        {check.rule_reference && (
                          <p><span className="text-gray-400">Rule:</span> {check.rule_reference}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(check)}
                      disabled={!!editingCheck}
                      className="p-1 text-gray-400 hover:text-blue-500 disabled:opacity-30"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(check.id)}
                      disabled={!!editingCheck}
                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t bg-gray-50 rounded-b-lg">
        <p className="text-[10px] text-gray-400">
          {activeTab === 'completeness'
            ? 'Completeness checks verify that required information is present in the document.'
            : 'Compliance checks verify that values meet regulatory requirements and thresholds.'}
        </p>
      </div>
    </div>
  );
}
