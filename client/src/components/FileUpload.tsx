import { useState, useRef, useCallback } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFilesSelect?: (files: File[]) => void; // New prop for batch upload
  maxSizeMB?: number;
  acceptedTypes?: string[];
  disabled?: boolean;
  multiple?: boolean; // New prop to enable multiple file selection
}

const FileUpload = ({
  onFileSelect,
  onFilesSelect,
  maxSizeMB = 50,
  acceptedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'],
  disabled = false,
  multiple = false,
}: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [_dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      // Validate file size
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        alert(`File size exceeds ${maxSizeMB}MB limit`);
        return;
      }

      // Validate file type
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedTypes.includes(fileExtension)) {
        alert(`File type not supported. Accepted types: ${acceptedTypes.join(', ')}`);
        return;
      }

      onFileSelect(file);
    },
    [maxSizeMB, acceptedTypes, onFileSelect]
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setDragCounter((prev) => prev + 1);
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (multiple && onFilesSelect) {
        // Batch upload
        const validFiles = files.filter((file) => {
          const maxSizeBytes = maxSizeMB * 1024 * 1024;
          if (file.size > maxSizeBytes) {
            return false;
          }
          const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
          return acceptedTypes.includes(fileExtension);
        });
        if (validFiles.length > 0) {
          onFilesSelect(validFiles);
        }
      } else {
        // Single file upload (backward compatible)
        handleFile(files[0]);
      }
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (multiple && onFilesSelect) {
        // Batch upload
        const fileArray = Array.from(files);
        const validFiles = fileArray.filter((file) => {
          const maxSizeBytes = maxSizeMB * 1024 * 1024;
          if (file.size > maxSizeBytes) {
            return false;
          }
          const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
          return acceptedTypes.includes(fileExtension);
        });
        if (validFiles.length > 0) {
          onFilesSelect(validFiles);
        }
      } else {
        // Single file upload (backward compatible)
        handleFile(files[0]);
      }
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-300 ease-out
          overflow-hidden
          ${
            isDragging
              ? 'border-[#00FFD8] bg-gradient-to-br from-[#00FFD8]/20 to-[#39FF14]/10 scale-[1.02] shadow-2xl shadow-[#00FFD8]/30'
              : 'border-rexcan-dark-blue-secondary/30 hover:border-rexcan-dark-blue-secondary/50 hover:bg-rexcan-light-grey-secondary/30 hover:scale-[1.01] hover:shadow-lg'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {/* Animated background gradient overlay when dragging */}
        {isDragging && (
          <div className="absolute inset-0 bg-gradient-to-r from-[#00FFD8]/10 via-[#39FF14]/10 to-[#00FFD8]/10 animate-gradient-shift bg-[length:200%_200%] pointer-events-none" />
        )}

        {/* Animated border glow effect when dragging */}
        {isDragging && (
          <div className="absolute inset-0 rounded-xl border-2 border-[#00FFD8] animate-pulse pointer-events-none" />
        )}

        {/* Floating particles effect when dragging */}
        {isDragging && (
          <>
            <div className="absolute top-4 left-4 w-2 h-2 bg-[#00FFD8] rounded-full animate-float opacity-60" style={{ animationDelay: '0s' }} />
            <div className="absolute top-8 right-8 w-2 h-2 bg-[#39FF14] rounded-full animate-float opacity-60" style={{ animationDelay: '0.5s' }} />
            <div className="absolute bottom-6 left-12 w-2 h-2 bg-[#00FFD8] rounded-full animate-float opacity-60" style={{ animationDelay: '1s' }} />
            <div className="absolute bottom-8 right-12 w-2 h-2 bg-[#39FF14] rounded-full animate-float opacity-60" style={{ animationDelay: '1.5s' }} />
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleFileInputChange}
          disabled={disabled}
          multiple={multiple}
          className="hidden"
        />

        <div className="relative flex flex-col items-center justify-center space-y-4 z-10">
          {/* Icon container with animation */}
          <div
            className={`
              w-20 h-20 rounded-full flex items-center justify-center
              transition-all duration-300 ease-out
              ${
                isDragging
                  ? 'bg-gradient-to-br from-[#00FFD8] to-[#39FF14] scale-110 rotate-12 shadow-lg shadow-[#00FFD8]/50'
                  : 'bg-rexcan-dark-blue-primary/10 scale-100 rotate-0'
              }
            `}
          >
            {isDragging ? (
              // Drop icon when dragging
              <svg
                className="w-10 h-10 text-white transition-transform duration-300 animate-bounce"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              // Upload icon when not dragging
              <svg
                className={`w-10 h-10 text-rexcan-dark-blue-primary transition-all duration-300 ${
                  disabled ? '' : 'group-hover:scale-110'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            )}
          </div>

          <div className="transition-all duration-300">
            <p
              className={`
                text-lg font-semibold transition-all duration-300
                ${
                  isDragging
                    ? 'text-[#00FFD8] scale-105'
                    : 'text-rexcan-dark-blue-primary'
                }
              `}
            >
              {isDragging 
                ? `Drop your ${multiple ? 'files' : 'file'} here` 
                : `Drag & drop your ${multiple ? 'files' : 'file'} here`}
            </p>
            <p
              className={`
                text-sm mt-2 transition-all duration-300
                ${
                  isDragging
                    ? 'text-[#39FF14]'
                    : 'text-rexcan-dark-blue-secondary'
                }
              `}
            >
              or{' '}
              <span
                className={`
                  font-medium transition-colors duration-200
                  ${
                    isDragging
                      ? 'text-[#00FFD8]'
                      : 'text-[#00FFD8] hover:text-[#39FF14]'
                  }
                `}
              >
                browse
              </span>{' '}
              to upload
            </p>
          </div>

          <div
            className={`
              text-xs space-y-1 transition-all duration-300
              ${
                isDragging
                  ? 'text-[#00FFD8]/80'
                  : 'text-rexcan-dark-blue-secondary/70'
              }
            `}
          >
            <p>Supported formats: {acceptedTypes.join(', ')}</p>
            <p>Maximum file size: {maxSizeMB}MB {multiple ? 'per file' : ''}</p>
            {multiple && <p className="text-[#00FFD8] font-medium">Multiple files supported</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;

