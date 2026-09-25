import { useState, useCallback } from 'react';
import { SplatMesh, SplatFileType } from '@sparkjsdev/spark';
import type { GSFile, LoadPhaseTimings } from '../types';

export type OnLoadComplete = (
  loadTime: number,
  splatCount: number,
  phases: LoadPhaseTimings,
) => void;

export function useGSLoader() {
  const [splatMesh, setSplatMesh] = useState<SplatMesh | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [splatCount, setSplatCount] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);

  const loadFile = useCallback(async (
    gsFile: GSFile,
    onLoadComplete?: OnLoadComplete
  ) => {
    if (splatMesh) {
      splatMesh.dispose();
      setSplatMesh(null);
    }

    setLoading(true);
    setError(null);
    setLoadProgress(0);
    const startTime = performance.now();

    let fileType: SplatFileType | undefined = undefined;
    if (gsFile.format === '.ply') {
      fileType = SplatFileType.PLY;
    } else if (gsFile.format === '.splat') {
      fileType = SplatFileType.SPLAT;
    } else if (gsFile.format === '.ksplat') {
      fileType = SplatFileType.KSPLAT;
    } else if (gsFile.format === '.spz') {
      fileType = SplatFileType.SPZ;
    } else if (gsFile.format === '.sog') {
      // PlayCanvas SOG bundle, a zip of WebP attribute images and metadata
      fileType = SplatFileType.PCSOGSZIP;
    }

    try {
      const readStart = performance.now();
      const arrayBuffer = await gsFile.file.arrayBuffer();
      const fileReadMs = performance.now() - readStart;
      const fileBytes = new Uint8Array(arrayBuffer);

      const initStart = performance.now();
      const mesh = new SplatMesh({
        fileBytes,
        fileType,
        fileName: gsFile.file.name,
      });

      let lastProgress = 0;
      const progressInterval = setInterval(() => {
        lastProgress = Math.min(lastProgress + 0.1, 0.95);
        setLoadProgress(lastProgress);
      }, 100);

      await mesh.initialized;
      const meshInitMs = performance.now() - initStart;

      clearInterval(progressInterval);
      setLoadProgress(1);

      const count = mesh.numSplats;
      setSplatCount(count);
      console.log('Scene loaded with', count, 'splats');

      setSplatMesh(mesh);
      const loadTime = performance.now() - startTime;

      if (onLoadComplete) {
        onLoadComplete(loadTime, count, {
          fileReadMs,
          meshInitMs,
          loadStart: startTime,
        });
      }
    } catch (e) {
      const error = e as Error;
      console.error('Failed to load GS file:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        format: gsFile.format,
        fileName: gsFile.file.name,
        fileSize: gsFile.file.size,
        fileType: fileType,
      });
      
      if (gsFile.format === '.ksplat') {
        const formatError = new Error(
          `Failed to load ${gsFile.format} file. ` +
          `This may be due to incompatible .ksplat format variant. ` +
          `Try converting with a different tool or use .splat or .spz format instead.`
        );
        (formatError as any).originalError = e;
        setError(formatError);
      } else {
        setError(error);
      }
    } finally {
      setLoading(false);
    }
  }, [splatMesh]);

  const cleanup = useCallback(() => {
    setSplatMesh((currentMesh) => {
      if (currentMesh) {
        currentMesh.dispose();
      }
      return null;
    });
  }, []);

  return {
    splatMesh,
    loading,
    error,
    splatCount,
    loadProgress,
    loadFile,
    cleanup,
  };
}
