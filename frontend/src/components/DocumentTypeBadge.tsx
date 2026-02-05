/**
 * Badge component for displaying document type classification
 * Supports both V2 document-level types and V3 page-level types
 */
import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface DocumentTypeBadgeProps {
  documentType?: string;
  confidence?: number;
  isOverride?: boolean;
  onClassify?: () => void;
  onChangeType?: (type: string) => void;
  availableTypes?: Array<{ id: string; name: string }>;
  isClassifying?: boolean;
  // V3 page-level types
  pageTypes?: string[];
}

// V2 document-level type labels
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  record_of_title: 'Record of Title',
  site_plan: 'Site Plan',
  floor_plan: 'Floor Plan',
  elevation: 'Elevation',
  product_specification: 'Product Spec',
  producer_statement: 'Producer Statement',
  inspection_report: 'Inspection Report',
  authorised_product_list: 'Authorised Products',
  construction_detail: 'Construction Detail',
  building_consent_form: 'Building Consent Form',
  code_compliance_certificate: 'CCC',
  unknown: 'Unclassified',
};

// V3 page-level type labels (from compliance_checks_v3.json)
const PAGE_TYPE_LABELS: Record<string, string> = {
  floor_plan: 'Floor Plan',
  site_plan: 'Site Plan',
  elevation: 'Elevation',
  section: 'Section',
  detail: 'Detail',
  schedule: 'Schedule',
  cover_sheet: 'Cover Sheet',
  form: 'Form',
  letter: 'Letter',
  certificate: 'Certificate',
  report: 'Report',
  photo: 'Photo',
  table: 'Table',
  specification: 'Specification',
  unknown: 'Unknown',
};

const DOCUMENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  record_of_title: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  site_plan: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  floor_plan: { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
  elevation: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
  product_specification: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  producer_statement: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  inspection_report: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  authorised_product_list: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  construction_detail: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  building_consent_form: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
  code_compliance_certificate: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  section: { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-300' },
  detail: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  schedule: { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-300' },
  cover_sheet: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300' },
  form: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
  letter: { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300' },
  certificate: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  report: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
  photo: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-300' },
  table: { bg: 'bg-neutral-100', text: 'text-neutral-800', border: 'border-neutral-300' },
  specification: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  multiple: { bg: 'bg-gradient-to-r from-blue-100 via-purple-100 to-pink-100', text: 'text-purple-800', border: 'border-purple-300' },
  unknown: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
};

export default function DocumentTypeBadge({
  documentType,
  confidence,
  isOverride,
  onClassify,
  onChangeType,
  availableTypes,
  isClassifying = false,
  pageTypes,
}: DocumentTypeBadgeProps) {
  const { isDark } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Determine what to display:
  // 1. If pageTypes has multiple entries, show "Multiple"
  // 2. If pageTypes has one entry, show that page type
  // 3. Fall back to V2 documentType
  const hasMultipleTypes = pageTypes && pageTypes.length > 1;
  const hasSinglePageType = pageTypes && pageTypes.length === 1;

  let displayType: string;
  let displayLabel: string;

  if (hasMultipleTypes) {
    displayType = 'multiple';
    displayLabel = 'Multiple';
  } else if (hasSinglePageType) {
    displayType = pageTypes[0];
    displayLabel = PAGE_TYPE_LABELS[pageTypes[0]] || pageTypes[0];
  } else if (documentType) {
    displayType = documentType;
    displayLabel = DOCUMENT_TYPE_LABELS[documentType] || documentType;
  } else {
    displayType = 'unknown';
    displayLabel = 'Unclassified';
  }

  const colors = DOCUMENT_TYPE_COLORS[displayType] || DOCUMENT_TYPE_COLORS.unknown;

  const handleTypeSelect = (newType: string) => {
    onChangeType?.(newType);
    setShowDropdown(false);
  };

  // Show classify button if no type info at all
  if (!documentType && (!pageTypes || pageTypes.length === 0)) {
    return (
      <button
        onClick={onClassify}
        disabled={isClassifying}
        className={`
          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
          bg-gray-100 text-gray-600 border border-gray-300 border-dashed
          hover:bg-gray-200 transition-colors cursor-pointer
          ${isClassifying ? 'opacity-50 cursor-wait' : ''}
        `}
      >
        {isClassifying ? (
          <>
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Classifying...
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Classify
          </>
        )}
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => onChangeType && setShowDropdown(!showDropdown)}
        onMouseEnter={() => hasMultipleTypes && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
          ${colors.bg} ${colors.text} border ${colors.border}
          ${onChangeType ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}
          transition-opacity
        `}
      >
        {hasMultipleTypes && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )}
        <span>{displayLabel}</span>
        {hasMultipleTypes && (
          <span className="opacity-70">({pageTypes.length})</span>
        )}
        {confidence !== undefined && confidence < 100 && !isOverride && !hasMultipleTypes && (
          <span className="opacity-60">({confidence}%)</span>
        )}
        {isOverride && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        )}
        {onChangeType && (
          <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Tooltip showing all page types when Multiple */}
      {showTooltip && hasMultipleTypes && (
        <div className={`
          absolute z-50 bottom-full left-0 mb-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap
          ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-white'}
          shadow-lg
        `}>
          <div className="font-medium mb-1">Page Types:</div>
          <div className="flex flex-col gap-0.5">
            {pageTypes.map((pt, idx) => (
              <span key={idx}>{PAGE_TYPE_LABELS[pt] || pt}</span>
            ))}
          </div>
        </div>
      )}

      {showDropdown && availableTypes && (
        <div className={`
          absolute z-50 mt-1 w-48 rounded-md shadow-lg
          ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
          max-h-60 overflow-auto
        `}>
          <div className="py-1">
            {availableTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTypeSelect(t.id)}
                className={`
                  block w-full text-left px-4 py-2 text-sm
                  ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}
                  ${t.id === documentType ? 'font-medium' : ''}
                `}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
