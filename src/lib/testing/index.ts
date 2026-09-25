export type {
  Test,
  TestResult,
  TestScene,
  TestProgress,
  TestStatus,
  TestMetricEntry,
  OnProgress,
} from './types';

export {
  registerTest,
  getTests,
  getBatchTests,
  getTestsByCategory,
  getTest,
  getCategories,
  clearRegistry,
  SINGLE_SCENE_ONLY_TEST_IDS,
} from './registry';

// importing test modules triggers auto-registration
export {
  orbitTest,
  dollyTest,
  panTest,
  seededRandomTest,
  makeCustomTrajectoryTest,
} from './trajectoryTests';
export { staticQualityTest } from './staticQualityTest';
export {
  getSeed,
  setSeed,
  resetSeed,
  DEFAULT_TRAJECTORY_SEED,
} from './trajectorySettings';
