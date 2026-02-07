/**
 * useAnnotations - Shared hook for annotation state management
 * Single source of truth for annotations across ReviewTab, AnnotationPanel, and PDFViewer
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Annotation, AnnotationCreate, AnnotationUpdate } from '../types/annotation';
import type { Chunk } from '../types/ade';
import {
  listDocumentAnnotations,
  listProjectAnnotations,
  createAnnotation as apiCreateAnnotation,
  updateAnnotation as apiUpdateAnnotation,
  deleteAnnotation as apiDeleteAnnotation,
  resolveAnnotation as apiResolveAnnotation,
} from '../services/annotationService';
import { downloadPDFWithAnnotations } from '../utils/pdfExport';

export type ViewMode = 'page' | 'document' | 'project';

interface UseAnnotationsOptions {
  projectId: string | null;
  documentId: string | null;
  currentPage: number;
}

export interface UseAnnotationsReturn {
  // State
  annotations: Annotation[];
  isLoading: boolean;
  error: string | null;

  // Filtered views
  viewAnnotations: (viewMode: ViewMode, filterStatus: string, page?: number) => Annotation[];
  pageAnnotations: (page: number) => Annotation[];
  documentAnnotations: Annotation[];

  // Counts
  openCount: number;
  resolvedCount: number;

  // CRUD
  create: (annotation: AnnotationCreate) => Promise<Annotation | null>;
  update: (id: string, updates: AnnotationUpdate) => Promise<Annotation | null>;
  remove: (id: string) => Promise<boolean>;
  resolve: (id: string) => Promise<Annotation | null>;

  // Export
  exportPDF: (file: File, chunks: Chunk[], documentName: string) => Promise<void>;
  isExporting: boolean;

  // Reload
  reload: () => Promise<void>;
}

export function useAnnotations({ projectId, documentId, currentPage }: UseAnnotationsOptions): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Track request freshness to avoid race conditions when rapidly switching documents
  const loadIdRef = useRef(0);

  // Load all annotations for the current document (or project if no document)
  const loadAnnotations = useCallback(async () => {
    if (!projectId) {
      setAnnotations([]);
      return;
    }

    const thisLoadId = ++loadIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      let response;
      if (documentId) {
        response = await listDocumentAnnotations(projectId, documentId);
      } else {
        response = await listProjectAnnotations(projectId);
      }
      // Only apply if this is still the most recent request
      if (thisLoadId === loadIdRef.current) {
        setAnnotations(response.annotations);
      }
    } catch (err) {
      if (thisLoadId === loadIdRef.current) {
        console.error('Failed to load annotations:', err);
        setError('Failed to load annotations');
        setAnnotations([]);
      }
    } finally {
      if (thisLoadId === loadIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, documentId]);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  // Get annotations filtered by view mode and status
  const viewAnnotations = useCallback((viewMode: ViewMode, filterStatus: string, page?: number): Annotation[] => {
    let filtered = annotations;

    // Filter by status
    if (filterStatus && filterStatus !== 'all') {
      filtered = filtered.filter(a => a.status === filterStatus);
    }

    // Filter by view mode
    if (viewMode === 'page') {
      const p = page ?? currentPage;
      filtered = filtered.filter(a =>
        (a.level === 'page' && a.page_number === p) ||
        (a.level === 'document' && p === 1)
      );
    } else if (viewMode === 'document') {
      filtered = filtered.filter(a =>
        a.document_id === documentId || a.level === 'document'
      );
    }
    // 'project' mode returns all (already filtered by status)

    return filtered;
  }, [annotations, currentPage, documentId]);

  // Get page-level annotations for a specific page
  const pageAnnotationsFn = useCallback((page: number): Annotation[] => {
    return annotations.filter(a => a.level === 'page' && a.page_number === page);
  }, [annotations]);

  // Get document-level annotations
  const documentAnnotations = useMemo(() => annotations.filter(a => a.level === 'document'), [annotations]);

  // Counts
  const openCount = useMemo(() => annotations.filter(a => a.status === 'open').length, [annotations]);
  const resolvedCount = useMemo(() => annotations.filter(a => a.status === 'resolved').length, [annotations]);

  // Create annotation
  const create = useCallback(async (annotationData: AnnotationCreate): Promise<Annotation | null> => {
    if (!projectId) return null;

    try {
      const annotation = await apiCreateAnnotation(projectId, annotationData);
      setAnnotations(prev => [annotation, ...prev]);
      return annotation;
    } catch (err) {
      console.error('Failed to create annotation:', err);
      setError('Failed to create annotation');
      return null;
    }
  }, [projectId]);

  // Update annotation
  const update = useCallback(async (id: string, updates: AnnotationUpdate): Promise<Annotation | null> => {
    try {
      const updated = await apiUpdateAnnotation(id, updates);
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
      return updated;
    } catch (err) {
      console.error('Failed to update annotation:', err);
      setError('Failed to update annotation');
      return null;
    }
  }, []);

  // Delete annotation
  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiDeleteAnnotation(id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      return true;
    } catch (err) {
      console.error('Failed to delete annotation:', err);
      setError('Failed to delete annotation');
      return false;
    }
  }, []);

  // Resolve annotation
  const resolve = useCallback(async (id: string): Promise<Annotation | null> => {
    try {
      const updated = await apiResolveAnnotation(id);
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
      return updated;
    } catch (err) {
      console.error('Failed to resolve annotation:', err);
      setError('Failed to resolve annotation');
      return null;
    }
  }, []);

  // Export PDF with annotations
  const exportPDF = useCallback(async (file: File, chunks: Chunk[], documentName: string): Promise<void> => {
    if (annotations.length === 0) return;

    setIsExporting(true);
    try {
      const baseName = documentName.replace('.pdf', '');
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `${baseName}_annotated_${timestamp}.pdf`;
      await downloadPDFWithAnnotations(file, annotations, chunks, filename);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setError('Failed to export PDF with annotations');
    } finally {
      setIsExporting(false);
    }
  }, [annotations]);

  return {
    annotations,
    isLoading,
    error,
    viewAnnotations,
    pageAnnotations: pageAnnotationsFn,
    documentAnnotations,
    openCount,
    resolvedCount,
    create,
    update,
    remove,
    resolve,
    exportPDF,
    isExporting,
    reload: loadAnnotations,
  };
}
