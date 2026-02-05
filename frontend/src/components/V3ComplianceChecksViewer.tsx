/**
 * V3 Compliance Checks Viewer - Read-only view of page-level checks
 * Checks are defined in backend/config/compliance_checks_v3.json
 */
import { useState } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';

// V3 check structure (matches backend config)
interface V3Check {
  id: string;
  name: string;
  prompt: string;
  category: 'completeness' | 'compliance';
  applies_to: string[];
  required: boolean;
  rule_reference?: string;
}

// Actual V3 checks from compliance_checks_v3.json
const V3_CHECKS: V3Check[] = [
  // Scale & Orientation
  { id: "scale_indicator", name: "Scale Indicator", prompt: "Does this page have a scale indicator (e.g., 1:100, 1:50, scale bar)?", applies_to: ["floor_plan", "site_plan", "elevation", "section", "detail"], category: "completeness", required: true },
  { id: "north_arrow", name: "North Arrow", prompt: "Is there a north arrow or north direction indicator on this plan?", applies_to: ["floor_plan", "site_plan"], category: "completeness", required: true },
  { id: "dimensions_marked", name: "Dimensions Marked", prompt: "Are dimensions clearly marked on this drawing (room sizes, setbacks, heights)?", applies_to: ["floor_plan", "site_plan", "elevation", "section", "detail"], category: "completeness", required: true },

  // Floor Plan checks
  { id: "room_labels", name: "Room Labels", prompt: "Are all rooms labelled with their intended use (e.g., Bedroom, Kitchen, Living)?", applies_to: ["floor_plan"], category: "completeness", required: true },
  { id: "floor_level_identifier", name: "Floor Level Identifier", prompt: "Is the floor level or storey clearly identified (e.g., Ground Floor, Level 1)?", applies_to: ["floor_plan"], category: "completeness", required: true },
  { id: "door_positions", name: "Door Positions", prompt: "Are door positions and swing directions shown on this floor plan?", applies_to: ["floor_plan"], category: "completeness", required: true },
  { id: "window_positions", name: "Window Positions", prompt: "Are window positions indicated on this floor plan?", applies_to: ["floor_plan"], category: "completeness", required: true },

  // Site Plan checks
  { id: "boundary_dimensions", name: "Boundary Dimensions", prompt: "Are all property boundary dimensions shown on this site plan?", applies_to: ["site_plan"], category: "completeness", required: true },
  { id: "site_area", name: "Site Area", prompt: "Is the total site area specified on this site plan?", applies_to: ["site_plan"], category: "completeness", required: true },
  { id: "setback_dimensions", name: "Setback Dimensions", prompt: "Are setback distances from boundaries shown for buildings on this site plan?", applies_to: ["site_plan"], category: "completeness", required: true },
  { id: "existing_buildings", name: "Existing Buildings", prompt: "Are existing buildings or structures shown and labelled on this site plan?", applies_to: ["site_plan"], category: "completeness", required: false },
  { id: "proposed_works", name: "Proposed Works", prompt: "Are proposed works clearly identified and distinguished from existing on this plan?", applies_to: ["site_plan", "floor_plan"], category: "completeness", required: true },

  // Elevation checks
  { id: "elevation_direction", name: "Elevation Direction", prompt: "Is the elevation direction clearly identified (e.g., North Elevation, Street Elevation)?", applies_to: ["elevation"], category: "completeness", required: true },
  { id: "height_dimensions", name: "Height Dimensions", prompt: "Are building heights shown on this elevation (floor to ceiling, overall height)?", applies_to: ["elevation", "section"], category: "completeness", required: true },
  { id: "ground_level_rl", name: "Ground Level (RL)", prompt: "Is the ground level or finished floor level shown (RL - Reduced Level)?", applies_to: ["elevation", "section"], category: "completeness", required: true },
  { id: "external_materials", name: "External Materials", prompt: "Are external materials and finishes indicated on this elevation?", applies_to: ["elevation"], category: "completeness", required: false },

  // Detail checks
  { id: "detail_title", name: "Detail Title", prompt: "Is this detail drawing clearly titled and labelled?", applies_to: ["detail"], category: "completeness", required: true },
  { id: "materials_identified", name: "Materials Identified", prompt: "Are materials and components clearly identified in this detail?", applies_to: ["detail"], category: "completeness", required: true },

  // Drawing meta checks
  { id: "drawing_date", name: "Drawing Date", prompt: "Is a drawing date or revision date shown on this page?", applies_to: ["floor_plan", "site_plan", "elevation", "section", "detail", "cover_sheet"], category: "completeness", required: true },
  { id: "author_company", name: "Author/Company", prompt: "Is the author, designer or company who prepared this drawing shown?", applies_to: ["floor_plan", "site_plan", "elevation", "section", "detail", "cover_sheet"], category: "completeness", required: true },
  { id: "site_address", name: "Site Address", prompt: "Is the site/property address shown on this page?", applies_to: ["site_plan", "cover_sheet", "form", "certificate"], category: "completeness", required: true },
  { id: "legal_description", name: "Legal Description", prompt: "Is the legal description (Lot/DP reference) shown?", applies_to: ["site_plan", "cover_sheet", "form"], category: "completeness", required: true },
  { id: "consent_number", name: "Consent Number", prompt: "Is a building consent or application number shown?", applies_to: ["form", "certificate", "cover_sheet"], category: "completeness", required: true },

  // Form/Certificate checks
  { id: "signature_present", name: "Signature Present", prompt: "Is a signature present on this document?", applies_to: ["form", "certificate", "letter"], category: "completeness", required: true },
  { id: "date_signed", name: "Date Signed", prompt: "Is the document dated?", applies_to: ["form", "certificate", "letter"], category: "completeness", required: true },
  { id: "registration_number", name: "Registration/Accreditation", prompt: "Is the issuer's registration or accreditation number shown (LBP, CPEng, etc.)?", applies_to: ["certificate"], category: "completeness", required: true },
  { id: "scope_of_work", name: "Scope of Work", prompt: "Is the scope of work or certification clearly defined?", applies_to: ["certificate"], category: "completeness", required: true },
  { id: "certificate_reference", name: "Certificate Reference", prompt: "Does the certificate reference the specific project, address, or consent number?", applies_to: ["certificate"], category: "completeness", required: true },
  { id: "form_complete", name: "Form Completeness", prompt: "Are all required fields on this form filled in (no blank mandatory fields)?", applies_to: ["form"], category: "completeness", required: true },

  // Specification checks
  { id: "manufacturer_name", name: "Manufacturer Name", prompt: "Is the manufacturer name clearly shown?", applies_to: ["specification"], category: "completeness", required: true },
  { id: "model_number", name: "Model Number", prompt: "Is the product model name or number shown?", applies_to: ["specification"], category: "completeness", required: true },
  { id: "clearance_requirements", name: "Clearance Requirements", prompt: "Are clearance or spacing requirements specified?", applies_to: ["specification"], category: "completeness", required: true },
  { id: "installation_instructions", name: "Installation Instructions", prompt: "Are installation instructions present?", applies_to: ["specification"], category: "completeness", required: true },

  // Schedule/Table checks
  { id: "schedule_complete", name: "Schedule Completeness", prompt: "Does this schedule contain all required entries with complete information (no blank fields)?", applies_to: ["schedule", "table"], category: "completeness", required: true },
  { id: "schedule_references", name: "Schedule References", prompt: "Do the items in this schedule reference specific drawing numbers or locations?", applies_to: ["schedule", "table"], category: "completeness", required: false },

  // Report checks
  { id: "report_author", name: "Report Author", prompt: "Is the report author or company identified?", applies_to: ["report"], category: "completeness", required: true },
  { id: "report_dated", name: "Report Dated", prompt: "Is there a date on this report?", applies_to: ["report"], category: "completeness", required: true },
  { id: "report_findings", name: "Report Findings", prompt: "Does the report include clear findings or conclusions?", applies_to: ["report"], category: "completeness", required: true },

  // Cover sheet checks
  { id: "cover_drawing_list", name: "Drawing List", prompt: "Is there a drawing list or index on this cover sheet?", applies_to: ["cover_sheet"], category: "completeness", required: true },
  { id: "cover_project_info", name: "Project Information", prompt: "Is the project name, address, or description provided on this cover sheet?", applies_to: ["cover_sheet"], category: "completeness", required: true },

  // Letter checks
  { id: "letter_dated", name: "Letter Dated", prompt: "Is there a date on this letter?", applies_to: ["letter"], category: "completeness", required: true },
  { id: "letter_signed", name: "Letter Signed", prompt: "Is this letter signed?", applies_to: ["letter"], category: "completeness", required: true },

  // Photo/Unknown checks
  { id: "photo_labelled", name: "Photo Labelled", prompt: "Is this photo labelled with what it shows (location, date, or subject)?", applies_to: ["photo"], category: "completeness", required: false },
  { id: "unknown_identifiable", name: "Content Identifiable", prompt: "Can the purpose or content of this page be determined?", applies_to: ["unknown"], category: "completeness", required: false },

  // Compliance checks
  { id: "standards_compliance", name: "Standards Compliance", prompt: "Are compliance standards referenced (AS/NZS)?", applies_to: ["specification", "certificate"], category: "compliance", rule_reference: "AS/NZS Standards", required: true },
  { id: "site_coverage_compliant", name: "Site Coverage Compliance", prompt: "Based on the site plan, does the site coverage appear to be within typical limits (35-40%)?", applies_to: ["site_plan"], category: "compliance", rule_reference: "District Plan - Site Coverage", required: false },
  { id: "height_limit_compliant", name: "Height Limit Compliance", prompt: "Based on the elevations, does the building height appear to be within typical residential limits (8-9m)?", applies_to: ["elevation"], category: "compliance", rule_reference: "District Plan - Height Limits", required: false },
  { id: "setback_compliant", name: "Setback Compliance", prompt: "Do the setback distances shown meet typical minimum requirements (front 4.5m, side 1.5m)?", applies_to: ["site_plan"], category: "compliance", rule_reference: "District Plan - Yard Requirements", required: false },
  { id: "vehicle_access", name: "Vehicle Access", prompt: "Is vehicle access or driveway shown on the site plan?", applies_to: ["site_plan"], category: "compliance", rule_reference: "District Plan - Access Requirements", required: false },
  { id: "stormwater_indicated", name: "Stormwater Disposal", prompt: "Is stormwater disposal indicated on the site plan?", applies_to: ["site_plan"], category: "compliance", rule_reference: "Building Code E1", required: false },
];

