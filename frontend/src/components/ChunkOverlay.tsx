import type { Chunk } from '../types/ade';
import { calculatePixelBox, getChunkColor } from '../utils/boundingBox';

interface ChunkOverlayProps {
  chunk: Chunk;
  pageWidth: number;
  pageHeight: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function ChunkOverlay({
  chunk,
  pageWidth,
  pageHeight,
  isSelected,
  onClick,
}: ChunkOverlayProps) {
  if (!chunk.grounding) return null;

  const { left, top, width, height } = calculatePixelBox(
    chunk.grounding.box,
    pageWidth,
    pageHeight
  );

  // Debug: log actual CSS values being applied
  if (isSelected) {
    console.log('ChunkOverlay RENDER:', {
      chunkId: chunk.id,
      inputBox: chunk.grounding.box,
      pageSize: { pageWidth, pageHeight },
      calculatedCSS: { left, top, width, height }
    });
  }

  const color = getChunkColor(chunk.type);

  return (
    <div
      className="absolute cursor-pointer transition-all duration-200 hover:opacity-80 group pointer-events-auto"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: color,
        border: isSelected ? '3px solid #f97316' : '1px solid rgba(0,0,0,0.2)',
        boxShadow: isSelected ? '0 0 0 4px rgba(249, 115, 22, 0.4), 0 0 12px rgba(249, 115, 22, 0.6)' : 'none',
      }}
      onClick={onClick}
      title={`${chunk.type}: ${chunk.markdown.substring(0, 100)}...`}
    >
      <span className="absolute -top-6 left-0 text-xs bg-gray-800 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
        {chunk.type}
      </span>
    </div>
  );
}
