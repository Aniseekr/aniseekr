import { describe, expect, it } from 'bun:test';
import {
  DARK_BRIGHTNESS_FLOOR,
  FRAME_MATCH_VERSION,
  FRAME_MATCH_WEIGHTS,
  gridCorrelation,
  INVALID_MAX_TOTAL,
  LOW_CONTRAST_FLOOR,
  LOW_DETAIL_EDGE_FLOOR,
  scoreFrameMatch,
} from '../../../libs/services/pilgrimage/frame-match-score';
import {
  centerCropRect,
  reducePixels,
  type SceneAnalysis,
} from '../../../libs/services/pilgrimage/scene-analysis';

// Baseline neutral scene — mirrors __tests__/unit/pilgrimage/scene-analysis.test.ts
// so the math operates on shapes we know reducePixels emits in production.
function baseAnalysis(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    avgR: 150,
    avgG: 150,
    avgB: 150,
    brightness: 0.55,
    warmth: 0,
    saturation: 0.25,
    minLum: 20,
    maxLum: 230,
    contrast: 0.82,
    colorVariance: 0.32,
    topSkyR: 160,
    topSkyG: 170,
    topSkyB: 200,
    bottomGroundR: 130,
    bottomGroundG: 130,
    bottomGroundB: 120,
    horizonY: 0.5,
    leftLum: 0.55,
    rightLum: 0.55,
    centerLum: 0.55,
    cornerLum: 0.5,
    edgeCells: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
    edgeMagnitude: 0.4,
    verticalEdgeRatio: 0.5,
    highlightRatio: 0.02,
    shadowRatio: 0.02,
    luminanceHistogram: Array.from({ length: 16 }, () => 1 / 16),
    palette: ['#AABBCC', '#998877', '#665544', '#332211', '#FFEEDD'],
    layoutGrid: Array.from({ length: 256 }, (_, i) => ((i * 37) % 100) / 100),
    edgeGrid: Array.from({ length: 256 }, (_, i) => ((i * 53) % 100) / 100),
    ...overrides,
  };
}

// A black image: brightness 0, no edges, no contrast, histogram fully in bin 0.
function blackAnalysis(): SceneAnalysis {
  const hist = new Array(16).fill(0);
  hist[0] = 1;
  return baseAnalysis({
    avgR: 0,
    avgG: 0,
    avgB: 0,
    brightness: 0,
    contrast: 0,
    edgeMagnitude: 0,
    minLum: 0,
    maxLum: 0,
    colorVariance: 0,
    saturation: 0,
    centerLum: 0,
    cornerLum: 0,
    leftLum: 0,
    rightLum: 0,
    edgeCells: new Array(9).fill(0),
    highlightRatio: 0,
    shadowRatio: 1,
    luminanceHistogram: hist,
    palette: ['#000000'],
  });
}

// A flat-grey image (lens cap removed but staring at a uniform wall):
// medium brightness, but no edges and no contrast.
function flatGreyAnalysis(): SceneAnalysis {
  const hist = new Array(16).fill(0);
  hist[7] = 1;
  return baseAnalysis({
    brightness: 0.5,
    contrast: 0.02,
    edgeMagnitude: 0.005,
    minLum: 126,
    maxLum: 131,
    colorVariance: 0,
    saturation: 0,
    luminanceHistogram: hist,
  });
}