// Page type display names
const PAGE_TYPE_LABELS: Record<string, string> = {
  floor_plan: 'Floor Plan',
  site_plan: 'Site Plan',
  elevation: 'Elevation',
  section: 'Section',
  detail: 'Detail',
  schedule: 'Schedule',
  cover_sheet: 'Cover Sheet',
  form: 'Form',
  certificate: 'Certificate',
  letter: 'Letter',
  report: 'Report',
  photo: 'Photo',
  table: 'Table',
  specification: 'Specification',
  unknown: 'Unknown',
};

// Page type colors
const PAGE_TYPE_COLORS: Record<string, string> = {
  floor_plan: '#06b6d4',
  site_plan: '#3b82f6',
  elevation: '#14b8a6',
  section: '#8b5cf6',
  detail: '#f59e0b',
  schedule: '#84cc16',
  cover_sheet: '#0ea5e9',
  form: '#f97316',
  certificate: '#22c55e',
  letter: '#a855f7',
  report: '#ec4899',
  photo: '#6366f1',
  table: '#eab308',
  specification: '#ef4444',
  unknown: '#6b7280',
};

export default function V3ComplianceChecksViewer() {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [activeCategory, setActiveCategory] = useState<'completeness' | 'compliance'>('completeness');
  const [expandedPageType, setExpandedPageType] = useState<string | null>(null);

  // Group checks by page type
  const checksByPageType: Record<string, V3Check[]> = {};
  V3_CHECKS.filter(c => c.category === activeCategory).forEach(check => {
    check.applies_to.forEach(pageType => {
      if (!checksByPageType[pageType]) {
        checksByPageType[pageType] = [];
      }
      checksByPageType[pageType].push(check);
    });
  });

  const completenessCount = V3_CHECKS.filter(c => c.category === 'completeness').length;
  const complianceCount = V3_CHECKS.filter(c => c.category === 'compliance').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`p-4 rounded-xl border ${theme.border}`}
        style={{ background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
        <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-2 flex items-center gap-2`}>
          <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          V3 Page-Level Compliance Checks
        </h3>
        <p className={`text-xs ${theme.textMuted}`}>
          {V3_CHECKS.length} AI-evaluated checks across {Object.keys(PAGE_TYPE_LABELS).length} page types.
          Checks run automatically based on page type classification.
        </p>
        <p className={`text-xs ${theme.textSubtle} mt-1`}>
          To modify checks, edit <code className={`px-1 py-0.5 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>backend/config/compliance_checks_v3.json</code>
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveCategory('completeness')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeCategory === 'completeness'
              ? isDark ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
              : isDark ? 'text-slate-400 hover:bg-slate-700/50' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Completeness ({completenessCount})
        </button>
        <button
          onClick={() => setActiveCategory('compliance')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeCategory === 'compliance'
              ? isDark ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-purple-50 text-purple-700 border border-purple-200'
              : isDark ? 'text-slate-400 hover:bg-slate-700/50' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Compliance ({complianceCount})
        </button>
      </div>

      {/* Checks by Page Type */}
      <div className="space-y-2">
        {Object.entries(checksByPageType).map(([pageType, checks]) => (
          <div
            key={pageType}
            className={`rounded-xl border ${theme.border} overflow-hidden`}
            style={{ background: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.6)' }}
          >
            {/* Page Type Header */}
            <button
              onClick={() => setExpandedPageType(expandedPageType === pageType ? null : pageType)}
              className={`w-full flex items-center justify-between px-4 py-3 ${
                isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
              } transition-colors`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: PAGE_TYPE_COLORS[pageType] || '#6b7280' }}
                />
                <span className={`font-medium ${theme.textPrimary}`}>
                  {PAGE_TYPE_LABELS[pageType] || pageType}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                  {checks.length} check{checks.length !== 1 ? 's' : ''}
                </span>
              </div>
              <svg
                className={`w-5 h-5 ${theme.textMuted} transform transition-transform ${expandedPageType === pageType ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded Checks List */}
            {expandedPageType === pageType && (
              <div className={`border-t ${theme.border}`}>
                {checks.map((check, idx) => (
                  <div
                    key={check.id}
                    className={`px-4 py-3 ${idx !== checks.length - 1 ? `border-b ${theme.border}` : ''} ${
                      isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${theme.textPrimary}`}>{check.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                            {check.id}
                          </span>
                          {check.required ? (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                              required
                            </span>
                          ) : (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-600 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                              optional
                            </span>
                          )}
                        </div>
                        <p className={`text-xs ${theme.textMuted} mt-1.5 italic`}>"{check.prompt}"</p>
                        {check.rule_reference && (
                          <p className={`text-xs ${theme.textSubtle} mt-1`}>
                            Rule: {check.rule_reference}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
