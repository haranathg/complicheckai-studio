# Building/Planning Consent Document Classification Schema

## Overview
This schema defines document types commonly found in New Zealand building and planning consent applications. Each document type includes classification criteria and completeness checks for automated validation.

---

## Document Type Taxonomy

### 1. APPLICATION FORMS

#### 1.1 Form 2 - Building Consent Application
**Description:** Application for project information memorandum and/or building consent under Section 33 or 45, Building Act 2004

**Classification Signals:**
- Header contains "Form 2"
- Contains "Application for project information memorandum and/or building consent"
- References "Section 33" or "Section 45, Building Act 2004"

**Completeness Checks:**
- [ ] Street address of building
- [ ] Legal description of land (Lot/DP)
- [ ] Owner name and contact details
- [ ] Building description/use
- [ ] Year first constructed (if existing)
- [ ] Agent details (if applicable)
- [ ] Signature/date submitted

---

#### 1.2 Form PLG 1 - NES Soil Contamination Declaration
**Description:** National Environmental Standard for Assessing and Managing Contaminants in Soil

**Classification Signals:**
- Header contains "FORM PLG 1" or "PLG 1"
- References "National Environmental Standard" and "Contaminants in Soil"
- References "Resource Management Act 1991"

**Completeness Checks:**
- [ ] Building consent application number
- [ ] Date submitted
- [ ] Changing use of land declaration (YES/NO)
- [ ] Disturbing soil declaration (YES/NO)
- [ ] Applicant acknowledgment/signature

---

### 2. CONSENT DOCUMENTS

#### 2.1 Form 5 - Building Consent (Granted)
**Description:** Building consent issued under Section 51, Building Act 2004

**Classification Signals:**
- Header contains "Form 5"
- Contains "Building consent" with consent number (e.g., ABA/2025/0557)
- References "Section 51, Building Act 2004"

**Completeness Checks:**
- [ ] Consent number
- [ ] Street address
- [ ] Legal description
- [ ] Owner details
- [ ] Description of building work
- [ ] Conditions (if any)
- [ ] Issue date
- [ ] Council name and signature/stamp

---

#### 2.2 Form 7 - Code Compliance Certificate (CCC)
**Description:** Code compliance certificate issued under Section 95, Building Act 2004

**Classification Signals:**
- Header contains "Form 7"
- Contains "Code compliance certificate"
- References "Section 95, Building Act 2004"

**Completeness Checks:**
- [ ] Building consent number(s) covered
- [ ] Street address
- [ ] Legal description
- [ ] Owner details
- [ ] Description of building work
- [ ] Statement of compliance
- [ ] Issue date
- [ ] Authorised officer signature
- [ ] Council stamp/seal

---

### 3. LEGAL/LAND DOCUMENTS

#### 3.1 Record of Title (Certificate of Title)
**Description:** Land Information NZ record of land ownership and interests

**Classification Signals:**
- Header "RECORD OF TITLE" or "CERTIFICATE OF TITLE"
- Contains "UNDER LAND TRANSFER ACT 2017"
- Contains "FREEHOLD" or tenure type
- Contains Identifier (e.g., SA21A/1371)
- Contains "Land Registration District"

**Completeness Checks:**
- [ ] Title identifier/reference
- [ ] Land Registration District
- [ ] Date issued
- [ ] Estate type (Fee Simple, etc.)
- [ ] Area (square metres)
- [ ] Legal description (Lot/DP)
- [ ] Registered owner(s)
- [ ] Interests/encumbrances section
- [ ] Search copy date (if search copy)

---

#### 3.2 Deposited Plan / Survey Plan
**Description:** Survey plan showing lot boundaries, dimensions, and survey details

**Classification Signals:**
- Contains "PLAN" prominently
- Contains survey measurements and bearings
- Contains "LAND DISTRICT" or "SURVEY DISTRICT"
- Shows lot boundaries with dimensions
- Contains surveyor certification
- Contains DP (Deposited Plan) number

**Completeness Checks:**
- [ ] Plan number (DP/LT number)
- [ ] Land district
- [ ] Scale indicated
- [ ] North point
- [ ] Survey marks shown
- [ ] Boundary dimensions
- [ ] Area calculations
- [ ] Surveyor signature/certification
- [ ] Approval stamp

---

#### 3.3 Section 36(2) Notification (Building Act)
**Description:** Notification to Land Registrar regarding building consent on land subject to erosion

