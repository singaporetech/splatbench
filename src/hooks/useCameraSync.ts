import { useEffect } from 'react';
import type { SparkViewerContext } from '../types';

interface CameraSyncOptions {
  sourceContext: SparkViewerContext | null;
  targetContext: SparkViewerContext | null;
  enabled: boolean;
}

/**
 * Synchronize camera movement from source viewer to target viewer
 */
export function useCameraSync({ sourceContext, targetContext, enabled }: CameraSyncOptions) {
  useEffect(() => {
    if (!sourceContext || !targetContext || !enabled) {
      return;
    }

    const syncCamera = () => {
      const sourceCamera = sourceContext.camera;
      const targetCamera = targetContext.camera;
      const sourceControls = sourceContext.controls;
      const targetControls = targetContext.controls;

      targetCamera.position.copy(sourceCamera.position);

      targetCamera.quaternion.copy(sourceCamera.quaternion);

      targetControls.target.copy(sourceControls.target);

      targetControls.update();
    };

    sourceContext.controls.addEventListener('change', syncCamera);

    syncCamera();

    console.log('Camera sync enabled: Splat B will follow Splat A camera');

    return () => {
      sourceContext.controls.removeEventListener('change', syncCamera);
      console.log('Camera sync disabled');
    };
  }, [sourceContext, targetContext, enabled]);
}
