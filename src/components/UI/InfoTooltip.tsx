/**
 * InfoTooltip: Shared tooltip component with touch-friendly activation.
 *
 * Desktop (mouse): hover to show, mouseout to hide.
 * Touch devices: tap the info icon to toggle; tap outside to dismiss.
 *
 * Uses PointerEvent.pointerType to distinguish mouse from touch, avoiding
 * the iOS Safari issue where simulated hover events fire before click and
 * cause the tooltip to flash open then immediately close.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [flipLeft, setFlipLeft] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const toggle = useCallback(() => setShow((v) => !v), []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Flip tooltip to the left when trigger is in the right half of viewport
    setFlipLeft(rect.left > window.innerWidth / 2);
  }, []);

  // Only show on hover for mouse pointers (not touch)
  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') {
        updatePosition();
        setShow(true);
      }
    },
    [updatePosition],
  );

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      setShow(false);
    }
  }, []);

  // Tap-outside-to-dismiss for touch devices
  useEffect(() => {
    if (!show) return;
    const handleOutside = (e: Event) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [show]);

  return (
    <span ref={triggerRef} className="relative inline-flex items-center" style={{ touchAction: 'manipulation' }}>
      <svg
        className="w-4 h-4 cursor-help"
        fill="none"
        stroke="#888"
        viewBox="0 0 24 24"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={(e) => {
          e.stopPropagation();
          updatePosition();
          toggle();
        }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {show && (
        <div
          className="absolute top-0 p-3 rounded-lg shadow-lg text-xs leading-relaxed"
          style={{
            zIndex: 9999,
            width: '240px',
            backgroundColor: '#2D2D2D',
            border: '1px solid #555',
            color: '#FDFDFB',
            ...(flipLeft ? { right: '24px' } : { left: '20px' }),
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
