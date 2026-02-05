# Compliance Checks V3 - Full Reference

This document lists all 37 compliance checks used for building consent document verification.

---

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| Completeness | 31 | Verify required information is present |
| Compliance | 6 | Verify building code/district plan rules |

| Page Type | Checks | Key Focus |
|-----------|--------|-----------|
| Floor Plan | 10 | Room labels, dimensions, doors/windows |
| Site Plan | 16 | Boundaries, setbacks, coverage |
| Elevation | 9 | Heights, materials, RL levels |
| Section | 6 | Heights, ground levels |
| Detail | 6 | Materials, title, scale |
| Cover Sheet | 5 | Project info, consent number |
| Certificate | 7 | Signatures, registration, scope |
| Form | 5 | Signatures, dates, consent number |
| Specification | 5 | Manufacturer, model, clearances |
| Letter | 2 | Signature, date |

---

## Floor Plan Checks (10)

### 1. Scale Indicator
- **ID:** `scale_indicator`
- **Prompt:** Does this page have a scale indicator (e.g., 1:100, 1:50, scale bar)?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** site_plan, elevation, section, detail

### 2. North Arrow
- **ID:** `north_arrow`
- **Prompt:** Is there a north arrow or north direction indicator on this plan?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** site_plan

### 3. Dimensions Marked
- **ID:** `dimensions_marked`
- **Prompt:** Are dimensions clearly marked on this drawing (room sizes, setbacks, heights)?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** site_plan, elevation, section, detail

### 4. Room Labels
- **ID:** `room_labels`
- **Prompt:** Are all rooms labelled with their intended use (e.g., Bedroom, Kitchen, Living)?
- **Category:** Completeness
- **Required:** Yes
- **Floor plan only**

### 5. Floor Level Identifier
- **ID:** `floor_level_identifier`
- **Prompt:** Is the floor level or storey clearly identified (e.g., Ground Floor, Level 1)?
- **Category:** Completeness
- **Required:** Yes
- **Floor plan only**

### 6. Door Positions
- **ID:** `door_positions`
- **Prompt:** Are door positions and swing directions shown on this floor plan?
- **Category:** Completeness
- **Required:** Yes
- **Floor plan only**

### 7. Window Positions
- **ID:** `window_positions`
- **Prompt:** Are window positions indicated on this floor plan?
- **Category:** Completeness
- **Required:** Yes
- **Floor plan only**

### 8. Proposed Works
- **ID:** `proposed_works`
- **Prompt:** Are proposed works clearly identified and distinguished from existing on this plan?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** site_plan

### 9. Drawing Date
- **ID:** `drawing_date`
- **Prompt:** Is a drawing date or revision date shown on this page?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** site_plan, elevation, section, detail, cover_sheet

### 10. Author/Company
- **ID:** `author_company`
- **Prompt:** Is the author, designer or company who prepared this drawing shown?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** site_plan, elevation, section, detail, cover_sheet

---

## Site Plan Checks (16)

### 1. Scale Indicator
- **ID:** `scale_indicator`
- **Prompt:** Does this page have a scale indicator (e.g., 1:100, 1:50, scale bar)?
- **Category:** Completeness
- **Required:** Yes

### 2. North Arrow
- **ID:** `north_arrow`
- **Prompt:** Is there a north arrow or north direction indicator on this plan?
- **Category:** Completeness
- **Required:** Yes

### 3. Dimensions Marked
- **ID:** `dimensions_marked`
- **Prompt:** Are dimensions clearly marked on this drawing (room sizes, setbacks, heights)?
- **Category:** Completeness
- **Required:** Yes

### 4. Boundary Dimensions
- **ID:** `boundary_dimensions`
- **Prompt:** Are all property boundary dimensions shown on this site plan?
- **Category:** Completeness
- **Required:** Yes
- **Site plan only**

### 5. Site Area
- **ID:** `site_area`
- **Prompt:** Is the total site area specified on this site plan?
- **Category:** Completeness
- **Required:** Yes
- **Site plan only**

