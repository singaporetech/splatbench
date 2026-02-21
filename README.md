# SplatBench

**3D Gaussian Splatting Benchmark** - A research-grade benchmarking platform for evaluating 3D Gaussian Splatting web deployment formats. Built for academic comparison and quality assessment of compression techniques.

![SplatBench Screenshot](./screenshot.png)

## 🎯 Purpose

SplatBench provides **standardized, reproducible benchmarks** for comparing different 3DGS web formats (.ply, .splat, .ksplat, .spz) with:
- **Side-by-side comparison** - Visual A/B testing with synchronized cameras
- **Quality metrics** - PSNR and SSIM calculations for objective evaluation
- **Performance profiling** - FPS, load time, memory usage, and file size
- **Academic rigor** - Designed for research papers and technical reports

Part of the **SIGGRAPH Asia 2026** submission on web-based 3D Gaussian Splatting deployment.

---

## ✨ Features

### 🎨 Dual Viewer System
- **Splat A & B panels** - Load two different formats for direct comparison
- **Camera synchronization** - Move both viewers together for consistent viewpoints
- **Real-time rendering** - 60+ FPS performance with Three.js + Spark renderer

### 📊 Comprehensive Metrics
- **Quality Metrics**
  - **PSNR** (Peak Signal-to-Noise Ratio) - Objective quality measurement
  - **SSIM** (Structural Similarity Index) - Perceptual quality assessment
  - **Auto-compare** - Automatically computes metrics when both files load
  
- **Performance Metrics**
  - **FPS** (Frames Per Second) - Real-time rendering performance
  - **Frame Time** - Milliseconds per frame
  - **Memory Usage** - JavaScript heap (Chrome only)
  - **Load Time** - Time from file selection to first render
  
- **File Information**
  - **File Size** - Compressed size in MB
  - **Splat Count** - Number of Gaussian splats
  - **Format Detection** - Automatic format identification

### 🎮 Interactive Controls
- **Orbit Controls** - Rotate, pan, and zoom with mouse/trackpad
- **Camera Distance Display** - Color-coded distance indicators for standardized evaluation
- **Drag-and-Drop** - Easy file loading with visual feedback

### 📁 Format Support
- **`.ply`** - Original PLY format (56MB baseline)
- **`.splat`** - Standard splat format (7.1MB, ~87% smaller)
- **`.ksplat`** - K-splat compressed (5.4MB, ~90% smaller)
- **`.spz`** - Niantic SPZ format (3.6MB, ~94% smaller)

---

## 🚀 Quick Start

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

### Build

```bash
npm run build
npm run preview  # Preview production build
```

---

## 🎓 Academic Usage

### Reproducible Benchmarks

SplatBench is designed for **reproducible research**:

1. **Standardized Camera Positions** - Color-coded distance indicators
   - Close: 2.7 units (1.5× radius) - Primary metric
   - Medium: 6.3 units (3.5× radius) - Web viewing distance
   - Far: 10.8 units (6.0× radius) - Perceptual equivalence

2. **Consistent Evaluation**
   - Camera sync ensures identical viewpoints
   - PSNR/SSIM computed frame-by-frame
   - Performance metrics averaged over 60 frames

3. **Export-Ready Metrics**
   - Timestamps for all measurements
   - Side-by-side comparison tables
   - Ready for academic paper inclusion

### Citation

If you use SplatBench in your research, please cite:

```bibtex
@inproceedings{splatbench2026,
  title={SplatBench: Benchmarking 3D Gaussian Splatting Web Deployment},
  author={[Your Name]},
  booktitle={SIGGRAPH Asia 2026},
  year={2026}
}
```

---

## Modular Test Architecture

SplatBench uses a modular test system that makes it easy to add new benchmarks. Every evaluation (trajectory tests, quality comparisons, stress tests) is a **Test** registered in a central registry and automatically discovered by the UI.

### Core Concepts

| Concept | File | Description |
|---------|------|-------------|
| `Test` interface | `src/lib/testing/types.ts` | Contract every benchmark implements: `id`, `name`, `description`, `category`, and a `run()` method |
| `TestResult` | `src/lib/testing/types.ts` | Standardized output: metrics map, structured metric entries, pass/fail, summary, duration |
| `TestScene` | `src/lib/testing/types.ts` | Runtime context passed to tests: primary viewer + optional reference viewer |
| Registry | `src/lib/testing/registry.ts` | `registerTest()` / `getTests()` / `getTestsByCategory()` -- tests self-register on import |
| Test Runner | `src/hooks/useTestRunner.ts` | React hook managing selection, sequential execution, progress, results, cancellation |
| Test Panel | `src/components/Testing/TestPanel.tsx` | UI: checkbox list grouped by category, Run Selected/All, progress, results, batch summary |

