/**
 * UI Structure Tests for TestPanel
 *
 * These tests verify that the recent UI polish changes are correctly
 * implemented in the TestPanel component source code. Since the test
 * environment doesn't include a DOM renderer (jsdom/happy-dom), we
 * verify the source structure directly.
 *
 * Verified changes:
 * 1. Flat numbered test list (no "Quality Tests" / "Trajectory Tests" headers)
 * 2. Descriptions moved to InfoTooltip (not rendered as visible text)
 * 3. Sticky progress bar at top of panel
 * 4. Viewport-aware tooltip positioning
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helpers ────────────────────────────────────────────────────────────────

function readComponent(relativePath: string): string {
  const fullPath = resolve(__dirname, '../../components/Testing', relativePath);
  return readFileSync(fullPath, 'utf-8');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TestPanel UI Structure', () => {
  const testPanelSource = readComponent('TestPanel.tsx');

  // ─── 1. Flat Numbered Test List ───────────────────────────────────────

  describe('flat numbered test list', () => {
    it('does NOT render category section headers', () => {
      // The old UI had "Quality Tests" and "Trajectory Tests" as section headers.
      // The new flat list should not contain these strings.
      expect(testPanelSource).not.toContain('Quality Tests');
      expect(testPanelSource).not.toContain('Trajectory Tests');
    });

    it('does NOT group tests by category in the render', () => {
      // Should not use getTestsByCategory or getCategories in the component
      expect(testPanelSource).not.toContain('getTestsByCategory');
      expect(testPanelSource).not.toContain('getCategories');
    });

    it('renders tests with sequential index numbers', () => {
      // The flat list uses {index + 1} for numbering each test
      expect(testPanelSource).toContain('index + 1');
    });

    it('iterates tests with a single map (flat iteration)', () => {
      // The test list should use runner.tests.map() directly, not nested maps per category
      expect(testPanelSource).toContain('runner.tests.map');
    });
  });

  // ─── 2. Descriptions in Tooltips (Not Visible Text) ──────────────────

  describe('descriptions in tooltips', () => {
    it('renders descriptions via InfoTooltip component', () => {
      // Each test's description should be passed to InfoTooltip
      expect(testPanelSource).toContain('InfoTooltip');
      expect(testPanelSource).toContain('test.description');
    });

    it('does NOT render description as a separate paragraph below the test name', () => {
      // Old pattern: <p>{test.description}</p> or <div>{test.description}</div> as visible text
      // The description should only appear inside InfoTooltip text prop
      // Check there's no standalone rendering of test.description outside InfoTooltip
      const lines = testPanelSource.split('\n');
      const descriptionUsages = lines.filter(
        (line) => line.includes('test.description') && !line.includes('InfoTooltip'),
      );
      expect(descriptionUsages).toHaveLength(0);
    });
  });

  // ─── 3. Sticky Progress Bar ───────────────────────────────────────────

  describe('sticky progress bar', () => {
    it('has a sticky-positioned progress container', () => {
      expect(testPanelSource).toContain("position: 'sticky'");
    });

    it('sticky element is positioned at the top', () => {
      expect(testPanelSource).toContain("top: 0");
    });

    it('has a z-index to stay above other content', () => {
      // The sticky progress bar should have a z-index
      expect(testPanelSource).toContain('zIndex');
    });

    it('progress bar appears before the test list', () => {
      // The sticky progress container should come before the test list rendering
      const stickyIndex = testPanelSource.indexOf("position: 'sticky'");
      const testListIndex = testPanelSource.indexOf('runner.tests.map');
      expect(stickyIndex).toBeLessThan(testListIndex);
    });
  });

  // ─── 4. Viewport-Aware Tooltip Positioning ────────────────────────────

  describe('viewport-aware tooltip positioning', () => {
    it('InfoTooltip uses a ref for position detection', () => {
      expect(testPanelSource).toContain('triggerRef');
      expect(testPanelSource).toContain('useRef');
    });

    it('computes viewport position using getBoundingClientRect', () => {
      expect(testPanelSource).toContain('getBoundingClientRect');
    });

    it('compares element position against viewport width', () => {
      expect(testPanelSource).toContain('window.innerWidth');
    });

    it('supports flipping tooltip to the left when near right edge', () => {
      expect(testPanelSource).toContain('flipLeft');
    });

    it('positions tooltip conditionally left or right', () => {
      // When flipped left: right: '24px', otherwise left: '20px'
      expect(testPanelSource).toContain("right: '24px'");
      expect(testPanelSource).toContain("left: '20px'");
    });

    it('recalculates position on mouse enter', () => {
      expect(testPanelSource).toContain('onMouseEnter');
      expect(testPanelSource).toContain('handleShow');
      expect(testPanelSource).toContain('updatePosition');
    });
  });
});

// ─── BatchTestPanel structure checks ────────────────────────────────────────

describe('BatchTestPanel UI Structure', () => {
  const batchPanelSource = readComponent('BatchTestPanel.tsx');

  it('has a sticky progress bar for batch progress', () => {
    expect(batchPanelSource).toContain("position: 'sticky'");
    expect(batchPanelSource).toContain("top: 0");
  });

  it('also uses viewport-aware InfoTooltip', () => {
    expect(batchPanelSource).toContain('InfoTooltip');
    expect(batchPanelSource).toContain('flipLeft');
    expect(batchPanelSource).toContain('getBoundingClientRect');
    expect(batchPanelSource).toContain('window.innerWidth');
  });
});
