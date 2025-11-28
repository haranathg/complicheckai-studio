import type { BoundingBox } from '../types/ade';

export function calculatePixelBox(
  box: BoundingBox,
  pageWidth: number,
  pageHeight: number
): { left: number; top: number; width: number; height: number } {
  return {
    left: box.left * pageWidth,
    top: box.top * pageHeight,
    width: (box.right - box.left) * pageWidth,
    height: (box.bottom - box.top) * pageHeight,
  };
}

export const CHUNK_COLORS: Record<string, string> = {
  text: 'rgba(59, 130, 246, 0.3)',        // blue
  table: 'rgba(34, 197, 94, 0.3)',         // green
  figure: 'rgba(249, 115, 22, 0.3)',       // orange
  title: 'rgba(168, 85, 247, 0.3)',        // purple
  caption: 'rgba(236, 72, 153, 0.3)',      // pink
  form_field: 'rgba(20, 184, 166, 0.3)',   // teal
  list: 'rgba(234, 179, 8, 0.3)',          // yellow
  header: 'rgba(139, 92, 246, 0.3)',       // violet
  footer: 'rgba(107, 114, 128, 0.3)',      // gray
  page_number: 'rgba(156, 163, 175, 0.3)', // light gray
};

export function getChunkColor(type: string): string {
  return CHUNK_COLORS[type] || 'rgba(156, 163, 175, 0.3)';
}