**Classification Signals:**
- Contains "NOTIFICATION TO DISTRICT LAND REGISTRAR"
- References "SECTION 36 OF THE BUILDING ACT"
- Contains "WHEREAS" clauses
- Contains certificate number and schedule

**Completeness Checks:**
- [ ] Certificate number
- [ ] Land registrar addressed
- [ ] Registered proprietors named
- [ ] Legal description in schedule
- [ ] Council name
- [ ] Chief Executive signature
- [ ] Date of issue

---

### 4. PRODUCER STATEMENTS & CERTIFICATIONS

#### 4.1 Producer Statement PS3 (Construction)
**Description:** Statement from contractor confirming work completed to specifications

**Classification Signals:**
- Contains "Producer Statement Construction (PS3)"
- Contains "Memorandum of Completion and Compliance"
- References building consent number
- Contains scope of work and compliance declaration

**Completeness Checks:**
- [ ] Issuer name and company
- [ ] Building consent number
- [ ] Council/BCA identified
- [ ] Owner name
- [ ] Project address
- [ ] Legal description
- [ ] Description of building work
- [ ] Scope of work covered
- [ ] Standards referenced (e.g., AS/NZS 2918:2001)
- [ ] Signature and date
- [ ] Registration/accreditation number

---

#### 4.2 Installer Accreditation Certificate
**Description:** Certificate showing trade qualification/accreditation (e.g., NZHHA)

**Classification Signals:**
- Contains "ACCREDITATION CERTIFICATE"
- Contains association logo (NZHHA, etc.)
- Contains "has qualified as" or "has attended"
- Contains installer number

**Completeness Checks:**
- [ ] Certificate holder name
- [ ] Company name
- [ ] Certification type/level
- [ ] Accreditation/Installer number
- [ ] Issue date
- [ ] Issuing authority
- [ ] Signature(s)

---

### 5. INSPECTION DOCUMENTATION

#### 5.1 Inspection Report
**Description:** Council inspector's report with findings and photos

**Classification Signals:**
- Contains "Inspection Results" or "Inspection Report"
- Contains reference number matching consent
- Contains inspector name and date
- Contains "PASS" or "FAIL" outcome
- Often includes embedded photos

**Completeness Checks:**
- [ ] Reference/consent number
- [ ] Project location
- [ ] Inspection date and time
- [ ] Inspector name
- [ ] Inspection type (e.g., "P+D FINAL")
- [ ] Outcome (PASS/FAIL)
- [ ] Inspection summary/findings
- [ ] Site photos (if applicable)
- [ ] Next inspection or sign-off statement

---

### 6. TECHNICAL DRAWINGS & PLANS

#### 6.1 Approved Plans (Stamped)
**Description:** Architectural/engineering drawings stamped as approved

**Classification Signals:**
- Contains approval stamp with consent number
- Contains "APPROVED" text
- Contains drawing title block
- Contains scale, revision, date information

**Completeness Checks:**
- [ ] Approval stamp with consent number
- [ ] Drawing title
- [ ] Scale indicated
- [ ] North point (site plans)
- [ ] Revision/version number
- [ ] Date
- [ ] Designer/drafter identification

**Sub-types:**
- Site Plan
- Floor Plan
- Elevation
- Section
- Detail Drawing

---

#### 6.2 Construction Detail Drawing
**Description:** Manufacturer or technical detail drawings showing installation methods

**Classification Signals:**
- Contains specific component detail (flashing, penetration, etc.)
- Contains manufacturer name or source
- Contains dimensions and materials
- Often referenced to standards

**Completeness Checks:**
- [ ] Drawing title/description
- [ ] Scale
- [ ] Dimensions shown
- [ ] Materials specified
- [ ] Installation notes (if applicable)
- [ ] Source/manufacturer identified

---

### 7. PRODUCT DOCUMENTATION

#### 7.1 Product Installation Manual
**Description:** Manufacturer's installation and operating instructions

**Classification Signals:**
- Contains manufacturer name/logo
- Contains "INSTALLATION" or "OWNER'S MANUAL"
- Contains model name/number
- Contains warranty information

**Completeness Checks:**
- [ ] Manufacturer name
- [ ] Model name/number
- [ ] Installation instructions present
- [ ] Clearance specifications
- [ ] Standards compliance reference (AS/NZS)
- [ ] Warranty terms
- [ ] Service/maintenance requirements

---

#### 7.2 Product Specification Sheet
**Description:** Technical specifications for products/materials

