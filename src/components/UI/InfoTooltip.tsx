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

const TOOLTIP_SIDE_PADDING = 12;
const TOOLTIP_GAP = 12;
const TOOLTIP_DEFAULT_WIDTH = 240;

export function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<{
    left: number;
    top: number;
    width: number;
  }>({
    left: TOOLTIP_SIDE_PADDING,
    top: TOOLTIP_SIDE_PADDING,
    width: TOOLTIP_DEFAULT_WIDTH,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const toggle = useCallback(() => setShow((v) => !v), []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const measuredWidth = tooltipRef.current?.offsetWidth ?? TOOLTIP_DEFAULT_WIDTH;
    const measuredHeight = tooltipRef.current?.offsetHeight ?? 0;
    const width = Math.min(
      measuredWidth,
      Math.max(TOOLTIP_DEFAULT_WIDTH, viewportWidth - TOOLTIP_SIDE_PADDING * 2),
    );
    const centeredLeft = rect.left + rect.width / 2 - width / 2;
    const maxLeft = Math.max(TOOLTIP_SIDE_PADDING, viewportWidth - width - TOOLTIP_SIDE_PADDING);
    const left = Math.min(Math.max(centeredLeft, TOOLTIP_SIDE_PADDING), maxLeft);
    const preferredTop = rect.bottom + TOOLTIP_GAP;
    const wouldOverflowBottom = measuredHeight > 0 && preferredTop + measuredHeight > viewportHeight - TOOLTIP_SIDE_PADDING;
    const top = wouldOverflowBottom
      ? Math.max(TOOLTIP_SIDE_PADDING, rect.top - measuredHeight - TOOLTIP_GAP)
      : preferredTop;

    setTooltipStyle({ left, top, width });
  }, []);

  useEffect(() => {
    if (!show) return;

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [show, updatePosition]);

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
          ref={tooltipRef}
          className="p-3 rounded-lg shadow-lg text-xs leading-relaxed"
          style={{
            position: 'fixed',
            zIndex: 9999,
            left: `${tooltipStyle.left}px`,
            top: `${tooltipStyle.top}px`,
            width: `${tooltipStyle.width}px`,
            maxWidth: `calc(100vw - ${TOOLTIP_SIDE_PADDING * 2}px)`,
            backgroundColor: '#2D2D2D',
            border: '1px solid #555',
            color: '#FDFDFB',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