### 6. Setback Dimensions
- **ID:** `setback_dimensions`
- **Prompt:** Are setback distances from boundaries shown for buildings on this site plan?
- **Category:** Completeness
- **Required:** Yes
- **Site plan only**

### 7. Existing Buildings
- **ID:** `existing_buildings`
- **Prompt:** Are existing buildings or structures shown and labelled on this site plan?
- **Category:** Completeness
- **Required:** No (Optional)
- **Site plan only**

### 8. Proposed Works
- **ID:** `proposed_works`
- **Prompt:** Are proposed works clearly identified and distinguished from existing on this plan?
- **Category:** Completeness
- **Required:** Yes

### 9. Drawing Date
- **ID:** `drawing_date`
- **Prompt:** Is a drawing date or revision date shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 10. Author/Company
- **ID:** `author_company`
- **Prompt:** Is the author, designer or company who prepared this drawing shown?
- **Category:** Completeness
- **Required:** Yes

### 11. Site Address
- **ID:** `site_address`
- **Prompt:** Is the site/property address shown on this page?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** cover_sheet, form, certificate

### 12. Legal Description
- **ID:** `legal_description`
- **Prompt:** Is the legal description (Lot/DP reference) shown?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** cover_sheet, form

### 13. Site Coverage Compliance ⚖️
- **ID:** `site_coverage_compliant`
- **Prompt:** Based on the site plan, does the site coverage appear to be within typical limits (35-40%)?
- **Category:** Compliance
- **Required:** No (Optional)
- **Rule Reference:** District Plan - Site Coverage
- **Site plan only**

### 14. Setback Compliance ⚖️
- **ID:** `setback_compliant`
- **Prompt:** Do the setback distances shown meet typical minimum requirements (front 4.5m, side 1.5m)?
- **Category:** Compliance
- **Required:** No (Optional)
- **Rule Reference:** District Plan - Yard Requirements
- **Site plan only**

### 15. Vehicle Access ⚖️
- **ID:** `vehicle_access`
- **Prompt:** Is vehicle access or driveway shown on the site plan?
- **Category:** Compliance
- **Required:** No (Optional)
- **Rule Reference:** District Plan - Access Requirements
- **Site plan only**

### 16. Stormwater Disposal ⚖️
- **ID:** `stormwater_indicated`
- **Prompt:** Is stormwater disposal indicated on the site plan?
- **Category:** Compliance
- **Required:** No (Optional)
- **Rule Reference:** Building Code E1
- **Site plan only**

---

## Elevation Checks (9)

### 1. Scale Indicator
- **ID:** `scale_indicator`
- **Prompt:** Does this page have a scale indicator (e.g., 1:100, 1:50, scale bar)?
- **Category:** Completeness
- **Required:** Yes

### 2. Dimensions Marked
- **ID:** `dimensions_marked`
- **Prompt:** Are dimensions clearly marked on this drawing (room sizes, setbacks, heights)?
- **Category:** Completeness
- **Required:** Yes

### 3. Elevation Direction
- **ID:** `elevation_direction`
- **Prompt:** Is the elevation direction clearly identified (e.g., North Elevation, Street Elevation)?
- **Category:** Completeness
- **Required:** Yes
- **Elevation only**

### 4. Height Dimensions
- **ID:** `height_dimensions`
- **Prompt:** Are building heights shown on this elevation (floor to ceiling, overall height)?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** section

### 5. Ground Level (RL)
- **ID:** `ground_level_rl`
- **Prompt:** Is the ground level or finished floor level shown (RL - Reduced Level)?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** section

### 6. External Materials
- **ID:** `external_materials`
- **Prompt:** Are external materials and finishes indicated on this elevation?
- **Category:** Completeness
- **Required:** No (Optional)
- **Elevation only**

### 7. Drawing Date
- **ID:** `drawing_date`
- **Prompt:** Is a drawing date or revision date shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 8. Author/Company
- **ID:** `author_company`
- **Prompt:** Is the author, designer or company who prepared this drawing shown?
- **Category:** Completeness
- **Required:** Yes