**Classification Signals:**
- Contains "SPECIFICATION SHEET" or "TECHNICAL SPECIFICATIONS"
- Contains model/product number
- Contains performance data tables
- Contains dimensions/measurements

**Completeness Checks:**
- [ ] Product name/model
- [ ] Manufacturer
- [ ] Technical specifications (dimensions, ratings, etc.)
- [ ] Compliance certifications
- [ ] Installation requirements (if applicable)

---

#### 7.3 Authorised Product List
**Description:** Regulatory authority list of approved products (e.g., ECAN burners)

**Classification Signals:**
- Contains "Authorised" in title
- Contains regulatory authority name (Environment Canterbury, etc.)
- Contains approval/authorisation numbers
- Table format with product listings

**Completeness Checks:**
- [ ] Regulatory authority identified
- [ ] Product brand and model listed
- [ ] Authorisation number
- [ ] Compliance data (emissions, efficiency)
- [ ] Date of list/currency

---

### 8. REGULATORY REFERENCES

#### 8.1 Building Code Acceptable Solution Extract
**Description:** Excerpts from NZ Building Code acceptable solutions (e.g., G12/AS1)

**Classification Signals:**
- Contains "Acceptable Solution" reference
- Contains NZBC clause references
- Contains "DEPARTMENT OF BUILDING AND HOUSING" or similar
- Technical compliance diagrams

**Completeness Checks:**
- [ ] Acceptable solution reference (e.g., G12/AS1)
- [ ] Relevant clause numbers
- [ ] Edition/amendment date
- [ ] Applicable diagrams/tables

---

### 9. SUPPORTING DOCUMENTS (MISCELLANEOUS)

#### 9.1 Scanned Supporting Document
**Description:** Miscellaneous scanned supporting documentation

**Classification Signals:**
- Often poor quality / scanned appearance
- May contain multiple document types
- Filename often includes "scan" or generic name

**Completeness Checks:**
- [ ] Document legible
- [ ] Relevance to consent identifiable
- [ ] Date visible (if applicable)

---

## Classification Approach

### Visual Features to Detect
1. **Headers/Titles** - Form numbers, document type names
2. **Logos** - Council logos, NZ Government coat of arms, manufacturer logos
3. **Stamps** - Approval stamps, council stamps
4. **Layout** - Forms have structured fields; drawings have title blocks
5. **Reference Numbers** - Consent numbers, title identifiers, plan numbers

### Text-Based Classification Signals
1. **Legal References** - Act sections, regulation references
2. **Form Numbers** - "Form 2", "Form 5", "Form 7", "PLG 1"
3. **Key Phrases** - "Building consent", "Code compliance", "Record of Title"
4. **Standards References** - AS/NZS numbers, NZBC clauses

### Recommended Classification Pipeline
1. **OCR/Text Extraction** - Extract all text from page
2. **Keyword Matching** - Check for classification signals
3. **Layout Analysis** - Detect forms, drawings, tables
4. **Logo/Stamp Detection** - Visual identification of authorities
5. **Confidence Scoring** - Rank matches and select best fit
6. **Fallback** - Flag uncertain documents for manual review

---

## Completeness Validation Workflow

```
1. User uploads document bundle
2. For each page:
   a. Classify document type
   b. Extract relevant fields
   c. Run completeness checks for that type
3. Generate report:
   - Documents identified
   - Missing documents (based on consent type)
   - Incomplete documents (failed checks)
   - Confidence scores
```

---

## Document Requirements by Consent Type

### Solid Fuel Heater Installation
**Required Documents:**
- [ ] Form 2 - Application
- [ ] Form PLG 1 - NES Declaration
- [ ] Record of Title
- [ ] Form 5 - Building Consent
- [ ] Approved Plans (site plan, installation details)
- [ ] Product Specification/Manual
- [ ] Authorised Burner Listing
- [ ] Producer Statement PS3
- [ ] Inspection Report
- [ ] Form 7 - Code Compliance Certificate (final)

### New Dwelling
**Required Documents:**
- [ ] Form 2 - Application
- [ ] Form PLG 1 - NES Declaration
- [ ] Record of Title
- [ ] Geotechnical Report
- [ ] Form 5 - Building Consent
- [ ] Full Drawing Set (site, floor, elevations, sections)
- [ ] Engineering PS1/PS2/PS3
- [ ] Multiple Inspection Reports
- [ ] Form 7 - Code Compliance Certificate

---

*Schema Version: 1.0*
*Based on NZ Building Act 2004 and sample documents from Thames-Coromandel District Council*
