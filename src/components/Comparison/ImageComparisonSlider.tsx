/* eslint-disable react-hooks/immutability -- This component temporarily re-parents and resizes imperative Three.js viewer contexts for the live comparison overlay. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SparkViewerContext } from '../../types';

interface ImageComparisonSliderProps {
  contextA: SparkViewerContext;
  contextB: SparkViewerContext;
  labelA: string;
  labelB: string;
  onClose: () => void;
}

type CanvasMountSnapshot = {
  canvas: HTMLCanvasElement;
  parent: Node;
  nextSibling: ChildNode | null;
  style: string | null;
};

function resizeContextToElement(context: SparkViewerContext, element: HTMLElement) {
  const width = Math.max(1, Math.round(element.clientWidth));
  const height = Math.max(1, Math.round(element.clientHeight));

  context.camera.aspect = width / height;
  context.camera.updateProjectionMatrix();
  context.renderer.setSize(width, height);
  context.forceRender();
}

function syncCamera(source: SparkViewerContext, target: SparkViewerContext) {
  target.camera.position.copy(source.camera.position);
  target.camera.quaternion.copy(source.camera.quaternion);
  target.camera.up.copy(source.camera.up);
  target.camera.zoom = source.camera.zoom;
  target.camera.updateProjectionMatrix();
  target.controls.target.copy(source.controls.target);
  target.controls.update();
}

export function ImageComparisonSlider({
  contextA,
  contextB,
  labelA,
  labelB,
  onClose,
}: ImageComparisonSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasHostARef = useRef<HTMLDivElement | null>(null);
  const canvasHostBRef = useRef<HTMLDivElement | null>(null);
  const cameraControlRef = useRef<HTMLDivElement | null>(null);
  const draggingDividerRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const next = ((clientX - box.left) / box.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  const handleDividerPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    draggingDividerRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientX(event.clientX);
  }, [updateFromClientX]);

  const handleDividerPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!draggingDividerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    updateFromClientX(event.clientX);
  }, [updateFromClientX]);

  const handleDividerPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    draggingDividerRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const hostA = canvasHostARef.current;
    const hostB = canvasHostBRef.current;
    const cameraControlLayer = cameraControlRef.current;

    if (!container || !hostA || !hostB || !cameraControlLayer) return;

    const snapshots: CanvasMountSnapshot[] = [];
    const mountCanvas = (context: SparkViewerContext, host: HTMLDivElement) => {
      const canvas = context.canvas;
      const parent = canvas.parentNode;
      if (!parent) return;

      snapshots.push({
        canvas,
        parent,
        nextSibling: canvas.nextSibling,
        style: canvas.getAttribute('style'),
      });

      host.appendChild(canvas);
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none';
    };

    mountCanvas(contextB, hostB);
    mountCanvas(contextA, hostA);

    const previousEnabledA = contextA.controls.enabled;
    const previousEnabledB = contextB.controls.enabled;
    contextA.controls.enabled = false;
    contextB.controls.enabled = false;

    const sliderControls = new OrbitControls(contextA.camera, cameraControlLayer);
    sliderControls.enableDamping = true;
    sliderControls.dampingFactor = contextA.controls.dampingFactor;
    sliderControls.enablePan = contextA.controls.enablePan;
    sliderControls.enableZoom = contextA.controls.enableZoom;
    sliderControls.enableRotate = contextA.controls.enableRotate;
    sliderControls.minDistance = contextA.controls.minDistance;
    sliderControls.maxDistance = contextA.controls.maxDistance;
    sliderControls.minPolarAngle = contextA.controls.minPolarAngle;
    sliderControls.maxPolarAngle = contextA.controls.maxPolarAngle;
    sliderControls.target.copy(contextA.controls.target);
    sliderControls.update();

    const applySyncedCamera = () => {
      contextA.controls.target.copy(sliderControls.target);
      contextA.controls.update();
      syncCamera(contextA, contextB);
    };

    sliderControls.addEventListener('change', applySyncedCamera);

    const resizeBoth = () => {
      resizeContextToElement(contextA, container);
      resizeContextToElement(contextB, container);
      applySyncedCamera();
    };

    const resizeObserver = new ResizeObserver(resizeBoth);
    resizeObserver.observe(container);
    const resizeFrame = requestAnimationFrame(resizeBoth);

    let animationFrame = 0;
    const animateControls = () => {
      // Keep keyboard-applied presets and other app-level camera changes usable
      // while the live slider is open.
      sliderControls.target.copy(contextA.controls.target);
      sliderControls.update();
      applySyncedCamera();
      animationFrame = requestAnimationFrame(animateControls);
    };
    animationFrame = requestAnimationFrame(animateControls);

    return () => {
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      sliderControls.removeEventListener('change', applySyncedCamera);
      sliderControls.dispose();

      contextA.controls.enabled = previousEnabledA;
      contextB.controls.enabled = previousEnabledB;

      for (const snapshot of snapshots.reverse()) {
        if (snapshot.style === null) {
          snapshot.canvas.removeAttribute('style');
        } else {
          snapshot.canvas.setAttribute('style', snapshot.style);
        }

        snapshot.parent.insertBefore(snapshot.canvas, snapshot.nextSibling);

        if (snapshot.parent instanceof HTMLElement) {
          if (snapshot.canvas === contextA.canvas) {
            resizeContextToElement(contextA, snapshot.parent);
          }
          if (snapshot.canvas === contextB.canvas) {
            resizeContextToElement(contextB, snapshot.parent);
          }
        }
      }

      contextA.controls.update();
      contextB.controls.update();
    };
  }, [contextA, contextB]);

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
      aria-label="Live A/B comparison slider"
      style={{ fontFamily: 'Arvo, serif' }}
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-600 bg-[#1f1f1f] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white md:text-base">Pairwise visual comparison</div>
            <div className="text-xs text-gray-300">
              Drag the scene to move the synced camera. Drag the vertical handle to reveal {labelA} versus {labelB}.
            </div>
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
          className="relative min-h-0 flex-1 select-none overflow-hidden bg-black"
        >
          <div ref={canvasHostBRef} className="absolute inset-0" />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <div ref={canvasHostARef} className="absolute inset-0" />
          </div>

          <div
            ref={cameraControlRef}
            className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing touch-none"
            aria-label="Move synchronized comparison camera"
          />

          <div
            className="absolute inset-y-0 z-30 w-10 -translate-x-1/2 cursor-ew-resize touch-none"
            style={{ left: `${position}%` }}
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
            onPointerCancel={handleDividerPointerUp}
            aria-label="Comparison split position"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
          >
            <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)]" aria-hidden="true" />
            <div
              className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/70 text-white shadow-lg"
              aria-hidden="true"
            >
              <span className="text-lg leading-none">↔</span>
            </div>
          </div>

          <div className="pointer-events-none absolute left-3 top-3 z-40 rounded bg-black/70 px-3 py-2 text-xs font-semibold text-white shadow">
            {labelA}
          </div>
          <div className="pointer-events-none absolute right-3 top-3 z-40 rounded bg-black/70 px-3 py-2 text-xs font-semibold text-white shadow">
            {labelB}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-xs text-gray-200 shadow">
            {Math.round(position)}% {labelA} · drag scene to orbit, pan, or zoom
          </div>
        </div>
      </div>
    </div>
  );
}