### 9. Height Limit Compliance ⚖️
- **ID:** `height_limit_compliant`
- **Prompt:** Based on the elevations, does the building height appear to be within typical residential limits (8-9m)?
- **Category:** Compliance
- **Required:** No (Optional)
- **Rule Reference:** District Plan - Height Limits
- **Elevation only**

---

## Section Checks (6)

### 1. Scale Indicator
- **ID:** `scale_indicator`
- **Prompt:** Does this page have a scale indicator (e.g., 1:100, 1:50, scale bar)?
- **Category:** Completeness
- **Required:** Yes

### 2. Dimensions Marked
- **ID:** `dimensions_marked`
- **Prompt:** Are dimensions clearly marked on this drawing (room sizes, setbacks, heights)?
- **Category:** Completeness
- **Required:** Yes

### 3. Height Dimensions
- **ID:** `height_dimensions`
- **Prompt:** Are building heights shown on this elevation (floor to ceiling, overall height)?
- **Category:** Completeness
- **Required:** Yes

### 4. Ground Level (RL)
- **ID:** `ground_level_rl`
- **Prompt:** Is the ground level or finished floor level shown (RL - Reduced Level)?
- **Category:** Completeness
- **Required:** Yes

### 5. Drawing Date
- **ID:** `drawing_date`
- **Prompt:** Is a drawing date or revision date shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 6. Author/Company
- **ID:** `author_company`
- **Prompt:** Is the author, designer or company who prepared this drawing shown?
- **Category:** Completeness
- **Required:** Yes

---

## Detail Drawing Checks (6)

### 1. Scale Indicator
- **ID:** `scale_indicator`
- **Prompt:** Does this page have a scale indicator (e.g., 1:100, 1:50, scale bar)?
- **Category:** Completeness
- **Required:** Yes

### 2. Dimensions Marked
- **ID:** `dimensions_marked`
- **Prompt:** Are dimensions clearly marked on this drawing (room sizes, setbacks, heights)?
- **Category:** Completeness
- **Required:** Yes

### 3. Detail Title
- **ID:** `detail_title`
- **Prompt:** Is this detail drawing clearly titled and labelled?
- **Category:** Completeness
- **Required:** Yes
- **Detail only**

### 4. Materials Identified
- **ID:** `materials_identified`
- **Prompt:** Are materials and components clearly identified in this detail?
- **Category:** Completeness
- **Required:** Yes
- **Detail only**

### 5. Drawing Date
- **ID:** `drawing_date`
- **Prompt:** Is a drawing date or revision date shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 6. Author/Company
- **ID:** `author_company`
- **Prompt:** Is the author, designer or company who prepared this drawing shown?
- **Category:** Completeness
- **Required:** Yes

---

## Cover Sheet Checks (5)

### 1. Drawing Date
- **ID:** `drawing_date`
- **Prompt:** Is a drawing date or revision date shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 2. Author/Company
- **ID:** `author_company`
- **Prompt:** Is the author, designer or company who prepared this drawing shown?
- **Category:** Completeness
- **Required:** Yes

### 3. Site Address
- **ID:** `site_address`
- **Prompt:** Is the site/property address shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 4. Legal Description
- **ID:** `legal_description`
- **Prompt:** Is the legal description (Lot/DP reference) shown?
- **Category:** Completeness
- **Required:** Yes

### 5. Consent Number
- **ID:** `consent_number`
- **Prompt:** Is a building consent or application number shown?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** form, certificate

---

## Certificate Checks (7)

### 1. Site Address
- **ID:** `site_address`
- **Prompt:** Is the site/property address shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 2. Consent Number
- **ID:** `consent_number`
- **Prompt:** Is a building consent or application number shown?
- **Category:** Completeness
- **Required:** Yes

### 3. Signature Present
- **ID:** `signature_present`
- **Prompt:** Is a signature present on this document?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** form, letter

