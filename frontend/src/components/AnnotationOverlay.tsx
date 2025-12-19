/**
 * Annotation Overlay - Renders sticky note annotations on top of PDF pages
 */
import { useState } from 'react';
import type { Annotation } from '../types/annotation';
import { ANNOTATION_COLORS, ANNOTATION_BORDER_COLORS } from '../types/annotation';

interface AnnotationOverlayProps {
  annotation: Annotation;
  pageWidth: number;
  pageHeight: number;
  isSelected?: boolean;
  onClick?: () => void;
}

export default function AnnotationOverlay({
  annotation,
  pageWidth,
  pageHeight,
  isSelected,
  onClick,
}: AnnotationOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get position from bbox or chunk_id's bbox, or default to top-right corner
  const getPosition = () => {
    if (annotation.bbox) {
      return {
        left: annotation.bbox.left * pageWidth,
        top: annotation.bbox.top * pageHeight,
      };
    }
    // Default position - top right area with some offset based on annotation id
    const hash = annotation.id.charCodeAt(0) % 5;
    return {
      left: pageWidth - 180 - (hash * 20),
      top: 20 + (hash * 40),
    };
  };

  const position = getPosition();
  const bgColor = ANNOTATION_COLORS[annotation.level];
  const borderColor = ANNOTATION_BORDER_COLORS[annotation.level];

  // Debug: log annotation level and color
  console.log('[AnnotationOverlay]', {
    text: annotation.text.substring(0, 30),
    level: annotation.level,
    bgColor,
  });

  // Sticky note dimensions
  const stickyWidth = isExpanded ? 200 : 160;
  const stickyMinHeight = isExpanded ? 80 : 40;

  // Ensure sticky stays within page bounds
  const constrainedLeft = Math.min(position.left, pageWidth - stickyWidth - 10);
  const constrainedTop = Math.max(position.top, 10);

  return (
    <div
      className={`absolute pointer-events-auto cursor-pointer transition-all duration-200 z-20 ${
        isSelected ? 'ring-2 ring-orange-500 ring-offset-2' : ''
      }`}
      style={{
        left: `${constrainedLeft}px`,
        top: `${constrainedTop}px`,
        width: `${stickyWidth}px`,
        minHeight: `${stickyMinHeight}px`,
        backgroundColor: bgColor,
        borderLeft: `4px solid ${borderColor}`,
        boxShadow: '2px 2px 8px rgba(0,0,0,0.2)',
        borderRadius: '2px',
        transform: 'rotate(-1deg)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
        onClick?.();
      }}
    >
      {/* Resolved indicator */}
      {annotation.status === 'resolved' && (
        <div className="absolute top-1 right-1 text-green-700 text-xs font-bold">✓</div>
      )}

      {/* Sticky note content */}
      <div className="px-2 py-1.5 pt-2">
        <p
          className={`text-xs text-gray-800 leading-tight ${
            isExpanded ? '' : 'line-clamp-2'
          }`}
          style={{
            overflow: isExpanded ? 'visible' : 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: isExpanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {annotation.text}
        </p>
        {!isExpanded && annotation.text.length > 60 && (
          <span className="text-[10px] text-gray-600 italic">...click to expand</span>
        )}
      </div>

      {/* Fold corner effect */}
      <div
        className="absolute bottom-0 right-0 w-0 h-0"
        style={{
          borderStyle: 'solid',
          borderWidth: '0 0 12px 12px',
          borderColor: `transparent transparent rgba(0,0,0,0.1) transparent`,
        }}
      />
    </div>
  );
}
