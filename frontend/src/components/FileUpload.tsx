import React, { useRef } from 'react';

interface FileUploadProps {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

export default function FileUpload({ onUpload, isLoading }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
        onChange={handleChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="text-white px-4 py-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        style={{
          background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
          boxShadow: '0 8px 20px rgba(56, 189, 248, 0.25)',
          border: '1px solid rgba(191, 219, 254, 0.3)'
        }}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Parsing...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Document
          </>
        )}
      </button>
    </div>
  );
}