### Data Flow

```
Registry (discovers tests) --> useTestRunner (manages execution) --> TestPanel (renders UI)
                                      |
                                      v
                              Test.run(scene, onProgress, signal)
                                      |
                                      v
                              TestResult { metrics, passed, summary }
```

### Built-in Tests

| Test ID | Category | What it measures |
|---------|----------|-----------------|
| `trajectory-orbit` | Trajectory | Temporal consistency during orbital camera sweep |
| `trajectory-dolly` | Trajectory | Temporal consistency during zoom in/out |
| `trajectory-pan` | Trajectory | Temporal consistency during lateral camera pan |

All trajectory tests compute inter-frame SSIM (mean, std dev, min) and optionally per-frame PSNR/SSIM against a reference viewer.

### Adding a New Test

1. **Create the test file** in `src/lib/testing/`:

```typescript
// src/lib/testing/myNewTest.ts
import type { Test, TestScene, OnProgress } from './types';
import { registerTest } from './registry';

const myTest: Test = {
  id: 'my-category-test-name',
  name: 'My Test Name',
  description: 'What this test measures in one sentence.',
  category: 'My Category',
  async run(scene: TestScene, onProgress: OnProgress, signal: AbortSignal) {
    // 1. Use scene.primary (and optionally scene.reference) to access
    //    camera, controls, canvas, renderer, forceRender()
    // 2. Call onProgress({ fraction, message, phase }) to update the UI
    // 3. Check signal.aborted to support cancellation
    // 4. Return a TestResult with metrics, metricEntries, summary, passed

    onProgress({ fraction: 0.5, message: 'Working...', phase: 'Computing' });

    return {
      testId: 'my-category-test-name',
      metrics: { someMetric: 0.95 },
      metricEntries: [
        { label: 'Some Metric', value: 0.95, higherIsBetter: true },
      ],
      summary: 'Test completed with score 0.95',
      passed: true,
      completedAt: new Date().toISOString(),
      durationMs: 1234,
    };
  },
};

registerTest(myTest);
export { myTest };
```

2. **Import your test** in `src/lib/testing/index.ts` so it auto-registers:

```typescript
export { myTest } from './myNewTest';
```

3. **Done.** The test appears in the Tests tab immediately, grouped under "My Category".

### Running Tests in the UI

1. Load at least one splat file (Splat A). Load Splat B for reference comparison.
2. Press **T** or click the **Tests** tab in the right panel.
3. Check/uncheck individual tests. Use **All** / **None** buttons for bulk selection.
4. Click **Run Selected** to run checked tests, or **Run All** to run everything.
5. Watch per-test progress bars and status indicators (idle / running / done / failed).
6. After completion, see individual result cards with metrics and a batch summary.

---

