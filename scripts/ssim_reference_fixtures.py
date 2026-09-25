#!/usr/bin/env python3
"""Reference values for the windowed-SSIM fixtures.

calculateWindowedSSIM in src/lib/metrics/imageQuality.ts is checked against
skimage.metrics.structural_similarity. This script regenerates the three
fixture pairs and prints the expected values used in
src/lib/metrics/imageQuality.test.ts.

Run from the repository root:
    uv run --with scikit-image --with numpy python3 scripts/ssim_reference_fixtures.py

The fixtures come from a plain 32-bit LCG rather than numpy's RNG, so the
vitest suite reproduces the same pixels without shipping arrays:
    state = (state * 1664525 + 1013904223) mod 2^32

Three 64x64 RGB pairs:
  identical  a structured pattern against itself
  noisy      the same pattern with per-channel LCG noise in [-24, 24]
  shifted    the same pattern rolled 3 px in x and 2 px in y

Both images are reduced to ITU-R BT.601 luma first, matching toGrayscale() in
imageQuality.ts. use_sample_covariance is reported both ways: False is the
Wang et al. formulation the TypeScript code implements, True is the skimage
default. They differ by under 1e-3 on these fixtures.
"""

from __future__ import annotations

import numpy as np
from skimage.metrics import structural_similarity

SIZE = 64
UINT32_MASK = 0xFFFFFFFF
WINDOW = 11
SIGMA = 1.5


def lcg(seed: int):
    state = seed & UINT32_MASK
    while True:
        state = (state * 1664525 + 1013904223) & UINT32_MASK
        yield state


def base_image() -> np.ndarray:
    image = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    for y in range(SIZE):
        for x in range(SIZE):
            image[y, x, 0] = (x * 4) % 256
            image[y, x, 1] = (y * 3 + x) % 256
            image[y, x, 2] = ((x * y) // 3) % 256
    return image


def noisy_image(base: np.ndarray) -> np.ndarray:
    stream = lcg(20260726)
    out = base.astype(np.int32).copy()
    for y in range(SIZE):
        for x in range(SIZE):
            for channel in range(3):
                out[y, x, channel] += (next(stream) >> 8) % 49 - 24
    return np.clip(out, 0, 255).astype(np.uint8)


def shifted_image(base: np.ndarray) -> np.ndarray:
    out = np.zeros_like(base)
    for y in range(SIZE):
        for x in range(SIZE):
            out[y, x] = base[(y - 2) % SIZE, (x - 3) % SIZE]
    return out


def to_luma(rgb: np.ndarray) -> np.ndarray:
    """ITU-R BT.601 luma, matching toGrayscale() in imageQuality.ts."""
    return (
        0.299 * rgb[..., 0].astype(np.float64)
        + 0.587 * rgb[..., 1].astype(np.float64)
        + 0.114 * rgb[..., 2].astype(np.float64)
    )


def strided_ssim(a: np.ndarray, b: np.ndarray, stride: int) -> float:
    """Mean per-window SSIM over a strided grid, mirroring the TS stride option.

    At stride 1 this reproduces skimage's cropped mean exactly, which is what
    makes the strided values comparable to the reference.
    """
    offsets = np.arange(-(WINDOW // 2), WINDOW // 2 + 1, dtype=np.float64)
    kernel_1d = np.exp(-(offsets**2) / (2 * SIGMA**2))
    kernel_1d /= kernel_1d.sum()
    kernel = np.outer(kernel_1d, kernel_1d)

    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2

    height, width = a.shape
    total = 0.0
    count = 0
    for y in range(0, height - WINDOW + 1, stride):
        for x in range(0, width - WINDOW + 1, stride):
            patch_a = a[y : y + WINDOW, x : x + WINDOW]
            patch_b = b[y : y + WINDOW, x : x + WINDOW]
            mean_a = float((kernel * patch_a).sum())
            mean_b = float((kernel * patch_b).sum())
            var_a = float((kernel * patch_a * patch_a).sum()) - mean_a * mean_a
            var_b = float((kernel * patch_b * patch_b).sum()) - mean_b * mean_b
            cov = float((kernel * patch_a * patch_b).sum()) - mean_a * mean_b
            total += ((2 * mean_a * mean_b + c1) * (2 * cov + c2)) / (
                (mean_a * mean_a + mean_b * mean_b + c1) * (var_a + var_b + c2)
            )
            count += 1
    return total / count


def main() -> None:
    base = base_image()
    fixtures = {
        "identical": (base, base),
        "noisy": (base, noisy_image(base)),
        "shifted": (base, shifted_image(base)),
    }

    common = dict(
        gaussian_weights=True,
        sigma=SIGMA,
        win_size=WINDOW,
        data_range=255,
        channel_axis=None,
    )

    for name, (rgb_a, rgb_b) in fixtures.items():
        luma_a, luma_b = to_luma(rgb_a), to_luma(rgb_b)
        print(f"{name}:")
        print(
            "  skimage use_sample_covariance=False: "
            f"{structural_similarity(luma_a, luma_b, use_sample_covariance=False, **common)!r}"
        )
        print(
            "  skimage use_sample_covariance=True:  "
            f"{structural_similarity(luma_a, luma_b, use_sample_covariance=True, **common)!r}"
        )
        print(f"  stride 1: {strided_ssim(luma_a, luma_b, 1)!r}")
        print(f"  stride 4: {strided_ssim(luma_a, luma_b, 4)!r}")
        # RGB byte sums; the vitest fixtures assert these so a divergence in the
        # generator shows up before the metric comparison does.
        print(
            f"  rgb checksum a={int(rgb_a.astype(np.int64).sum())} "
            f"b={int(rgb_b.astype(np.int64).sum())}"
        )


if __name__ == "__main__":
    main()
