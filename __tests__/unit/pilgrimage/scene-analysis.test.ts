import { describe, expect, it } from 'bun:test';
import {
  inferAspectRatio,
  inferBestTime,
  inferCameraAngle,
  inferCameraSettings,
  inferColorVariety,
  inferContrast,
  inferDistance,
  inferExposureCompensation,
  inferFocalCell,
  inferMood,
  inferSceneComplexity,
  inferWarnings,
  inferWeather,
  type SceneAnalysis,
} from '../../../libs/services/pilgrimage/scene-analysis';

// Helper: a baseline "neutral afternoon" analysis. Each test tweaks only the
// fields it cares about so failures point at the actual signal that broke.
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
    ...overrides,
  };
}

describe('inferBestTime', () => {
  it('returns 夜晚 when very dark', () => {
    expect(inferBestTime(baseAnalysis({ brightness: 0.1 })).en).toBe('Night');
  });
  it('returns 黃昏 when warm and dim', () => {
    expect(
      inferBestTime(baseAnalysis({ warmth: 0.25, brightness: 0.45 })).en
    ).toBe('Golden Hour');
  });
  it('returns 正午 when very bright', () => {
    expect(inferBestTime(baseAnalysis({ brightness: 0.8 })).en).toBe('Midday');
  });
});

describe('inferWeather', () => {
  it('detects 陰天 when sky channels are nearly equal', () => {
    expect(
      inferWeather(
        baseAnalysis({ topSkyR: 170, topSkyG: 175, topSkyB: 175 })
      ).en
    ).toBe('Overcast');
  });
  it('detects 晴朗 when blue dominates with saturation', () => {
    expect(
      inferWeather(
        baseAnalysis({
          topSkyR: 100,
          topSkyG: 130,
          topSkyB: 220,
          saturation: 0.5,
        })
      ).en
    ).toBe('Clear sky');
  });
});

describe('inferCameraAngle', () => {
  it('returns High-angle when horizon sits near the top of the frame', () => {
    const a = inferCameraAngle(baseAnalysis({ horizonY: 0.2 }));
    expect(a.en).toBe('High-angle');
    expect(a.jp).toBe('俯角');
  });
  it('returns Low-angle when horizon sits near the bottom', () => {
    const a = inferCameraAngle(baseAnalysis({ horizonY: 0.8 }));
    expect(a.en).toBe('Low-angle');
    expect(a.jp).toBe('仰角');
  });
  it('returns Eye-level when horizon is in the middle band', () => {
    expect(inferCameraAngle(baseAnalysis({ horizonY: 0.5 })).en).toBe(
      'Eye-level'
    );
  });
  it('flags left-side light when left half is noticeably brighter', () => {
    expect(
      inferCameraAngle(baseAnalysis({ leftLum: 0.7, rightLum: 0.4 })).light
    ).toBe('Light from left');
  });
  it('flags right-side light when right is brighter', () => {
    expect(
      inferCameraAngle(baseAnalysis({ leftLum: 0.4, rightLum: 0.7 })).light
    ).toBe('Light from right');
  });
  it('flags even lighting when L/R differ by < 0.04', () => {
    expect(
      inferCameraAngle(baseAnalysis({ leftLum: 0.5, rightLum: 0.52 })).light
    ).toBe('Even lighting');
  });
});

