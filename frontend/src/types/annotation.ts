/**
 * Types for document annotations (sticky notes for review workflow)
 */

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type AnnotationLevel = 'page' | 'document' | 'project';
export type AnnotationType = 'comment' | 'question' | 'issue' | 'suggestion';
export type AnnotationStatus = 'open' | 'resolved' | 'archived';
export type AnnotationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Annotation {
  id: string;
  project_id: string;
  document_id?: string;
  chunk_id?: string;
  level: AnnotationLevel;
  page_number?: number;
  bbox?: BoundingBox;
  text: string;
  title?: string;
  color: string;
  annotation_type: AnnotationType;
  status: AnnotationStatus;
  priority: AnnotationPriority;
  author?: string;
  created_at: string;
  updated_at: string;
}

export interface AnnotationCreate {
  document_id?: string;
  chunk_id?: string;
  level: AnnotationLevel;
  page_number?: number;
  bbox?: BoundingBox;
  text: string;
  title?: string;
  color?: string;
  annotation_type?: AnnotationType;
  priority?: AnnotationPriority;
  author?: string;
}

export interface AnnotationUpdate {
  text?: string;
  title?: string;
  color?: string;
  annotation_type?: AnnotationType;
  status?: AnnotationStatus;
  priority?: AnnotationPriority;
}

export interface AnnotationListResponse {
  annotations: Annotation[];
  total: number;
}

// Color mapping for annotation levels
export const ANNOTATION_COLORS: Record<AnnotationLevel, string> = {
  page: 'rgba(251, 191, 36, 0.85)',     // Yellow/Amber
  document: 'rgba(74, 222, 128, 0.85)', // Green
  project: 'rgba(96, 165, 250, 0.85)',  // Blue
};

export const ANNOTATION_BORDER_COLORS: Record<AnnotationLevel, string> = {
  page: 'rgb(245, 158, 11)',     // Amber-500
  document: 'rgb(34, 197, 94)',  // Green-500
  project: 'rgb(59, 130, 246)',  // Blue-500
};
