import { useRef, useState } from 'react';
import type { ViewpointPreset } from '../../lib/camera/cameraPresets';
import {
  STANDARD_VIEWPOINTS,
  applyCameraPreset,
  captureCurrentView,
  getScenePresets,
  parseViewpointsJSON,
  serializeViewpoints,
} from '../../lib/camera/cameraPresets';
import type { SparkViewerContext } from '../../types';
import { downloadJSON } from '../../lib/export/downloadJSON';

interface CameraPresetPanelProps {
  viewerContext: SparkViewerContext | null;
  sceneName?: string;
  onPresetApplied?: (preset: ViewpointPreset) => void;
}

export function CameraPresetPanel({ 
  viewerContext, 
  sceneName,
  onPresetApplied 
}: CameraPresetPanelProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customPresets, setCustomPresets] = useState<ViewpointPreset[]>([]);
  const [customError, setCustomError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  // only ever counts up, so a saved name stays unique after a removal
  const savedCountRef = useRef(0);

  const presets = sceneName 
    ? getScenePresets(sceneName)
    : STANDARD_VIEWPOINTS;

  const handleApplyPreset = (preset: ViewpointPreset) => {
    if (!viewerContext) return;
    
    const { camera, controls } = viewerContext;

    applyCameraPreset(camera, controls, preset);
    
    setActivePreset(preset.id);
    
    onPresetApplied?.(preset);
    
    console.log(`[CameraPreset] Applied: ${preset.name}`, {
      position: camera.position.toArray(),
      distance: camera.position.length().toFixed(2),
    });
  };

  const handleSaveCustom = () => {
    if (!viewerContext) return;

    const { camera, controls } = viewerContext;

    savedCountRef.current += 1;
    const captured = captureCurrentView(camera, controls);
    const customPreset: ViewpointPreset = {
      ...captured,
      id: `custom_${Date.now().toString(36)}_${savedCountRef.current}`,
      name: `Custom ${savedCountRef.current}`,
      description: 'Saved from the current camera pose',
    };

    setCustomPresets(previous => [...previous, customPreset]);
    setCustomError(null);

    console.log(`[CameraPreset] Saved: ${customPreset.name}`, {
      position: camera.position.toArray(),
      distance: camera.position.length().toFixed(2),
    });
  };

  const handleRemoveCustom = (id: string) => {
    setCustomPresets(previous => previous.filter(preset => preset.id !== id));
  };

  const handleExportCustom = () => {
    if (customPresets.length === 0) return;
    const name = sceneName || 'scene';
    downloadJSON(`${name}-viewpoints.json`, serializeViewpoints(name, customPresets));
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseViewpointsJSON(await file.text());
      setCustomPresets(previous => [...previous, ...imported]);
      setCustomError(null);
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : 'Could not read viewpoint file');
    }
    // allow re-picking the same file after a fix
    if (importInputRef.current) importInputRef.current.value = '';
  };

  if (!viewerContext) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 opacity-50">
        <div className="text-xs text-gray-400">Load a scene to use camera presets</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-3" style={{ fontFamily: 'Arvo, serif' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold" style={{ color: '#B39DFF' }}>
          Viewpoints
        </div>
        {sceneName && (
          <div className="text-xs text-gray-400" title={`Scene: ${sceneName}`}>
            {sceneName}
          </div>
        )}
      </div>
      
      {/* preset buttons */}
      <div className="space-y-1">
        {presets.map((preset, index) => (
          <button
            key={preset.id}
            onClick={() => handleApplyPreset(preset)}
            className={`
              w-full text-left text-xs py-1.5 px-2 rounded transition-colors
              flex items-center justify-between
              ${activePreset === preset.id 
                ? 'bg-purple-600 text-white' 
                : 'hover:bg-gray-700 text-gray-200'
              }
            `}
          >
            <span>
              <span className="opacity-50 mr-1">{index + 1}.</span>
              {preset.name}
            </span>
            {activePreset === preset.id && (
              <span className="text-xs opacity-75">●</span>
            )}
          </button>
        ))}
      </div>
      
      {/* custom view option */}
      <div className="mt-3 pt-2 border-t border-gray-700">
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
        >
          <span>{showCustom ? '▼' : '▶'}</span>
          Custom
        </button>
        
        {showCustom && (
          <div className="mt-2 space-y-2">
            <button
              onClick={handleSaveCustom}
              className="w-full text-xs py-1.5 px-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            >
              Save Current View
            </button>

            {customPresets.length > 0 && (
              <div className="space-y-1">
                {customPresets.map((preset, index) => (
                  <div key={preset.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleApplyPreset(preset)}
                      className={`
                        flex-1 text-left text-xs py-1.5 px-2 rounded transition-colors
                        flex items-center justify-between
                        ${activePreset === preset.id
                          ? 'bg-purple-600 text-white'
                          : 'hover:bg-gray-700 text-gray-200'
                        }
                      `}
                    >
                      <span>
                        <span className="opacity-50 mr-1">C{index + 1}.</span>
                        {preset.name}
                      </span>
                      {activePreset === preset.id && (
                        <span className="text-xs opacity-75">●</span>
                      )}
                    </button>
                    <button
                      onClick={() => handleRemoveCustom(preset.id)}
                      title={`Remove ${preset.name}`}
                      className="text-xs py-1.5 px-2 rounded text-gray-500 hover:bg-gray-700 hover:text-gray-200"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
            <div className="flex gap-1">
              <button
                onClick={handleExportCustom}
                disabled={customPresets.length === 0}
                className={`
                  flex-1 text-xs py-1.5 px-2 rounded
                  ${customPresets.length === 0
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  }
                `}
              >
                Export
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="flex-1 text-xs py-1.5 px-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                Import&hellip;
              </button>
            </div>

            {customError && (
              <div
                className="p-2 rounded-lg text-xs"
                style={{
                  backgroundColor: 'rgba(255, 87, 95, 0.15)',
                  border: '1px solid #FF575F',
                  color: '#FF575F',
                }}
              >
                {customError}
              </div>
            )}

            <div className="text-xs text-gray-500 px-1">
              Distance: {viewerContext.camera.position.length().toFixed(2)} units
            </div>
          </div>
        )}
      </div>
      
      {/* keyboard shortcuts hint */}
      <div className="mt-3 pt-2 border-t border-gray-700 text-xs text-gray-500">
        Press 1-5 to quick-select
      </div>
    </div>
  );
}
