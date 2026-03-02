import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { GSFile, SparkViewerContext } from '../../types';
import { FileDropzone } from '../FileLoader/FileDropzone';
import { GSViewer } from '../Viewer/GSViewer';
import { CameraDistance } from '../Viewer/CameraDistance';
import { MetricsPanel } from '../Metrics/MetricsPanel';
import { CameraPresetPanel } from '../Camera/CameraPresetPanel';
import { useMetrics } from '../../hooks/useMetrics';
import { useImageQuality } from '../../hooks/useImageQuality';
import { useCameraSync } from '../../hooks/useCameraSync';
import { getScenePresets, resetControlsMomentum } from '../../lib/camera/cameraPresets';
import { captureComparisonScreenshot, generateComparisonFilename, downloadScreenshot } from '../../lib/export/screenshot';
import { createExportRecord, exportAndDownload } from '../../lib/export/csvExport';
import { TestPanel } from '../Testing/TestPanel';

// Scene detection from filename
function detectSceneName(filename: string): string | null {
  const knownScenes = ['bonsai', 'garden', 'playroom', 'truck', 'train', 'flower'];
  const lowerFilename = filename.toLowerCase();
  
  for (const scene of knownScenes) {
    if (lowerFilename.includes(scene)) {
      return scene;
    }
  }
  
  // Try to extract base name (remove extension and common suffixes)
  const baseName = filename
    .replace(/\.(ply|splat|ksplat|spz)$/i, '')
    .replace(/-splatfacto$/i, '')
    .replace(/_converted$/i, '');
  
  return baseName || null;
}

