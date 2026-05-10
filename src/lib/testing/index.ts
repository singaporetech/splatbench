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
  getTestsByCategory,
  getTest,
  getCategories,
  clearRegistry,
} from './registry';

// importing test modules triggers auto-registration
export { orbitTest, dollyTest, panTest } from './trajectoryTests';
export { staticQualityTest } from './staticQualityTest';
