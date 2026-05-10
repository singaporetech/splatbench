# SplatBench

> **Paper Submission Supplement.** This archive accompanies the paper
> submission and contains the full SplatBench source. No splat assets are
> included; see [Benchmark Models](#benchmark-models) for download links to
> the standard datasets used in the paper. Quick start: `npm install &&
> npm test && npm run dev` (see [Quick Start](#quick-start) and [Testing](#testing)).

SplatBench evaluates 3D Gaussian Splatting (3DGS) web deployment formats — `.ply`, `.splat`, `.ksplat`, `.spz` — under reproducible browser conditions. It pairs side-by-side reference and test viewers with synchronized cameras, image-quality metrics (PSNR, SSIM), and runtime measurements (load time, frame rate, frame-time variance) so the same protocol can be used for interactive inspection and unattended batch runs.

Part of the **SIGGRAPH Asia 2026** submission on web-based 3DGS deployment.

---

## Features

### Dual viewers
- **Reference and test panels** — left/right viewers that share a single synchronized camera so both renders sit at exactly the same pose.
- **A/B comparison slider** — a draggable divider overlays the reference and test renders in one frame, so format artefacts (lost foliage texture, softened text, motion-conditioned shimmer) can be inspected side-by-side at the same camera pose.
- Three.js + Spark renderer.

### Metrics
- **Image quality:** PSNR and SSIM, computed on demand when both viewers have a model loaded.
- **Runtime:** frame rate, frame time, load time (selection-to-first-render), and JS-heap memory (Chrome only).
- **File:** byte size, splat count, and detected format.

### Interaction
- Orbit / pan / zoom controls (mouse or trackpad).
- Camera-distance readout with the close / medium / far protocol presets used for evaluation.
- Drag-and-drop file loading.

### Supported formats
- `.ply` — uncompressed baseline
- `.splat` — standard splat
- `.ksplat` — K-splat compressed
- `.spz` — Niantic SPZ compressed

Measured file sizes, quality, and runtime cost are scene- and
configuration-dependent; see the accompanying paper for the values reported
in this study.

---

## Usage Modes

SplatBench supports two complementary usage modes that map onto common
research workflows. Both modes record the same reproducibility context —
screenshots, browser version, GPU, timestamps, and camera settings — so
results from interactive exploration and batch runs are directly
comparable.

### Interactive Mode (Web UI)

Drag-and-drop a reference model and a test model, share a single
synchronized camera between the two viewers, and use the A/B comparison
slider to inspect a viewpoint under a draggable divider. PSNR/SSIM are
computed on demand and screenshots can be captured at any pose. This is
the mode used to localize where a format degrades a specific scene —
i.e., when aggregate metrics agree numerically but disagree
perceptually, or when one scene is driving a headline result.

### Batch Mode (Automated)

Point the Batch Test Panel at a folder of paired files
(`ref_<name>.<ext>` / `test_<name>.<ext>`). When pair names follow the
`<scene>-<format>` paper pattern, the runner expands each pair into the
full paper matrix — five standardized viewpoints × three replicates ×
all registered tests (orbit / dolly / pan trajectories plus static
quality) — and runs them unattended; results stream into a paper-CSV
export. The protocol that produced the paper's tables can therefore be
re-run, audited, or extended to new scenes and formats without modifying
the evaluation contract.

---

## Benchmark Models

SplatBench evaluates 3DGS web deployment formats using established benchmark scenes from the research community. The following datasets are used in the original [3D Gaussian Splatting paper](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) (Kerbl et al., SIGGRAPH 2023; [doi:10.1145/3592433](https://doi.org/10.1145/3592433)) and are standard benchmarks across the field.

### Pre-trained 3DGS Models (Recommended)

The fastest way to get started is to download the **official pre-trained models** from the 3DGS authors. These contain trained `.ply` files ready to load into SplatBench.

| Source | Link | Size | Contents |
|--------|------|------|----------|
| **Pre-trained Models** | [models.zip (14 GB)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/pretrained/models.zip) | 14 GB | All 13 scenes as `.ply` files (point_cloud/iteration_30000/point_cloud.ply) |

Each scene folder contains `point_cloud/iteration_7000/` and `point_cloud/iteration_30000/` subdirectories. Use the `iteration_30000` PLY files for best quality.

> **Note:** Splat assets (including `bonsai.ply`) are not bundled with this
> archive due to file size. See the accompanying paper for the file sizes,
> splat counts, and per-format figures measured in this study.

### Source Datasets (Training Data)

If you want to train your own 3DGS models or need the source images for evaluation:

#### 1. Mip-NeRF 360 (Barron et al., CVPR 2022; [doi:10.1109/CVPR52688.2022.00539](https://doi.org/10.1109/CVPR52688.2022.00539))

The primary benchmark dataset for 3DGS evaluation. Contains 9 scenes (5 outdoor, 4 indoor) with 360-degree captures: `bicycle`, `garden`, `stump`, `flowers`, `treehill` (outdoor) and `bonsai`, `counter`, `kitchen`, `room` (indoor).

- **Download:** [jonbarron.info/mipnerf360](https://jonbarron.info/mipnerf360/) or directly via `wget http://storage.googleapis.com/gresearch/refraw360/360_v2.zip`
- **Format:** Source images + COLMAP sparse reconstruction
- **Note:** The `treehill` and `flowers` scenes require requesting access from the authors

#### 2. Tanks and Temples (Knapitsch et al., SIGGRAPH 2017; [doi:10.1145/3072959.3073599](https://doi.org/10.1145/3072959.3073599))

Large-scale indoor/outdoor scenes commonly used for 3DGS benchmarking. The 3DGS authors provide pre-processed COLMAP reconstructions for the `truck` and `train` scenes.

- **Download (COLMAP data):** [tandt_db.zip (650 MB)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/input/tandt_db.zip) from the 3DGS authors (includes both T&T and Deep Blending scenes)
- **Original dataset:** [tanksandtemples.org/download](https://tanksandtemples.org/download/)
- **Format:** Source images + COLMAP sparse reconstruction

#### 3. Deep Blending (Hedman et al., SIGGRAPH Asia 2018; [doi:10.1145/3272127.3275084](https://doi.org/10.1145/3272127.3275084))

Indoor scenes with complex lighting and reflections. The 3DGS authors' archive provides COLMAP reconstructions for the `drjohnson` and `playroom` scenes.

- **Download (COLMAP data):** Included in [tandt_db.zip (650 MB)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/input/tandt_db.zip) above
- **Original dataset:** [Deep Blending datasets page](https://www-sop.inria.fr/reves/publis/2018/HPPFDB18/datasets.html)
- **Format:** Source images + COLMAP reconstruction

### Getting .splat, .ksplat, and .spz Files

The pre-trained models provide `.ply` files. To benchmark other formats in SplatBench, you need to convert them:

#### Online Conversion

- **[SuperSplat Editor](https://superspl.at/editor)** (PlayCanvas): Load a `.ply` file, edit/crop, and export as compressed PLY or other formats. Browser-based, no install required.
- **[antimatter15/splat viewer](https://antimatter15.com/splat/)**: Drag and drop a `.ply` file to automatically convert to `.splat` format.

#### CLI Conversion

- **[splat-transform](https://github.com/playcanvas/splat-transform)** (PlayCanvas CLI tool): Converts between PLY, SPLAT, KSPLAT, SOG, SPZ, and CSV formats.
  ```bash
  npm install -g @playcanvas/splat-transform
  splat-transform input.ply output.splat
  splat-transform input.ply output.ksplat
  ```

- **[Niantic SPZ tools](https://github.com/nianticlabs/spz)**: Official encoder/decoder for the SPZ compressed format.
  ```bash
  # Build from source, then:
  ./spz_encode input.ply output.spz
  ```

#### Format Trade-offs After Conversion

`.ply` is the uncompressed baseline; `.splat`, `.ksplat`, and `.spz` are
compressed alternatives that trade off file size, fidelity, and runtime
cost in different ways. The trade-offs depend on the scene, the trained
Gaussian count, and the converter settings, so we do not quote canonical
numbers here — see the accompanying paper for the values measured in this
study, and re-measure on your own content for any deployment decision.

### Pre-converted .splat Files

Some sources provide pre-converted `.splat` files that you can load directly:

- **[antimatter15/splat demos](https://antimatter15.com/splat/)**: Hosts several pre-converted `.splat` files (e.g., plush, truck scenes) that can be referenced via URL
- **[Polycam gallery](https://poly.cam/explore)**: Community-uploaded Gaussian splat captures in various formats

---

## Quick Start

### Development

```bash
npm install
npm test       # run the unit-test suite once
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

### Build

```bash
npm run build
npm run preview  # Preview production build
```

---

## Evaluation Protocol

The protocol used by both interactive and batch runs is fixed so that
results are directly comparable across sessions, machines, and reviewers.

1. **Camera distances** (radius-relative, with a colour-coded readout in
   the UI):
   - Close — 1.5× radius (≈ 2.7 units in the bonsai scene); primary
     fidelity metric.
   - Medium — 3.5× radius (≈ 6.3 units); typical web viewing distance.
   - Far — 6.0× radius (≈ 10.8 units); perceptual-equivalence regime.

2. **Measurement:** camera-synchronised viewers; PSNR and SSIM computed
   per frame against the reference; frame-rate and frame-time statistics
   accumulated over rolling windows.

3. **Export:** every measurement is timestamped and tagged with the
   browser, GPU, scene, format, viewpoint, and replicate index, and is
   written to a paper-CSV that maps directly onto the tables and figures
   in the accompanying paper.

---

## Modular Test Architecture

SplatBench uses a modular test system that makes it easy to add new benchmarks. Every evaluation (trajectory tests, quality comparisons, stress tests) is a **Test** registered in a central registry and automatically discovered by the UI. The same registry is also what [Batch Mode](#batch-mode-automated) iterates over, so any new test added here is picked up by both interactive and unattended runs without protocol changes.

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
| `static-quality` | Quality | PSNR/SSIM at current camera position (requires reference viewer) |

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

3. The test appears in the Tests tab on next reload, grouped under its declared category.

### Running Tests in the UI

1. Load a reference model (left pane). Load a test model (right pane) for comparison.
2. Press **T** or click the **Tests** tab in the right panel.
3. Check/uncheck individual tests. Use **All** / **None** buttons for bulk selection.
4. Click **Run Selected** to run checked tests, or **Run All** to run everything.
5. Watch per-test progress bars and status indicators (idle / running / done / failed).
6. After completion, see individual result cards with metrics and a batch summary.

---

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7.3
- **3D Rendering**: Three.js 0.182 + **[@sparkjsdev/spark](https://github.com/sparkjsdev/spark)**
- **Styling**: Tailwind CSS v4
- **Quality Metrics**: Custom PSNR/SSIM implementation
- **Deployment**: GitHub Pages (optional)

---

## Testing

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
   - [ ] Load .ply file into reference model (left pane)
   - [ ] Load .splat file into test model (right pane)
   - [ ] Verify splat counts match between the two formats for the same scene
   - [ ] Test .ksplat and .spz formats

2. **Rendering**
   - [ ] Confirm both viewers render without stutter or visible artefacts
   - [ ] Verify the scene renders correctly (e.g., bonsai tree shape)
   - [ ] Check camera controls (rotate, pan, zoom)

3. **Quality Metrics**
   - [ ] Auto-compare triggers after both load
   - [ ] Sanity check: comparing a model against itself yields very high PSNR and SSIM near 1.0 (self-comparison only — not a benchmark result)

4. **Performance**
   - [ ] No console errors
   - [ ] Memory usage displayed
   - [ ] Camera distance updates smoothly

### Test Files

This package does **not** ship with splat assets. To run the manual checklist
above, place the four bonsai variants under `public/` (or load them via the
in-app drag-and-drop). See [Benchmark Models](#benchmark-models) for download
and conversion instructions:
- `bonsai.ply` — Original PLY format (download from the 3DGS authors)
- `bonsai.splat` — Standard splat (convert with `splat-transform`)
- `bonsai.ksplat` — K-splat compressed (convert with `splat-transform`)
- `bonsai.spz` — Niantic SPZ (convert with the SPZ encoder)

---

## Deployment

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

The site will be available at `https://<your-org>.github.io/splatbench/`

---

## Contributing

This is part of an academic research project. Contributions are welcome, especially:

- Additional 3DGS format support
- More quality metrics (MS-SSIM, VMAF, etc.)
- Performance optimizations
- Browser compatibility improvements
- Test scene contributions

---

## License

MIT License - See [LICENSE](./LICENSE) for details.

---

## Related Work

- [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) - Kerbl et al., SIGGRAPH 2023 ([doi:10.1145/3592433](https://doi.org/10.1145/3592433))
- [Spark](https://github.com/sparkjsdev/spark) - Three.js-based 3DGS renderer used by SplatBench
- [antimatter15/splat](https://github.com/antimatter15/splat) - Original `.splat` format reference implementation
- [PlayCanvas engine](https://github.com/playcanvas/engine) - Open-source engine with `.ply`/splat compression tooling
- [Niantic SPZ](https://github.com/nianticlabs/spz) - `.spz` compressed format

### Cited Datasets

- Kerbl, B., Kopanas, G., Leimkühler, T., & Drettakis, G. (2023). 3D Gaussian
  Splatting for Real-Time Radiance Field Rendering. *ACM Transactions on
  Graphics*, 42(4), 1–14. [doi:10.1145/3592433](https://doi.org/10.1145/3592433).
- Barron, J. T., Mildenhall, B., Verbin, D., Srinivasan, P. P., & Hedman, P.
  (2022). Mip-NeRF 360: Unbounded Anti-Aliased Neural Radiance Fields. In
  *IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)*,
  5460–5469. [doi:10.1109/CVPR52688.2022.00539](https://doi.org/10.1109/CVPR52688.2022.00539).
- Knapitsch, A., Park, J., Zhou, Q.-Y., & Koltun, V. (2017). Tanks and
  Temples: Benchmarking Large-Scale Scene Reconstruction. *ACM Transactions
  on Graphics*, 36(4), 1–13. [doi:10.1145/3072959.3073599](https://doi.org/10.1145/3072959.3073599).
- Hedman, P., Philip, J., Price, T., Frahm, J.-M., Drettakis, G., & Brostow,
  G. (2018). Deep Blending for Free-Viewpoint Image-Based Rendering. *ACM
  Transactions on Graphics*, 37(6), 1–15.
  [doi:10.1145/3272127.3275084](https://doi.org/10.1145/3272127.3275084).

---

## Support

This package accompanies the paper submission. For methodology details, see
the accompanying paper PDF. For questions or academic collaboration after
review, contact information will be provided in the camera-ready version.

