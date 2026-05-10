/**
 * Tests for the Test Registry.
 *
 * Verifies that tests are registered, discovered, and sorted correctly.
 * The UI renders tests as a flat numbered list (no category headers),
 * so the registry's getTests() must return all tests in a single flat array.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTest,
  getTests,
  getTestsByCategory,
  getTest,
  getCategories,
  clearRegistry,
} from './registry';
import type { Test } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockTest(overrides: Partial<Test> & { id: string }): Test {
  return {
    name: overrides.name ?? overrides.id,
    description: overrides.description ?? `Description for ${overrides.id}`,
    category: overrides.category ?? 'general',
    run: overrides.run ?? (async () => ({
      testId: overrides.id,
      metrics: {},
      metricEntries: [],
      summary: 'mock',
      passed: true,
      completedAt: new Date().toISOString(),
      durationMs: 0,
    })),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Test Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('starts empty after clearRegistry', () => {
    expect(getTests()).toHaveLength(0);
    expect(getCategories()).toHaveLength(0);
  });

  it('registers and retrieves a single test', () => {
    const test = makeMockTest({ id: 'test-1', name: 'First Test' });
    registerTest(test);

    const all = getTests();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('test-1');
  });

  it('getTest retrieves by ID', () => {
    const test = makeMockTest({ id: 'orbit-test' });
    registerTest(test);

    expect(getTest('orbit-test')).toBe(test);
    expect(getTest('nonexistent')).toBeUndefined();
  });

  // ─── Flat List Behavior ────────────────────────────────────────────────────

  it('getTests returns a flat array across all categories', () => {
    // register tests from different categories
    registerTest(makeMockTest({ id: 'static-quality', category: 'quality', name: 'Static Quality' }));
    registerTest(makeMockTest({ id: 'orbit', category: 'trajectory', name: 'Orbit Trajectory' }));
    registerTest(makeMockTest({ id: 'dolly', category: 'trajectory', name: 'Dolly Trajectory' }));
    registerTest(makeMockTest({ id: 'pan', category: 'trajectory', name: 'Pan Trajectory' }));

    const all = getTests();

    // all tests in a single flat array, not grouped by category
    expect(all).toHaveLength(4);
    expect(Array.isArray(all)).toBe(true);

    // every element is a test, not a group or section
    for (const t of all) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('run');
    }
  });

  it('getTests sorts by category then name (stable ordering for numbered list)', () => {
    registerTest(makeMockTest({ id: 'pan', category: 'trajectory', name: 'Pan' }));
    registerTest(makeMockTest({ id: 'quality', category: 'quality', name: 'Static Quality' }));
    registerTest(makeMockTest({ id: 'orbit', category: 'trajectory', name: 'Orbit' }));
    registerTest(makeMockTest({ id: 'dolly', category: 'trajectory', name: 'Dolly' }));

    const all = getTests();
    const names = all.map((t) => t.name);

    // quality category comes before trajectory alphabetically
    // then within each category, sorted by name
    expect(names).toEqual(['Static Quality', 'Dolly', 'Orbit', 'Pan']);
  });

  it('each test has a description (shown in tooltip, not as separate text)', () => {
    registerTest(makeMockTest({
      id: 'orbit',
      description: 'Moves camera in an orbital path around the scene center',
    }));

    const test = getTest('orbit');
    expect(test?.description).toBeTruthy();
    expect(typeof test?.description).toBe('string');
    expect(test!.description.length).toBeGreaterThan(0);
  });

  // ─── Category Queries ──────────────────────────────────────────────────────

  it('getCategories returns sorted unique category names', () => {
    registerTest(makeMockTest({ id: 't1', category: 'trajectory' }));
    registerTest(makeMockTest({ id: 't2', category: 'quality' }));
    registerTest(makeMockTest({ id: 't3', category: 'trajectory' }));

    const cats = getCategories();
    expect(cats).toEqual(['quality', 'trajectory']);
  });

  it('getTestsByCategory filters correctly', () => {
    registerTest(makeMockTest({ id: 'sq', category: 'quality' }));
    registerTest(makeMockTest({ id: 'orbit', category: 'trajectory' }));
    registerTest(makeMockTest({ id: 'dolly', category: 'trajectory' }));

    expect(getTestsByCategory('quality')).toHaveLength(1);
    expect(getTestsByCategory('trajectory')).toHaveLength(2);
    expect(getTestsByCategory('stress')).toHaveLength(0);
  });

  // ─── Duplicate Handling ────────────────────────────────────────────────────

  it('overwrites duplicate test IDs with a warning', () => {
    const original = makeMockTest({ id: 'dup', name: 'Original' });
    const replacement = makeMockTest({ id: 'dup', name: 'Replacement' });

    registerTest(original);
    registerTest(replacement);

    const all = getTests();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Replacement');
  });
});