describe('inferDistance', () => {
  it('recommends stepping back further for bright outdoor wide scenes', () => {
    const wide = inferDistance(
      baseAnalysis({
        topSkyR: 220,
        topSkyG: 230,
        topSkyB: 240,
        bottomGroundR: 80,
        bottomGroundG: 80,
        bottomGroundB: 80,
        edgeCells: [0.5, 0.5, 0.5, 0.5, 0.3, 0.5, 0.5, 0.5, 0.5], // edges spread, not centered
      })
    );
    const m = parseFloat(wide.en.replace(/[^0-9.]/g, ''));
    expect(m).toBeGreaterThanOrEqual(3.5);
  });
  it('recommends shorter distance for close-up subjects (edges concentrated centrally)', () => {
    const close = inferDistance(
      baseAnalysis({
        topSkyR: 90,
        topSkyG: 90,
        topSkyB: 90, // no bright sky → indoor / close
        bottomGroundR: 90,
        bottomGroundG: 90,
        bottomGroundB: 90,
        edgeCells: [0.1, 0.1, 0.1, 0.1, 1.0, 0.1, 0.1, 0.1, 0.1], // center-heavy
      })
    );
    const m = parseFloat(close.en.replace(/[^0-9.]/g, ''));
    expect(m).toBeLessThanOrEqual(2.5);
  });
  it('clamps to the 1.2–5.5m range', () => {
    const extremeBright = inferDistance(
      baseAnalysis({
        topSkyR: 255,
        topSkyG: 255,
        topSkyB: 255,
        bottomGroundR: 0,
        bottomGroundG: 0,
        bottomGroundB: 0,
        edgeCells: [1, 1, 1, 1, 0, 1, 1, 1, 1],
      })
    );
    const m = parseFloat(extremeBright.en.replace(/[^0-9.]/g, ''));
    expect(m).toBeLessThanOrEqual(5.5);
    expect(m).toBeGreaterThanOrEqual(1.2);
  });
});

describe('inferContrast', () => {
  it('returns high for wide dynamic range', () => {
    expect(inferContrast(baseAnalysis({ contrast: 0.9 })).level).toBe('high');
  });
  it('returns mid for balanced range', () => {
    expect(inferContrast(baseAnalysis({ contrast: 0.7 })).level).toBe('mid');
  });
  it('returns low for flat scenes', () => {
    expect(inferContrast(baseAnalysis({ contrast: 0.3 })).level).toBe('low');
  });
});

describe('inferSceneComplexity', () => {
  it('flags busy scenes when edge magnitude is high', () => {
    expect(inferSceneComplexity(baseAnalysis({ edgeMagnitude: 0.7 })).en).toBe(
      'Detailed scene'
    );
  });
  it('flags minimal scenes when edges are sparse', () => {
    expect(
      inferSceneComplexity(baseAnalysis({ edgeMagnitude: 0.1 })).en
    ).toBe('Minimal / clean');
  });
});

describe('inferAspectRatio', () => {
  it('recommends 4:5 when vertical edges dominate', () => {
    expect(
      inferAspectRatio(baseAnalysis({ verticalEdgeRatio: 0.7 })).ratio
    ).toBe('4:5');
  });
  it('recommends 16:9 when horizontal edges dominate', () => {
    expect(
      inferAspectRatio(baseAnalysis({ verticalEdgeRatio: 0.3 })).ratio
    ).toBe('16:9');
  });
  it('recommends 1:1 when balanced', () => {
    expect(
      inferAspectRatio(baseAnalysis({ verticalEdgeRatio: 0.5 })).ratio
    ).toBe('1:1');
  });
});

describe('inferColorVariety', () => {
  it('flags monochrome when variance is low', () => {
    expect(
      inferColorVariety(baseAnalysis({ colorVariance: 0.1 })).en
    ).toBe('Monochrome leaning');
  });
  it('flags rich palette when variance is high', () => {
    expect(
      inferColorVariety(baseAnalysis({ colorVariance: 0.7 })).en
    ).toBe('Rich palette');
  });
});

describe('inferMood', () => {
  it('returns warm cinematic for warm, saturated scenes', () => {
    expect(
      inferMood(baseAnalysis({ warmth: 0.25, saturation: 0.4 })).en
    ).toBe('Warm cinematic');
  });
  it('returns moody noir for dark, low-variance scenes', () => {
    expect(
      inferMood(baseAnalysis({ brightness: 0.18, colorVariance: 0.2 })).en
    ).toBe('Moody / noir');
  });
  it('returns cool & crisp for cool, bright scenes', () => {
    expect(
      inferMood(baseAnalysis({ warmth: -0.15, brightness: 0.6 })).en
    ).toBe('Cool & crisp');
  });
});

