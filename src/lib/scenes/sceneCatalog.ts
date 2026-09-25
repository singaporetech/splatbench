/**
 * Scene names shared by the batch pair parser, the CSV exporter's scene
 * inference, and the per-scene camera radius table in cameraPresets.ts.
 *
 * The Mip-NeRF 360 foliage scene appears as both `flower` (the app's internal
 * id and the radius table key) and `flowers` (the name in the Inria release).
 * Both are accepted and resolve to the same camera radius.
 */

/** Scenes with a pinned camera radius in SCENE_CAMERA_CONFIGS. */
export const PINNED_SCENES = [
  'bonsai',
  'flower',
  'garden',
  'playroom',
  'train',
  'truck',
] as const;

/**
 * The remaining scenes of the Inria pretrained release. They have no pinned
 * radius; it is measured from the reference asset at load time.
 */
export const EXTENDED_SCENES = [
  'bicycle',
  'counter',
  'drjohnson',
  'kitchen',
  'room',
  'stump',
  'treehill',
] as const;

/**
 * Alternate spellings mapped to the internal scene id. Rows keep the spelling
 * the batch used, so a `flowers-splat` pair still exports `flowers`.
 */
export const SCENE_NAME_ALIASES: Readonly<Record<string, string>> = {
  flowers: 'flower',
};

/**
 * Every scene token recognised when a scene has to be inferred from a file
 * name. Pinned scenes come first, and `playroom` precedes `room`, so a
 * substring match cannot claim a longer name.
 */
export const RECOGNIZED_SCENE_TOKENS = [
  ...PINNED_SCENES,
  ...Object.keys(SCENE_NAME_ALIASES),
  ...EXTENDED_SCENES,
] as const;

/** Map an input spelling to the internal scene id used for table lookups. */
export function canonicalSceneName(sceneName: string): string {
  const lowered = sceneName.trim().toLowerCase();
  return SCENE_NAME_ALIASES[lowered] ?? lowered;
}
