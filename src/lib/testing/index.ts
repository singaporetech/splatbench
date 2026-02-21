/**
 * Testing module barrel export.
 *
 * Import this to get the full test system: types, registry, and
 * all built-in tests auto-registered.
 */

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

// Importing trajectoryTests triggers auto-registration
export { orbitTest, dollyTest, panTest } from './trajectoryTests';