## 🛠 Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7.3
- **3D Rendering**: Three.js 0.182 + **[@sparkjsdev/spark](https://github.com/worldlabs-xyz/spark)** 🆕
- **Styling**: Tailwind CSS v4
- **Quality Metrics**: Custom PSNR/SSIM implementation
- **Deployment**: GitHub Pages (optional)

### ⚡️ Major Update: Spark Renderer

**SplatBench now uses Spark by World Labs** - Migrated from the abandoned `@mkkellogg/gaussian-splats-3d` to the actively maintained `@sparkjsdev/spark` renderer.

**Why Spark?**
- ✅ **Active development** - Backed by World Labs team
- ✅ **Better performance** - Optimized for mobile and low-power devices
- ✅ **Native format support** - Built-in .spz, .sog support
- ✅ **Three.js compatible** - Works like standard Three.js objects
- ✅ **Future-proof** - Ongoing updates and maintenance

**Migration Details:**
- Standard Three.js scene structure (Scene, Camera, Renderer, OrbitControls)
- Uses `fileBytes` (ArrayBuffer) for reliable file loading
- Explicit format detection for all file types
- Maintains full backward compatibility with existing metrics

---

## 📈 Performance

Typical performance on modern hardware (M1/M2 Mac, RTX 3060+):

| Format | File Size | Load Time | FPS | Memory |
|--------|-----------|-----------|-----|--------|
| .ply | 56.0 MB | 1000ms | 60+ | ~500MB |
| .splat | 7.1 MB | 300ms | 60+ | ~250MB |
| .ksplat | 5.4 MB | 250ms | 60+ | ~200MB |
| .spz | 3.6 MB | 200ms | 60+ | ~150MB |

*Results for bonsai scene (233,992 splats) on Chrome/M2 Mac*

---

## 🧪 Testing

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode (re-run on file changes)
npm run test:coverage # Run tests with coverage report
```

Tests use [Vitest](https://vitest.dev/) and run entirely in Node (no browser required).

### Test Categories

| Category | File | What it covers |
|----------|------|----------------|
| **Image Quality** | `src/lib/metrics/imageQuality.test.ts` | PSNR accuracy, SSIM correctness, edge cases (identical, black/white, gradient images), metric symmetry, monotonic degradation |
| **Trajectory Metrics** | `src/lib/metrics/trajectoryMetrics.test.ts` | Inter-frame SSIM computation, per-frame metric aggregation, `buildTrajectoryMetricsResult` pipeline, data integrity (frames captured = frames processed), determinism |
| **Camera Trajectories** | `src/lib/camera/trajectories.test.ts` | Orbit/dolly/pan keyframe generation, geometric correctness (constant distance, 360-degree return), t-value monotonicity, dispatcher routing, MetricsCollector FPS/frame-time/percentile accuracy |

### Adding New Tests

1. Create a `.test.ts` file next to the module you want to test (co-located pattern).
2. Import from `vitest`: `import { describe, it, expect } from 'vitest'`.
3. Use the helper functions in existing test files (e.g., `createImageData`, `generateFrameSequence`) for constructing synthetic test data.
4. Run `npm test` to verify.

**Guidelines:**
- Tests must be deterministic (no random data without fixed seeds).
- Prefer exact numeric assertions (`toBeCloseTo`, `toBe`) over loose checks.
- For metric tests, validate against known mathematical results, not empirical "looks right" values.

### Manual Testing Checklist

1. **File Loading**
   - [ ] Load .ply file into Splat A
   - [ ] Load .splat file into Splat B
   - [ ] Verify splat counts match (233,992)
   - [ ] Test .ksplat and .spz formats

2. **Rendering**
   - [ ] Confirm 60+ FPS on both viewers
   - [ ] Verify bonsai tree renders correctly
   - [ ] Check camera controls (rotate, pan, zoom)

3. **Quality Metrics**
   - [ ] Auto-compare triggers after both load
   - [ ] PSNR shows expected value (~60 dB for same scene)
   - [ ] SSIM shows expected value (~1.0 for same scene)

4. **Performance**
   - [ ] No console errors
   - [ ] Memory usage displayed
   - [ ] Camera distance updates smoothly

### Test Files

Sample files available in `public/` directory:
- `bonsai.ply` (56MB) - Original PLY format
- `bonsai.splat` (7.1MB) - Standard splat
- `bonsai.ksplat` (5.4MB) - K-splat compressed
- `bonsai.spz` (3.6MB) - Niantic SPZ

---

## 🌐 Deployment

### GitHub Pages (Manual)

```bash
npm run deploy
```

This will build and deploy to the `gh-pages` branch.

### GitHub Pages (Automatic)

The repository includes a GitHub Actions workflow that automatically deploys on every push to `main`.

To enable:
1. Go to repository Settings → Pages
2. Set Source to "GitHub Actions"
3. Push to `main` branch

The site will be available at `https://yourusername.github.io/splatbench/`

---

## 🤝 Contributing

This is part of an academic research project. Contributions are welcome, especially:

- Additional 3DGS format support
- More quality metrics (MS-SSIM, VMAF, etc.)
- Performance optimizations
- Browser compatibility improvements
- Test scene contributions

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) for details.

---

## 🔗 Related Work

- [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) - Original paper
- [Spark by World Labs](https://github.com/worldlabs-xyz/spark) - Renderer used by SplatBench
- [antimatter15/splat](https://github.com/antimatter15/splat) - Original .splat format
- [PlayCanvas .ply compression](https://github.com/playcanvas/engine) - Compression techniques
- [Niantic SPZ format](https://github.com/nianticlabs/spz) - Compressed format

---

## 📞 Support

For questions, issues, or academic collaboration:
- Open an issue on GitHub
- See the main [research paper](../main.pdf) for methodology details

---

**Built for researchers, by researchers. 🎓**