export function AppLayout() {
  const [fileA, setFileA] = useState<GSFile | null>(null);
  const [fileB, setFileB] = useState<GSFile | null>(null);
  const [contextA, setContextA] = useState<SparkViewerContext | null>(null);
  const [contextB, setContextB] = useState<SparkViewerContext | null>(null);
  const [cameraSyncEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'metrics' | 'tests'>('metrics');
  const [showCameraPresets, setShowCameraPresets] = useState(true);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState<string | null>(null);

  const metricsA = useMetrics();
  const metricsB = useMetrics();
  const imageQuality = useImageQuality();

  // Detect scene names from filenames
  const sceneNameA = useMemo(() => detectSceneName(fileA?.name || ''), [fileA?.name]);
  const sceneNameB = useMemo(() => detectSceneName(fileB?.name || ''), [fileB?.name]);
  const currentScene = sceneNameA || sceneNameB || 'unknown';

  // Camera sync: Splat B follows Splat A
  useCameraSync({
    sourceContext: contextA,
    targetContext: contextB,
    enabled: cameraSyncEnabled && !!contextA && !!contextB,
  });

  // Screenshot capture handler (independent of tabs)
  const handleCaptureScreenshot = useCallback(async () => {
    if (!contextA || !contextB) {
      setScreenshotStatus('Load both splats first');
      setTimeout(() => setScreenshotStatus(null), 3000);
      return;
    }
    
    setIsCapturingScreenshot(true);
    setScreenshotStatus('Capturing...');
    
    try {
      const blob = await captureComparisonScreenshot(contextA, contextB);
      const filename = generateComparisonFilename(currentScene, 'current', new Date().toISOString());
      downloadScreenshot(blob, filename);
      setScreenshotStatus(`Saved: ${filename}`);
      console.log('[Screenshot] Captured:', filename);
    } catch (error) {
      console.error('[Screenshot] Failed:', error);
      setScreenshotStatus('Capture failed');
    } finally {
      setIsCapturingScreenshot(false);
      setTimeout(() => setScreenshotStatus(null), 3000);
    }
  }, [contextA, contextB, currentScene]);

  // CSV export handler
  const handleExportCSV = useCallback(() => {
    if (!contextA || !contextB) {
      console.warn('[Export] Load both splats first');
      return;
    }
    
    const cameraPos = contextA.camera.position;
    const record = createExportRecord(
      currentScene,
      fileA?.format.replace('.', '') || 'unknown',
      fileB?.format.replace('.', '') || 'unknown',
      'current',
      cameraPos.length(),
      { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
      metricsA.metrics,
      metricsB.metrics,
      imageQuality.metrics,
    );
    exportAndDownload(record);
    console.log('[Export] CSV downloaded for', currentScene);
  }, [contextA, contextB, currentScene, fileA, fileB, metricsA.metrics, metricsB.metrics, imageQuality.metrics]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;
      
      // Number keys 1-5 for camera presets
      if (e.key >= '1' && e.key <= '5') {
        const presetIndex = parseInt(e.key) - 1;
        const presets = getScenePresets(currentScene);
        if (presetIndex < presets.length && contextA) {
          const preset = presets[presetIndex];
          resetControlsMomentum(contextA.controls);
          contextA.camera.position.set(preset.position.x, preset.position.y, preset.position.z);
          contextA.controls.target.set(preset.target.x, preset.target.y, preset.target.z);
          contextA.controls.update();
          console.log(`[Keyboard] Applied camera preset: ${preset.name}`);
        }
        return;
      }
      
      // 'C' for screenshot capture
      if (e.key === 'c' || e.key === 'C') {
        console.log('[Keyboard] Capture screenshot');
        handleCaptureScreenshot();
        return;
      }
      
      // 'E' for CSV export (direct download)
      if (e.key === 'e' || e.key === 'E') {
        console.log('[Keyboard] Export CSV');
        handleExportCSV();
        return;
      }
      
      // 'M' for metrics
      if (e.key === 'm' || e.key === 'M') {
        setActiveTab('metrics');
        return;
      }
      
      // 'P' to toggle camera presets
      if (e.key === 'p' || e.key === 'P') {
        setShowCameraPresets(prev => !prev);
        return;
      }
      
      // 'T' for tests tab
      if (e.key === 't' || e.key === 'T') {
        setActiveTab('tests');
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextA, currentScene, handleCaptureScreenshot, handleExportCSV]);

  const handleFileSelectA = (file: GSFile) => {
    metricsA.reset();
    setFileA(file);
    console.log(`[File] Loaded A: ${file.name} (detected scene: ${detectSceneName(file.name)})`);
  };

  const handleFileSelectB = (file: GSFile) => {
    metricsB.reset();
    setFileB(file);
    console.log(`[File] Loaded B: ${file.name} (detected scene: ${detectSceneName(file.name)})`);
  };

  // Auto-trigger quality comparison when both files are loaded
  useEffect(() => {
    if (fileA && fileB && contextA && contextB && !imageQuality.isComparing && imageQuality.metrics.psnr === null) {
      const timer = setTimeout(() => {
        console.log('=== Auto-triggering Quality Comparison ===');
        console.log('Splat A:', fileA.name, 'Scene:', detectSceneName(fileA.name));
        console.log('Splat B:', fileB.name, 'Scene:', detectSceneName(fileB.name));
        if (fileA.name === fileB.name) {
          console.warn('⚠️ WARNING: Both viewers loaded the SAME FILE!');
        }
        imageQuality.compareQuality(contextA, contextB);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [fileA, fileB, contextA, contextB, imageQuality.isComparing, imageQuality.metrics.psnr]);

  // Refs for resolving batch-load promises when viewer context becomes ready
  const contextResolverA = useRef<((ctx: SparkViewerContext) => void) | null>(null);
  const contextResolverB = useRef<((ctx: SparkViewerContext) => void) | null>(null);

  const handleContextReadyA = useCallback((context: SparkViewerContext) => {
    setContextA(context);
    // Resolve any pending batch-load promise
    if (contextResolverA.current) {
      contextResolverA.current(context);
      contextResolverA.current = null;
    }
  }, []);

  const handleContextReadyB = useCallback((context: SparkViewerContext) => {
    setContextB(context);
    // Resolve any pending batch-load promise
    if (contextResolverB.current) {
      contextResolverB.current(context);
      contextResolverB.current = null;
    }
  }, []);

  /**
   * Load a file into the reference (A / left) viewer and return the
   * SparkViewerContext once the viewer is ready.  Used by BatchTestPanel
   * to programmatically load file pairs.
   */
  const handleBatchLoadRef = useCallback(
    (file: GSFile): Promise<SparkViewerContext | null> => {
      return new Promise<SparkViewerContext | null>((resolve) => {
        // Clear stale state
        metricsA.reset();
        imageQuality.reset();
        setContextA(null);

        // Register resolver — will be called by handleContextReadyA
        contextResolverA.current = resolve;

        // Trigger the viewer to load the new file
        setFileA(file);
        console.log(`[Batch] Loading ref: ${file.name}`);
      });
    },
    [metricsA, imageQuality],
  );

  /**
   * Load a file into the test (B / right) viewer and return the
   * SparkViewerContext once the viewer is ready.
   */
  const handleBatchLoadTest = useCallback(
    (file: GSFile): Promise<SparkViewerContext | null> => {
      return new Promise<SparkViewerContext | null>((resolve) => {
        metricsB.reset();
        imageQuality.reset();
        setContextB(null);

        contextResolverB.current = resolve;

        setFileB(file);
        console.log(`[Batch] Loading test: ${file.name}`);
      });
    },
    [metricsB, imageQuality],
  );

  const handleLoadCompleteA = (loadTime: number, splatCount: number) => {
    console.log('handleLoadCompleteA:', { loadTime, splatCount, fileSize: fileA?.size });
    metricsA.setLoadTime(loadTime);
    metricsA.setFileInfo(fileA?.size || 0, splatCount);
  };

  const handleLoadCompleteB = (loadTime: number, splatCount: number) => {
    console.log('handleLoadCompleteB:', { loadTime, splatCount, fileSize: fileB?.size });
    metricsB.setLoadTime(loadTime);
    metricsB.setFileInfo(fileB?.size || 0, splatCount);
  };

  const handleFrameUpdateA = (deltaTime: number) => {
    metricsA.recordFrame(deltaTime);
  };

  const handleFrameUpdateB = (deltaTime: number) => {
    metricsB.recordFrame(deltaTime);
  };

  const handleChangeA = () => {
    document.getElementById('file-input-A')?.click();
  };

  const handleChangeB = () => {
    document.getElementById('file-input-B')?.click();
  };

  const handleClearA = () => {
    setFileA(null);
    setContextA(null);
    metricsA.reset();
    imageQuality.reset();
  };

  const handleClearB = () => {
    setFileB(null);
    setContextB(null);
    metricsB.reset();
    imageQuality.reset();
  };

  const handleClearAll = () => {
    setFileA(null);
    setFileB(null);
    setContextA(null);
    setContextB(null);
    metricsA.reset();
    metricsB.reset();
    imageQuality.reset();
  };

  const handleManualCompareQuality = () => {
    if (contextA && contextB) {
      console.log('=== Manual Quality Comparison Triggered ===');
      imageQuality.compareQuality(contextA, contextB);
    }
  };

  // Update resolution on window resize for both viewers
  useEffect(() => {
    const updateResolution = () => {
      const canvases = document.querySelectorAll('canvas[data-engine="three.js r182"]');
      if (canvases.length >= 1) {
        const canvasA = canvases[0] as HTMLCanvasElement;
        metricsA.setResolution(canvasA.width, canvasA.height);
      }
      if (canvases.length >= 2) {
        const canvasB = canvases[1] as HTMLCanvasElement;
        metricsB.setResolution(canvasB.width, canvasB.height);
      }
    };

    const timeoutId = setTimeout(updateResolution, 100);
    window.addEventListener('resize', updateResolution);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateResolution);
    };
  }, [fileA, fileB]);

  return (
    <div className="flex flex-col bg-gray-900" style={{ height: '100dvh' }}>
      {/* Hidden file inputs */}
      <input
        id="file-input-A"
        type="file"
        accept=".ply,.splat,.ksplat,.spz"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const extension = file.name.substring(file.name.lastIndexOf('.')) as GSFile['format'];
            const gsFile: GSFile = {
              file,
              name: file.name,
              size: file.size,
              format: extension,
            };
            handleClearA();
            setTimeout(() => handleFileSelectA(gsFile), 50);
          }
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        id="file-input-B"
        type="file"
        accept=".ply,.splat,.ksplat,.spz"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const extension = file.name.substring(file.name.lastIndexOf('.')) as GSFile['format'];
            const gsFile: GSFile = {
              file,
              name: file.name,
              size: file.size,
              format: extension,
            };
            handleClearB();
            setTimeout(() => handleFileSelectB(gsFile), 50);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Header */}
      <header className="px-4 py-3 md:px-6 md:py-4 flex items-center justify-between shadow-lg" style={{ backgroundColor: '#3E3E3E', borderBottom: '1px solid #555', fontFamily: 'Arvo, serif' }}>
        <div>
          <h1 className="text-xl md:text-3xl tracking-tight" style={{ color: '#B39DFF', fontFamily: 'Arvo, serif' }}>SplatBench</h1>
          <p className="text-xs mt-1 hidden md:block" style={{ color: '#FFACBF', fontFamily: 'Arvo, serif' }}>3D Gaussian Splatting Benchmark</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-gray-400 hidden lg:block">
            <span className="mr-2">1-5: Viewpoints</span>
            <span className="mr-2">C: Capture</span>
            <span className="mr-2">E: CSV Export</span>
            <span className="mr-2">M: Metrics</span>
            <span>T: Tests</span>
          </div>
          {(fileA || fileB) && (
            <button
              onClick={handleClearAll}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
              style={{ backgroundColor: '#B39DFF', fontFamily: 'Arvo, serif' }}
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Split Viewer Area */}
        <div className="flex-1 flex flex-col md:flex-row relative">
          {/* Splat A */}
          <div className="flex-1 relative min-h-0 viewer-a-pane">
            {/* File info top-left */}
            <div className="absolute top-4 left-4 z-20">
              <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(62, 62, 62, 0.9)', fontFamily: 'Arvo, serif' }}>
                <div className="text-sm font-semibold mb-0.5" style={{ color: '#B39DFF' }}>Reference Model</div>
                {fileA && (
                  <div className="text-sm truncate max-w-[200px]" title={fileA.name} style={{ color: '#FDFDFB' }}>
                    {fileA.name}
                  </div>
                )}
                {sceneNameA && (
                  <div className="text-xs text-gray-400 mt-0.5">Scene: {sceneNameA}</div>
                )}
              </div>
            </div>
            {/* Change button top-right */}
            {fileA && (
              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={handleChangeA}
                  className="px-3 py-2 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg whitespace-nowrap"
                  style={{ backgroundColor: '#FF575F', fontFamily: 'Arvo, serif' }}
                  title="Change file for Splat A"
                >
                  Change
                </button>
              </div>
            )}
            {/* Camera Presets for A */}
            {fileA && showCameraPresets && (
              <div className="absolute top-24 left-4 z-20">
                <CameraPresetPanel 
                  viewerContext={contextA} 
                  sceneName={sceneNameA || undefined}
                  onPresetApplied={(preset) => console.log('[Preset] Applied:', preset.name)}
                />
              </div>
            )}
            {!fileA ? (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="max-w-lg w-full">
                  <FileDropzone onFileSelect={handleFileSelectA} side="A" />
                </div>
              </div>
            ) : (
              <GSViewer
                gsFile={fileA}
                onLoadComplete={handleLoadCompleteA}
                onFrameUpdate={handleFrameUpdateA}
                onViewerReady={handleContextReadyA}
              />
            )}
          </div>

          {/* Splat B */}
          <div className="flex-1 relative min-h-0">
            {/* File info top-left */}
            <div className="absolute top-4 left-4 z-20">
              <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(62, 62, 62, 0.9)', fontFamily: 'Arvo, serif' }}>
                <div className="text-sm font-semibold mb-0.5" style={{ color: '#FFACBF' }}>Test Model</div>
                {fileB && (
                  <div className="text-sm truncate max-w-[200px]" title={fileB.name} style={{ color: '#FDFDFB' }}>
                    {fileB.name}
                  </div>
                )}
                {sceneNameB && (
                  <div className="text-xs text-gray-400 mt-0.5">Scene: {sceneNameB}</div>
                )}
              </div>
            </div>
            {/* Change button top-right */}
            {fileB && (
              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={handleChangeB}
                  className="px-3 py-2 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg whitespace-nowrap"
                  style={{ backgroundColor: '#FF575F', fontFamily: 'Arvo, serif' }}
                  title="Change file for Splat B"
                >
                  Change
                </button>
              </div>
            )}
            {/* Camera Presets for B */}
            {fileB && showCameraPresets && (
              <div className="absolute top-24 left-4 z-20">
                <CameraPresetPanel 
                  viewerContext={contextB} 
                  sceneName={sceneNameB || undefined}
                  onPresetApplied={(preset) => console.log('[Preset] Applied to B:', preset.name)}
                />
              </div>
            )}
            {!fileB ? (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="max-w-lg w-full">
                  <FileDropzone onFileSelect={handleFileSelectB} side="B" />
                </div>
              </div>
            ) : (
              <GSViewer
                gsFile={fileB}
                onLoadComplete={handleLoadCompleteB}
                onFrameUpdate={handleFrameUpdateB}
                onViewerReady={handleContextReadyB}
              />
            )}
          </div>

          {/* Navigation Controls */}
          {(fileA || fileB) && (
            <div className="absolute bottom-4 left-4 space-y-3" style={{ zIndex: 30 }}>
              <div className="px-4 py-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(62, 62, 62, 0.9)', color: '#FDFDFB', fontFamily: 'Arvo, serif' }}>
                <div className="font-semibold mb-2" style={{ color: '#B39DFF' }}>Navigation Controls</div>
                <div className="space-y-1">
                  <div><span className="font-medium">Rotate</span> - Left-click + Drag</div>
                  <div><span className="font-medium">Pan</span> - Right-click + Drag</div>
                  <div><span className="font-medium">Dolly</span> - Scroll / Pinch</div>
                </div>
              </div>
              <CameraDistance context={contextA} />
            </div>
          )}

          {/* Screenshot Button - Independent of tabs */}
          {(fileA && fileB) && (
            <div className="absolute bottom-4 right-4" style={{ zIndex: 30 }}>
              <div className="flex flex-col items-end gap-2">
                {screenshotStatus && (
                  <div 
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ 
                      backgroundColor: 'rgba(62, 62, 62, 0.95)', 
                      color: screenshotStatus.includes('failed') ? '#FF575F' : '#4ADE80',
                      fontFamily: 'Arvo, serif'
                    }}
                  >
                    {screenshotStatus}
                  </div>
                )}
                <button
                  onClick={handleCaptureScreenshot}
                  disabled={isCapturingScreenshot || !contextA || !contextB}
                  className="px-4 py-3 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{ 
                    backgroundColor: isCapturingScreenshot ? '#6B7280' : '#B39DFF', 
                    fontFamily: 'Arvo, serif' 
                  }}
                  title="Capture side-by-side screenshot (C)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  {isCapturingScreenshot ? 'Capturing...' : 'Screenshot'}
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={!contextA || !contextB}
                  className="px-4 py-3 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{ 
                    backgroundColor: '#FFACBF', 
                    fontFamily: 'Arvo, serif' 
                  }}
                  title="Export metrics to CSV (E)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  CSV
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Tabbed Interface */}
        <div className="w-full md:w-80 flex flex-col max-h-[40vh] md:max-h-none border-t md:border-t-0 md:border-l border-gray-600" style={{ borderColor: '#444' }}>
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-600" style={{ backgroundColor: '#3E3E3E' }}>
            {(['metrics', 'tests'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${
                  activeTab === tab
                    ? 'text-white border-b-2'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                style={{
                  borderColor: activeTab === tab ? '#B39DFF' : 'transparent',
                  fontFamily: 'Arvo, serif',
                }}
              >
                {tab === 'metrics' && 'Metrics'}
                {tab === 'tests' && 'Tests'}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#3E3E3E' }}>
            {activeTab === 'metrics' && (
              <MetricsPanel
                metricsA={metricsA.metrics}
                metricsB={metricsB.metrics}
                showComparison={!!(fileA && fileB)}
                qualityMetrics={imageQuality.metrics}
                onCompareQuality={handleManualCompareQuality}
                isComparingQuality={imageQuality.isComparing}
              />
            )}

            {activeTab === 'tests' && (
              <TestPanel
                contextA={contextA}
                contextB={contextB}
                onLoadRef={handleBatchLoadRef}
                onLoadTest={handleBatchLoadTest}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
