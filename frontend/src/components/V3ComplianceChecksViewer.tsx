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
  category: 'completeness' | 'compliance';
  applies_to: string[];
  description: string;
  search_terms?: string[];
  pass_criteria: string;
  fail_criteria: string;
}

// Hardcoded V3 checks (from compliance_checks_v3.json)
// In future, this could be fetched from an API endpoint
const V3_CHECKS: V3Check[] = [
  // Floor Plan checks
  { id: "fp_scale_bar", name: "Scale Bar Present", category: "completeness", applies_to: ["floor_plan"], description: "Floor plan includes a scale bar or scale notation", search_terms: ["scale", "1:100", "1:50", "1:200"], pass_criteria: "Scale bar or scale notation is clearly visible", fail_criteria: "No scale indication found" },
  { id: "fp_north_arrow", name: "North Arrow", category: "completeness", applies_to: ["floor_plan"], description: "Floor plan shows orientation with north arrow", search_terms: ["north", "N", "compass", "orientation"], pass_criteria: "North arrow or orientation indicator present", fail_criteria: "No orientation indicator found" },
  { id: "fp_dimensions", name: "Room Dimensions", category: "completeness", applies_to: ["floor_plan"], description: "Floor plan shows room dimensions", search_terms: ["dimension", "size", "measurement", "m", "mm"], pass_criteria: "Room dimensions are clearly marked", fail_criteria: "Missing or unclear room dimensions" },
  { id: "fp_room_labels", name: "Room Labels", category: "completeness", applies_to: ["floor_plan"], description: "All rooms are labeled with their function", search_terms: ["bedroom", "bathroom", "kitchen", "living", "garage", "laundry"], pass_criteria: "All rooms have clear labels", fail_criteria: "Some rooms are unlabeled" },
  { id: "fp_door_swing", name: "Door Swing Direction", category: "completeness", applies_to: ["floor_plan"], description: "Door swing directions are shown", search_terms: ["door", "swing", "arc"], pass_criteria: "Door swing directions are indicated", fail_criteria: "Door swing directions not shown" },
  { id: "fp_window_schedule", name: "Window References", category: "completeness", applies_to: ["floor_plan"], description: "Windows are referenced or scheduled", search_terms: ["window", "W1", "W2", "glazing"], pass_criteria: "Windows are referenced with schedule codes", fail_criteria: "Windows not referenced" },

  // Site Plan checks
  { id: "sp_boundaries", name: "Property Boundaries", category: "completeness", applies_to: ["site_plan"], description: "Site plan shows property boundaries with dimensions", search_terms: ["boundary", "property line", "lot"], pass_criteria: "Property boundaries clearly shown with dimensions", fail_criteria: "Property boundaries missing or unclear" },
  { id: "sp_setbacks", name: "Building Setbacks", category: "completeness", applies_to: ["site_plan"], description: "Building setbacks from boundaries are dimensioned", search_terms: ["setback", "offset", "distance"], pass_criteria: "Setback dimensions are provided", fail_criteria: "Setback dimensions missing" },
  { id: "sp_north_point", name: "North Point", category: "completeness", applies_to: ["site_plan"], description: "Site plan includes north point orientation", search_terms: ["north", "N", "compass"], pass_criteria: "North point is shown", fail_criteria: "North point missing" },
  { id: "sp_scale", name: "Site Plan Scale", category: "completeness", applies_to: ["site_plan"], description: "Site plan includes scale notation", search_terms: ["scale", "1:200", "1:500", "1:100"], pass_criteria: "Scale is clearly indicated", fail_criteria: "Scale not shown" },
  { id: "sp_access", name: "Vehicle Access", category: "completeness", applies_to: ["site_plan"], description: "Vehicle access and driveway shown", search_terms: ["driveway", "access", "vehicle", "crossing"], pass_criteria: "Vehicle access is shown", fail_criteria: "Vehicle access not indicated" },
  { id: "sp_services", name: "Services Location", category: "completeness", applies_to: ["site_plan"], description: "Location of services (water, sewer, power) indicated", search_terms: ["water", "sewer", "power", "services", "connection"], pass_criteria: "Service connections shown", fail_criteria: "Service locations not indicated" },

  // Elevation checks
  { id: "el_heights", name: "Building Heights", category: "completeness", applies_to: ["elevation"], description: "Building heights and levels are dimensioned", search_terms: ["height", "RL", "level", "FFL"], pass_criteria: "Heights and levels are dimensioned", fail_criteria: "Height dimensions missing" },
  { id: "el_materials", name: "External Materials", category: "completeness", applies_to: ["elevation"], description: "External materials and finishes are noted", search_terms: ["cladding", "finish", "material", "brick", "render"], pass_criteria: "Materials are specified", fail_criteria: "Material specifications missing" },
  { id: "el_roof_pitch", name: "Roof Pitch", category: "completeness", applies_to: ["elevation"], description: "Roof pitch angle is indicated", search_terms: ["pitch", "degree", "roof angle", "fall"], pass_criteria: "Roof pitch is shown", fail_criteria: "Roof pitch not indicated" },
  { id: "el_windows", name: "Window Positions", category: "completeness", applies_to: ["elevation"], description: "Windows are shown in correct positions", search_terms: ["window", "glazing", "opening"], pass_criteria: "Windows shown in elevations", fail_criteria: "Windows not clearly shown" },

  // Section checks
  { id: "sec_foundation", name: "Foundation Detail", category: "completeness", applies_to: ["section"], description: "Foundation type and depth shown", search_terms: ["foundation", "footing", "slab", "ground"], pass_criteria: "Foundation details are shown", fail_criteria: "Foundation details missing" },
  { id: "sec_ceiling_height", name: "Ceiling Heights", category: "completeness", applies_to: ["section"], description: "Ceiling heights are dimensioned", search_terms: ["ceiling", "height", "clearance"], pass_criteria: "Ceiling heights dimensioned", fail_criteria: "Ceiling heights not shown" },
  { id: "sec_insulation", name: "Insulation Shown", category: "completeness", applies_to: ["section"], description: "Insulation locations and R-values indicated", search_terms: ["insulation", "R-value", "thermal"], pass_criteria: "Insulation is indicated", fail_criteria: "Insulation not shown" },

  // Detail checks
  { id: "det_scale", name: "Detail Scale", category: "completeness", applies_to: ["detail"], description: "Construction detail includes scale", search_terms: ["scale", "1:5", "1:10", "1:20"], pass_criteria: "Scale is indicated", fail_criteria: "Scale missing" },
  { id: "det_materials", name: "Material Specification", category: "completeness", applies_to: ["detail"], description: "Materials are specified in detail", search_terms: ["material", "specification", "mm"], pass_criteria: "Materials clearly specified", fail_criteria: "Material specs missing" },

  // Schedule checks
  { id: "sch_window", name: "Window Schedule Complete", category: "completeness", applies_to: ["schedule"], description: "Window schedule includes all required information", search_terms: ["window", "size", "type", "glazing"], pass_criteria: "Window schedule is complete", fail_criteria: "Window schedule incomplete" },
  { id: "sch_door", name: "Door Schedule Complete", category: "completeness", applies_to: ["schedule"], description: "Door schedule includes all required information", search_terms: ["door", "size", "type", "hardware"], pass_criteria: "Door schedule is complete", fail_criteria: "Door schedule incomplete" },
  { id: "sch_finish", name: "Finishes Schedule", category: "completeness", applies_to: ["schedule"], description: "Room finishes are scheduled", search_terms: ["finish", "floor", "wall", "ceiling"], pass_criteria: "Finishes schedule present", fail_criteria: "Finishes schedule missing" },

  // Cover Sheet checks
  { id: "cs_address", name: "Site Address", category: "completeness", applies_to: ["cover_sheet"], description: "Project address is clearly stated", search_terms: ["address", "street", "road", "location"], pass_criteria: "Site address is shown", fail_criteria: "Site address missing" },
  { id: "cs_drawing_list", name: "Drawing List", category: "completeness", applies_to: ["cover_sheet"], description: "List of drawings included in set", search_terms: ["drawing", "list", "index", "sheet"], pass_criteria: "Drawing list provided", fail_criteria: "Drawing list missing" },
  { id: "cs_legend", name: "Symbols Legend", category: "completeness", applies_to: ["cover_sheet"], description: "Legend of symbols used in drawings", search_terms: ["legend", "symbol", "key", "notation"], pass_criteria: "Symbol legend provided", fail_criteria: "Symbol legend missing" },

  // Compliance checks
  { id: "fp_egress", name: "Egress Requirements", category: "compliance", applies_to: ["floor_plan"], description: "Emergency egress paths meet minimum requirements", search_terms: ["egress", "exit", "escape", "emergency"], pass_criteria: "Egress paths appear adequate", fail_criteria: "Egress may not meet requirements" },
  { id: "fp_accessibility", name: "Accessibility Compliance", category: "compliance", applies_to: ["floor_plan"], description: "Accessible routes and facilities where required", search_terms: ["accessible", "disabled", "wheelchair", "ramp"], pass_criteria: "Accessibility features shown where required", fail_criteria: "Accessibility features may be missing" },
  { id: "sp_coverage", name: "Site Coverage", category: "compliance", applies_to: ["site_plan"], description: "Building coverage within allowable limits", search_terms: ["coverage", "site area", "building area", "%"], pass_criteria: "Site coverage appears compliant", fail_criteria: "Site coverage may exceed limits" },
  { id: "sp_height_limit", name: "Height Restrictions", category: "compliance", applies_to: ["site_plan", "elevation"], description: "Building height within zone limits", search_terms: ["height", "limit", "zone", "maximum"], pass_criteria: "Height appears within limits", fail_criteria: "Height may exceed zone limits" },
  { id: "el_recession", name: "Recession Planes", category: "compliance", applies_to: ["elevation"], description: "Building within recession plane requirements", search_terms: ["recession", "plane", "daylight", "height in relation"], pass_criteria: "Within recession planes", fail_criteria: "May breach recession planes" },
  { id: "sec_bracing", name: "Bracing Requirements", category: "compliance", applies_to: ["section"], description: "Structural bracing elements indicated", search_terms: ["bracing", "brace", "structural", "shear"], pass_criteria: "Bracing elements shown", fail_criteria: "Bracing not clearly indicated" },
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
          {V3_CHECKS.length} checks across {Object.keys(PAGE_TYPE_LABELS).length} page types.
          These checks run automatically based on page type classification.
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
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${theme.textPrimary}`}>{check.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                            {check.id}
                          </span>
                        </div>
                        <p className={`text-xs ${theme.textMuted} mt-1`}>{check.description}</p>
                        {check.search_terms && check.search_terms.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {check.search_terms.slice(0, 5).map(term => (
                              <span
                                key={term}
                                className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
                              >
                                {term}
                              </span>
                            ))}
                            {check.search_terms.length > 5 && (
                              <span className={`text-xs ${theme.textSubtle}`}>+{check.search_terms.length - 5} more</span>
                            )}
                          </div>
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