describe('inferExposureCompensation', () => {
  // Histogram bin index: 0=darkest, 15=brightest. Push mass to one end → big offset.
  function histAt(centerBin: number): number[] {
    return Array.from({ length: 16 }, (_, i) => (i === centerBin ? 1 : 0));
  }
  it('suggests +0.7 EV for very underexposed images', () => {
    expect(
      inferExposureCompensation(baseAnalysis({ luminanceHistogram: histAt(2) })).ev
    ).toBe('+0.7');
  });
  it('suggests -0.7 EV for very overexposed images', () => {
    expect(
      inferExposureCompensation(baseAnalysis({ luminanceHistogram: histAt(14) }))
        .ev
    ).toBe('-0.7');
  });
  it('suggests 0 EV when histogram is balanced', () => {
    expect(
      inferExposureCompensation(baseAnalysis({ luminanceHistogram: histAt(7) })).ev
    ).toBe('0');
  });
});

describe('inferCameraSettings', () => {
  it('returns low ISO + narrow aperture for bright scenes', () => {
    expect(
      inferCameraSettings(baseAnalysis({ brightness: 0.8 })).iso
    ).toBe('ISO 100');
  });
  it('returns high ISO + wide aperture for night scenes', () => {
    expect(
      inferCameraSettings(baseAnalysis({ brightness: 0.15 })).iso
    ).toBe('ISO 1600');
  });
});

describe('inferFocalCell', () => {
  it('picks the cell with the strongest edges', () => {
    const cells = [0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    expect(inferFocalCell(baseAnalysis({ edgeCells: cells })).cell).toBe(2);
  });
  it('falls back to a corner when the center wins', () => {
    const cells = [0.2, 0.1, 0.7, 0.1, 0.9, 0.1, 0.1, 0.1, 0.3];
    const f = inferFocalCell(baseAnalysis({ edgeCells: cells }));
    expect([0, 2, 6, 8]).toContain(f.cell);
    expect(f.cell).toBe(2); // top-right is the strongest corner
  });
  it('returns thirds-grid coordinates for rendering', () => {
    const cells = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.1, 0.1];
    const f = inferFocalCell(baseAnalysis({ edgeCells: cells }));
    expect(f.cell).toBe(6);
    expect(f.leftPct).toBeCloseTo(33.33, 1);
    expect(f.topPct).toBeCloseTo(66.66, 1);
    expect(f.en).toBe('bottom-left');
  });
});

describe('inferWarnings', () => {
  it('flags highlight clipping', () => {
    const w = inferWarnings(baseAnalysis({ highlightRatio: 0.15 }));
    expect(w.some((x) => x.icon === 'sunny')).toBe(true);
  });
  it('flags crushed shadows', () => {
    const w = inferWarnings(baseAnalysis({ shadowRatio: 0.2 }));
    expect(w.some((x) => x.icon === 'moon')).toBe(true);
  });
  it('flags low-light stability', () => {
    const w = inferWarnings(baseAnalysis({ brightness: 0.15 }));
    expect(w.some((x) => x.icon === 'walk')).toBe(true);
  });
  it('always returns at least one item (evergreen fallback)', () => {
    const w = inferWarnings(baseAnalysis());
    expect(w.length).toBeGreaterThanOrEqual(1);
  });
  it('caps to 3 entries', () => {
    const w = inferWarnings(
      baseAnalysis({
        highlightRatio: 0.2,
        shadowRatio: 0.2,
        brightness: 0.1,
        edgeMagnitude: 0.9,
        contrast: 1,
      })
    );
    expect(w.length).toBeLessThanOrEqual(3);
  });
});
