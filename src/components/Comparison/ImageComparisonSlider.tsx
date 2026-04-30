import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

interface ImageComparisonSliderProps {
  imageAUrl: string;
  imageBUrl: string;
  labelA: string;
  labelB: string;
  onClose: () => void;
}

export function ImageComparisonSlider({
  imageAUrl,
  imageBUrl,
  labelA,
  labelB,
  onClose,
}: ImageComparisonSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const next = ((clientX - box.left) / box.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  }, [updateFromClientX]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    updateFromClientX(event.clientX);
  }, [updateFromClientX]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Image comparison slider"
      style={{ fontFamily: 'Arvo, serif' }}
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-600 bg-[#1f1f1f] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white md:text-base">Pairwise visual comparison</div>
            <div className="text-xs text-gray-300">Drag the vertical handle to reveal {labelA} versus {labelB}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-[#FF575F] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Close
          </button>
        </div>

        <div
          ref={containerRef}
          className="relative min-h-0 flex-1 cursor-ew-resize select-none overflow-hidden bg-black touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          <img
            src={imageBUrl}
            alt={labelB}
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <img
              src={imageAUrl}
              alt={labelA}
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>

          <div
            className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)]"
            style={{ left: `${position}%` }}
            aria-hidden="true"
          />
          <div
            className="absolute top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/70 text-white shadow-lg"
            style={{ left: `${position}%` }}
            aria-hidden="true"
          >
            <span className="text-lg leading-none">↔</span>
          </div>

          <div className="absolute left-3 top-3 rounded bg-black/70 px-3 py-2 text-xs font-semibold text-white shadow">
            {labelA}
          </div>
          <div className="absolute right-3 top-3 rounded bg-black/70 px-3 py-2 text-xs font-semibold text-white shadow">
            {labelB}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-xs text-gray-200 shadow">
            {Math.round(position)}% {labelA}
          </div>
        </div>
      </div>
    </div>
  );
}
