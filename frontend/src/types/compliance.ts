export interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  category: string;
  rule_reference?: string;
  required?: boolean;
  threshold?: {
    max_percentage?: number;
    max_height_m?: number;
    min_separation_m?: number;
    front_yard_min_m?: number;
    side_yard_min_m?: number;
    rear_yard_min_m?: number;
  };
  search_terms?: string[];
}

export interface CheckResult {
  check_id: string;
  check_name: string;
  check_type: 'completeness' | 'compliance';
  status: 'pass' | 'fail' | 'needs_review' | 'na';
  confidence: number;
  found_value: string | null;
  expected: string | null;
  notes: string;
  category: string;
  chunk_ids: string[];
}

export interface ComplianceReport {
  document_name: string;
  checked_at: string;
  completeness_results: CheckResult[];
  compliance_results: CheckResult[];
  summary: {
    completeness_score: number;
    compliance_score: number;
    total_checks: number;
    passed: number;
    failed: number;
    needs_review: number;
    na: number;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    model?: string;
  };
}

export interface ComplianceConfig {
  version: string;
  description: string;
  completeness_checks: ComplianceCheck[];
  compliance_checks: ComplianceCheck[];
}