describe('scoreFrameMatch', () => {
  it('returns total ≈ 1 for identical analyses', () => {
    const ref = baseAnalysis();
    const user = baseAnalysis();
    const r = scoreFrameMatch(ref, user);
    expect(r.layout).toBeCloseTo(1, 5);
    expect(r.edge).toBeCloseTo(1, 5);
    expect(r.lighting).toBeCloseTo(1, 5);
    expect(r.total).toBeCloseTo(1, 5);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('caps total at INVALID_MAX_TOTAL when the user shot is a black image (dark)', () => {
    const ref = baseAnalysis();
    const user = blackAnalysis();
    const r = scoreFrameMatch(ref, user);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('dark');
    expect(r.total).not.toBeNull();
    expect(r.total ?? 1).toBeLessThanOrEqual(INVALID_MAX_TOTAL + 1e-9);
  });

  it('caps total when the user shot is detail-free (lowDetail)', () => {
    const ref = baseAnalysis();
    // Has brightness above the dark floor but ~zero edges → lowDetail.
    const user = baseAnalysis({
      brightness: 0.4,
      contrast: 0.3,
      edgeMagnitude: 0.0,
    });
    const r = scoreFrameMatch(ref, user);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('lowDetail');
    expect(r.total ?? 1).toBeLessThanOrEqual(INVALID_MAX_TOTAL + 1e-9);
  });

  it('caps total when the user shot is uniformly flat (lowContrast)', () => {
    const ref = baseAnalysis();
    const user = flatGreyAnalysis();
    // flatGreyAnalysis trips lowDetail before lowContrast (edge < 0.03).
    // Adjust so only the contrast floor is below threshold:
    const userOnlyLowContrast: SceneAnalysis = {
      ...user,
      edgeMagnitude: 0.2,
      contrast: 0.03,
    };
    const r = scoreFrameMatch(ref, userOnlyLowContrast);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('lowContrast');
    expect(r.total ?? 1).toBeLessThanOrEqual(INVALID_MAX_TOTAL + 1e-9);
  });

  it('keeps the image valid when every signal is above its floor', () => {
    const ref = baseAnalysis();
    const user = baseAnalysis({
      brightness: DARK_BRIGHTNESS_FLOOR + 0.01,
      edgeMagnitude: LOW_DETAIL_EDGE_FLOOR + 0.01,
      contrast: LOW_CONTRAST_FLOOR + 0.01,
    });
    const r = scoreFrameMatch(ref, user);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('uses the documented weight mix: structure scaled by lighting', () => {
    const ref = baseAnalysis();
    const user = baseAnalysis({ brightness: 0.35, contrast: 0.6 });
    const r = scoreFrameMatch(ref, user);
    const structure =
      (r.layout ?? 0) * FRAME_MATCH_WEIGHTS.layout + (r.edge ?? 0) * FRAME_MATCH_WEIGHTS.edge;
    const recomputed =
      structure *
      (1 - FRAME_MATCH_WEIGHTS.lighting + FRAME_MATCH_WEIGHTS.lighting * (r.lighting ?? 0));
    expect(r.total).toBeCloseTo(recomputed, 5);
  });

  it('an inverted layout scores zero structure, however similar the exposure', () => {
    const grid = Array.from({ length: 256 }, (_, i) => (i < 128 ? 0.9 : 0.1));
    const ref = baseAnalysis({ layoutGrid: grid, edgeGrid: grid });
    const user = baseAnalysis({
      layoutGrid: [...grid].reverse(),
      edgeGrid: [...grid].reverse(),
    });
    const r = scoreFrameMatch(ref, user);
    expect(r.layout).toBe(0);
    expect(r.edge).toBe(0);
    expect(r.total).toBe(0);
  });

  it('a flat grid has no structure to match', () => {
    expect(gridCorrelation([0.5, 0.5, 0.5], [0.1, 0.9, 0.4])).toBeNull();
    expect(gridCorrelation([0.1, 0.2, 0.3], [0.2, 0.4, 0.6])).toBeCloseTo(1, 9);
  });
});

// Synthetic 64×64 greyscale scenes run through the real reducePixels, so the
// score is exercised on the same features production computes.
function scene(draw: (x: number, y: number) => number): SceneAnalysis {
  const W = 64;
  const H = 64;
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(0, Math.min(255, Math.round(draw(x, y))));
      const i = (y * W + x) * 4;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return reducePixels(px, W, H);
}

// A station-like frame: bright sky, a dark building with lit windows on the
// left, a pole on the right, textured ground.
function station(x: number, y: number): number {
  if (x >= 44 && x <= 46 && y >= 4) return 40; // pole
  if (x >= 6 && x <= 30 && y >= 18 && y < 50) {
    const window = (x - 8) % 6 < 3 && (y - 22) % 8 < 4 && x >= 8 && y >= 22;
    return window ? 225 : 55;
  }
  if (y < 22) return 190 + y; // sky gradient
  return 110 + ((x * 7 + y * 3) % 11); // ground texture
}

// The same place drawn differently: shifted 2px, posterised to 4 tones,
// re-exposed, with mild deterministic noise — roughly anime still vs. photo.
function stationRedrawn(x: number, y: number): number {
  const v = station(Math.max(0, x - 2), y);
  const posterised = Math.round(v / 64) * 64;
  const noise = ((x * 31 + y * 17) % 13) - 6;
  return posterised * 0.85 + 25 + noise;
}

// An unrelated frame: dark rock walls either side, a bright vertical stream.
function waterfall(x: number, y: number): number {
  const center = 32 + Math.sin(y / 6) * 4;
  if (Math.abs(x - center) < 8) return 215 + ((y * 5) % 30);
  return 60 + ((x * 3 + y * 11) % 25) + (y > 48 ? 40 : 0);
}

describe('frame match discriminates scenes (v2 layout scoring)', () => {
  const reference = scene(station);

  it('the same place drawn differently scores high', () => {
    const r = scoreFrameMatch(reference, scene(stationRedrawn));
    expect(r.valid).toBe(true);
    expect(r.total ?? 0).toBeGreaterThan(0.7);
  });

  it('an unrelated scene scores low even with similar exposure', () => {
    const r = scoreFrameMatch(reference, scene(waterfall));
    expect(r.valid).toBe(true);
    expect(r.total ?? 1).toBeLessThan(0.3);
  });

  it('the same pixels in a different arrangement do not match (identical histogram)', () => {
    // Swap the left and right halves: every luminance value survives, so the
    // v1 histogram score would be 100%; the layout is different.
    const swapped = scene((x, y) => station((x + 32) % 64, y));
    const r = scoreFrameMatch(reference, swapped);
    expect(reference.luminanceHistogram).toEqual(swapped.luminanceHistogram);
    expect(r.total ?? 1).toBeLessThan(0.5);
  });

  it('is scored as version 2', () => {
    expect(FRAME_MATCH_VERSION).toBe(2);
  });
});

// Nearest-neighbour stand-in for Skia's drawImageRect: sample `src` of a
// `w`×`h` greyscale draw function into the 64×64 grid.
function sampled(
  draw: (x: number, y: number) => number,
  src: { x: number; y: number; width: number; height: number }
): SceneAnalysis {
  return scene((x, y) =>
    draw(src.x + ((x + 0.5) * src.width) / 64, src.y + ((y + 0.5) * src.height) / 64)
  );
}

describe('frame match compares the same shape of frame', () => {
  it('PILG-076 the centre crop matches the target aspect ratio', () => {
    expect(centerCropRect(4000, 3000, 16 / 9)).toEqual({ x: 0, y: 375, width: 4000, height: 2250 });
    expect(centerCropRect(1920, 1080, 4 / 3)).toEqual({ x: 240, y: 0, width: 1440, height: 1080 });
    expect(centerCropRect(3000, 4000, 16 / 9).width).toBe(3000);
    expect(centerCropRect(100, 100, Number.NaN)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('PILG-076 a 4:3 shot of the same framing matches once cropped to the 16:9 reference', () => {
    // A 16:9 "anime frame" (160×90) of the station, and a 4:3 photo (160×120)
    // of the same place with extra sky above and ground below.
    const wide = (x: number, y: number) => station((x / 160) * 64, (y / 90) * 64);
    const tall = (x: number, y: number) => (y < 15 ? 200 : y >= 105 ? 115 : wide(x, y - 15));
    const reference = sampled(wide, { x: 0, y: 0, width: 160, height: 90 });
    const squashed = scoreFrameMatch(
      reference,
      sampled(tall, { x: 0, y: 0, width: 160, height: 120 })
    );
    const cropped = scoreFrameMatch(reference, sampled(tall, centerCropRect(160, 120, 16 / 9)));
    expect(cropped.total ?? 0).toBeGreaterThan(0.9);
    expect(cropped.total ?? 0).toBeGreaterThan(squashed.total ?? 1);
  });

  it('PILG-076 a non-finite correlation never becomes a score', () => {
    expect(gridCorrelation([0, 1, Number.NaN], [1, 0, 1])).toBeNull();
  });
});