### 4. Date Signed
- **ID:** `date_signed`
- **Prompt:** Is the document dated?
- **Category:** Completeness
- **Required:** Yes
- **Also applies to:** form, letter

### 5. Standards Compliance ⚖️
- **ID:** `standards_compliance`
- **Prompt:** Are compliance standards referenced (AS/NZS)?
- **Category:** Compliance
- **Required:** Yes
- **Also applies to:** specification

### 6. Registration/Accreditation
- **ID:** `registration_number`
- **Prompt:** Is the issuer's registration or accreditation number shown (LBP, CPEng, etc.)?
- **Category:** Completeness
- **Required:** Yes
- **Certificate only**

### 7. Scope of Work
- **ID:** `scope_of_work`
- **Prompt:** Is the scope of work or certification clearly defined?
- **Category:** Completeness
- **Required:** Yes
- **Certificate only**

---

## Form Checks (5)

### 1. Site Address
- **ID:** `site_address`
- **Prompt:** Is the site/property address shown on this page?
- **Category:** Completeness
- **Required:** Yes

### 2. Legal Description
- **ID:** `legal_description`
- **Prompt:** Is the legal description (Lot/DP reference) shown?
- **Category:** Completeness
- **Required:** Yes

### 3. Consent Number
- **ID:** `consent_number`
- **Prompt:** Is a building consent or application number shown?
- **Category:** Completeness
- **Required:** Yes

### 4. Signature Present
- **ID:** `signature_present`
- **Prompt:** Is a signature present on this document?
- **Category:** Completeness
- **Required:** Yes

### 5. Date Signed
- **ID:** `date_signed`
- **Prompt:** Is the document dated?
- **Category:** Completeness
- **Required:** Yes

---

## Specification Checks (5)

### 1. Manufacturer Name
- **ID:** `manufacturer_name`
- **Prompt:** Is the manufacturer name clearly shown?
- **Category:** Completeness
- **Required:** Yes
- **Specification only**

### 2. Model Number
- **ID:** `model_number`
- **Prompt:** Is the product model name or number shown?
- **Category:** Completeness
- **Required:** Yes
- **Specification only**

### 3. Clearance Requirements
- **ID:** `clearance_requirements`
- **Prompt:** Are clearance or spacing requirements specified?
- **Category:** Completeness
- **Required:** Yes
- **Specification only**

### 4. Standards Compliance ⚖️
- **ID:** `standards_compliance`
- **Prompt:** Are compliance standards referenced (AS/NZS)?
- **Category:** Compliance
- **Required:** Yes

### 5. Installation Instructions
- **ID:** `installation_instructions`
- **Prompt:** Are installation instructions present?
- **Category:** Completeness
- **Required:** Yes
- **Specification only**

---

## Letter Checks (2)

### 1. Signature Present
- **ID:** `signature_present`
- **Prompt:** Is a signature present on this document?
- **Category:** Completeness
- **Required:** Yes

### 2. Date Signed
- **ID:** `date_signed`
- **Prompt:** Is the document dated?
- **Category:** Completeness
- **Required:** Yes

---

## Page Types Without Checks

The following page types have no specific checks assigned:
- **Schedule** - Tables of specifications (door/window schedules)
- **Report** - Technical/inspection reports
- **Photo** - Site photographs
- **Table** - Standalone data tables
- **Unknown** - Unclassified pages

---

## Notes for Review

### Questions to Consider:
1. Are all required checks actually necessary for building consent?
2. Should any optional checks be made required?
3. Are there missing checks that should be added?
4. Are the prompts clear enough for the AI to evaluate correctly?
5. Should compliance rule references be more specific (e.g., actual clause numbers)?

### Potential Additions:
- Fire safety indicators on floor plans
- Accessibility features (wheelchair access, grab rails)
- Insulation specifications
- Structural engineer details on certificates
- Weathertightness details

---

*Generated from `backend/config/compliance_checks_v3.json`*
