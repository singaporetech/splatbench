/**
 * useBatchFolder Hook
 *
 * Manages folder selection via the browser's webkitdirectory API,
 * detects ref/test file pairs, and provides state for the batch UI.
 *
 * Naming convention:
 *   ref_<name>.<ext>  -- reference model
 *   test_<name>.<ext> -- test model
 *
 * Example:
 *   ref_bonsai.ply, test_bonsai.splat -> pair "bonsai"
 */

import { useState, useCallback } from 'react';
import type { GSFile } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FilePair {
  /** Pair name derived from the filename (e.g., "bonsai") */
  name: string;
  /** Reference file (ref_<name>.<ext>) */
  ref: GSFile;
  /** Test file (test_<name>.<ext>) */
  test: GSFile;
}

export interface UseBatchFolderReturn {
  /** Detected file pairs from the selected folder */
  pairs: FilePair[];
  /** Name of the selected folder (empty if none) */
  folderName: string;
  /** Whether a folder has been selected */
  hasFolder: boolean;
  /** Unmatched files that didn't form a pair */
  unmatchedFiles: string[];
  /** Error message if folder selection failed */
  error: string | null;
  /** Process files from a folder input event */
  handleFolderSelect: (files: FileList) => void;
  /** Clear the current folder selection */
  clearFolder: () => void;
}

// ─── Supported extensions ───────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set(['.ply', '.splat', '.ksplat', '.spz']);

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.substring(lastDot).toLowerCase() : '';
}

function isSupported(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getExtension(filename));
}

/**
 * Parse a filename into prefix (ref/test) and pair name.
 * Returns null if filename doesn't match convention.
 *
 * Examples:
 *   "ref_bonsai.ply" -> { prefix: "ref", name: "bonsai" }
 *   "test_bonsai.splat" -> { prefix: "test", name: "bonsai" }
 *   "bonsai.ply" -> null
 */
function parseFilename(
  filename: string,
): { prefix: 'ref' | 'test'; name: string } | null {
  const ext = getExtension(filename);
  const base = filename.substring(0, filename.length - ext.length);

  if (base.startsWith('ref_')) {
    return { prefix: 'ref', name: base.substring(4) };
  }
  if (base.startsWith('test_')) {
    return { prefix: 'test', name: base.substring(5) };
  }
  return null;
}

function fileToGSFile(file: File): GSFile {
  const ext = getExtension(file.name) as GSFile['format'];
  return {
    file,
    name: file.name,
    size: file.size,
    format: ext,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBatchFolder(): UseBatchFolderReturn {
  const [pairs, setPairs] = useState<FilePair[]>([]);
  const [folderName, setFolderName] = useState('');
  const [unmatchedFiles, setUnmatchedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFolderSelect = useCallback((files: FileList) => {
    setError(null);

    if (files.length === 0) {
      setError('No files found in the selected folder.');
      return;
    }

    // Derive folder name from the first file's path
    const firstPath = (files[0] as File & { webkitRelativePath?: string })
      .webkitRelativePath;
    const derivedFolderName = firstPath
      ? firstPath.split('/')[0]
      : 'Selected Folder';
    setFolderName(derivedFolderName);

    // Collect supported files
    const refs = new Map<string, File>();
    const tests = new Map<string, File>();
    const unmatched: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isSupported(file.name)) continue;

      const parsed = parseFilename(file.name);
      if (!parsed) {
        unmatched.push(file.name);
        continue;
      }

      if (parsed.prefix === 'ref') {
        refs.set(parsed.name, file);
      } else {
        tests.set(parsed.name, file);
      }
    }

    // Match pairs
    const matched: FilePair[] = [];
    for (const [name, refFile] of refs) {
      const testFile = tests.get(name);
      if (testFile) {
        matched.push({
          name,
          ref: fileToGSFile(refFile),
          test: fileToGSFile(testFile),
        });
        tests.delete(name);
      } else {
        unmatched.push(refFile.name);
      }
    }

    // Remaining unmatched tests
    for (const [, testFile] of tests) {
      unmatched.push(testFile.name);
    }

    // Sort pairs alphabetically
    matched.sort((a, b) => a.name.localeCompare(b.name));

    setPairs(matched);
    setUnmatchedFiles(unmatched);

    if (matched.length === 0) {
      setError(
        'No matching pairs found. Files must be named ref_<name>.<ext> and test_<name>.<ext>.',
      );
    }
  }, []);

  const clearFolder = useCallback(() => {
    setPairs([]);
    setFolderName('');
    setUnmatchedFiles([]);
    setError(null);
  }, []);

  return {
    pairs,
    folderName,
    hasFolder: pairs.length > 0 || folderName !== '',
    unmatchedFiles,
    error,
    handleFolderSelect,
    clearFolder,
  };
}
