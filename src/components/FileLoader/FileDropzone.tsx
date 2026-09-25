import { useCallback, useState } from 'react';
import type { GSFile } from '../../types';

interface FileDropzoneProps {
  onFileSelect: (gsFile: GSFile) => void;
  side?: 'A' | 'B';
}

export function FileDropzone({ onFileSelect, side }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // keep IDs distinct from AppLayout's hidden file inputs
  const inputId = side ? `dropzone-file-input-${side}` : 'dropzone-file-input';

  const validateFile = (file: File): boolean => {
    const validExtensions = ['.ply', '.splat', '.ksplat', '.spz', '.sog'];
    const extension = file.name.substring(file.name.lastIndexOf('.'));
    return validExtensions.includes(extension);
  };

  const handleFile = useCallback((file: File) => {
    if (!validateFile(file)) {
      alert('Invalid file type. Please select a .ply, .splat, .ksplat, .spz, or .sog file.');
      return;
    }

    const extension = file.name.substring(file.name.lastIndexOf('.')) as GSFile['format'];
    const gsFile: GSFile = {
      file,
      name: file.name,
      size: file.size,
      format: extension,
    };

    setSelectedFile(file.name);
    onFileSelect(gsFile);
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-xl p-4 sm:p-6 md:p-16 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'scale-105'
            : ''
          }
        `}
        style={{ 
          borderColor: isDragging ? '#B39DFF' : '#555',
          backgroundColor: isDragging ? 'rgba(62, 62, 62, 0.8)' : 'rgba(62, 62, 62, 0.5)',
          fontFamily: 'Arvo, serif'
        }}
        onClick={() => document.getElementById(inputId)?.click()}
      >
        <input
          id={inputId}
          type="file"
          accept=".ply,.splat,.ksplat,.spz,.sog"
          onChange={handleFileInput}
          className="hidden"
        />
        <div>
          {selectedFile ? (
            <div>
              <p className="font-semibold text-lg" style={{ color: '#BEFF74' }}>Selected: {selectedFile}</p>
              <p className="text-sm mt-3" style={{ color: '#FFACBF' }}>Click to select a different file</p>
            </div>
          ) : (
            <div>
              <svg className="mx-auto mb-3 sm:mb-4 md:mb-6 w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16" fill="none" stroke="#B39DFF" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm sm:text-base md:text-xl font-semibold mb-2 md:mb-4 break-words" style={{ color: '#FDFDFB' }}>
                {side === 'A' ? 'Load Reference' : side === 'B' ? 'Load Test' : 'Drop a Gaussian Splat file here'}
              </p>
              <p className="text-xs md:text-sm mb-3 md:mb-6" style={{ color: '#FFACBF' }}>or tap to browse</p>
              <div className="inline-flex max-w-full items-center justify-center rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3" style={{ backgroundColor: 'rgba(68, 68, 68, 0.3)' }}>
                <p className="text-[11px] sm:text-xs leading-relaxed break-words" style={{ color: '#FDFDFB' }}>
                  Supported: .ply, .splat, .ksplat, .spz, .sog
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
