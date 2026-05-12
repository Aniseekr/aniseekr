// Heuristic scene analysis for the Photo Tips screen.
// Uses Skia natively: decode the reference image, downscale to 64×64 in a CPU
// surface, read RGBA bytes, then derive ~13 numeric signals that feed the
// tile inference functions below. No ML, no faking — if the image can't be
// fetched/decoded we return null and the UI shows an error state instead of
// inventing plausible values.

import {
  AlphaType,
  ColorType,
  Skia,
} from '@shopify/react-native-skia';

const SAMPLE_W = 64;
const SAMPLE_H = 64;

export interface SceneAnalysis {
  // Whole-frame averages.
  avgR: number; // 0–255
  avgG: number;
  avgB: number;
  brightness: number; // 0–1
  warmth: number; // (R − B) / 255, positive = warm
  saturation: number; // 0–1, (maxV − minV) / maxV across pixel luminance

  // Top quarter — sky proxy.
  topSkyR: number;
  topSkyG: number;
  topSkyB: number;

  // Bottom quarter — ground proxy.
  bottomGroundR: number;
  bottomGroundG: number;
  bottomGroundB: number;

  // Composition signals.
  horizonY: number; // 0–1, row where vertical brightness gradient peaks
  leftLum: number; // 0–1, left-half luminance
  rightLum: number; // 0–1, right-half luminance
  edgeCells: number[]; // 9 cells (row-major), normalized 0–1 Sobel magnitude
}

export async function analyzeImage(uri: string): Promise<SceneAnalysis | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return null;

    const surface = Skia.Surface.Make(SAMPLE_W, SAMPLE_H);
    if (!surface) return null;

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: image.width(), height: image.height() },
      { x: 0, y: 0, width: SAMPLE_W, height: SAMPLE_H },
      paint
    );

    const snap = surface.makeImageSnapshot();
    const pixels = snap.readPixels(0, 0, {
      width: SAMPLE_W,
      height: SAMPLE_H,
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
    }) as Uint8Array | null;
    if (!pixels) return null;

    return reducePixels(pixels, SAMPLE_W, SAMPLE_H);
  } catch {
    return null;
  }
}

function reducePixels(p: Uint8Array, W: number, H: number): SceneAnalysis {
  const N = W * H;

  // Precompute per-pixel luminance once; Sobel reuses it.
  const L = new Float32Array(N);
  let r = 0;
  let g = 0;
  let b = 0;
  let tR = 0;
  let tG = 0;
  let tB = 0;
  let tN = 0;
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgN = 0;
  let leftSum = 0;
  let leftN = 0;
  let rightSum = 0;
  let rightN = 0;
  let maxV = 0;
  let minV = 255;

  const topCutoff = H / 4;
  const bottomCutoff = (3 * H) / 4;
  const midX = W / 2;
  const rowLum = new Float32Array(H);

  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const R = p[i];
      const G = p[i + 1];
      const B = p[i + 2];
      r += R;
      g += G;
      b += B;
      const v = (R + G + B) / 3;
      L[y * W + x] = v;
      rowSum += v;
      if (v > maxV) maxV = v;
      if (v < minV) minV = v;
      if (y < topCutoff) {
        tR += R;
        tG += G;
        tB += B;
        tN++;
      } else if (y >= bottomCutoff) {
        bgR += R;
        bgG += G;
        bgB += B;
        bgN++;
      }
      if (x < midX) {
        leftSum += v;
        leftN++;
      } else {
        rightSum += v;
        rightN++;
      }
    }
    rowLum[y] = rowSum / W;
  }

  // Horizon = row with largest absolute brightness delta to the row above.
  // Smoothed by averaging with the prior row delta to reduce single-row noise.
  let maxDelta = -1;
  let horizonRow = H / 2;
  for (let y = 2; y < H; y++) {
    const d = Math.abs(
      (rowLum[y] - rowLum[y - 1]) + (rowLum[y - 1] - rowLum[y - 2]) * 0.5
    );
    if (d > maxDelta) {
      maxDelta = d;
      horizonRow = y;
    }
  }

  // Sobel magnitude accumulated into a 3×3 cell grid.
  const cells = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const cellCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const tl = L[i - W - 1];
      const tm = L[i - W];
      const tr = L[i - W + 1];
      const ml = L[i - 1];
      const mr = L[i + 1];
      const bl = L[i + W - 1];
      const bm = L[i + W];
      const br2 = L[i + W + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br2;
      const gy = -tl - 2 * tm - tr + bl + 2 * bm + br2;
      const mag = Math.abs(gx) + Math.abs(gy);
      const cellX = x < W / 3 ? 0 : x < (2 * W) / 3 ? 1 : 2;
      const cellY = y < H / 3 ? 0 : y < (2 * H) / 3 ? 1 : 2;
      const cell = cellY * 3 + cellX;
      cells[cell] += mag;
      cellCounts[cell]++;
    }
  }
  let maxCell = 1;
  const cellAvg = cells.map((s, i) => {
    const v = s / Math.max(1, cellCounts[i]);
    if (v > maxCell) maxCell = v;
    return v;
  });
  const edgeCells = cellAvg.map((v) => v / maxCell);

  const avgR = r / N;
  const avgG = g / N;
  const avgB = b / N;
  const brightness = (avgR + avgG + avgB) / (3 * 255);
  const warmth = (avgR - avgB) / 255;
  const saturation = maxV > 0 ? (maxV - minV) / maxV : 0;

  return {
    avgR,
    avgG,
    avgB,
    brightness,
    warmth,
    saturation,
    topSkyR: tN > 0 ? tR / tN : avgR,
    topSkyG: tN > 0 ? tG / tN : avgG,
    topSkyB: tN > 0 ? tB / tN : avgB,
    bottomGroundR: bgN > 0 ? bgR / bgN : avgR,
    bottomGroundG: bgN > 0 ? bgG / bgN : avgG,
    bottomGroundB: bgN > 0 ? bgB / bgN : avgB,
    horizonY: horizonRow / H,
    leftLum: leftN > 0 ? leftSum / leftN / 255 : brightness,
    rightLum: rightN > 0 ? rightSum / rightN / 255 : brightness,
    edgeCells,
  };
}

export interface BestTimeInference {
  jp: string;
  en: string;
  range: string;
}

export function inferBestTime(a: SceneAnalysis): BestTimeInference {
  const skyBrightness = (a.topSkyR + a.topSkyG + a.topSkyB) / (3 * 255);
  if (a.brightness < 0.18) {
    return { jp: '夜晚', en: 'Night', range: '19:30 – 22:00' };
  }
  if (a.warmth > 0.18 && a.brightness < 0.55) {
    return { jp: '黃昏', en: 'Golden Hour', range: '17:30 – 18:15' };
  }
  if (a.warmth > 0.08 && a.brightness < 0.45) {
    return { jp: '夕暮', en: 'Dusk', range: '18:30 – 19:15' };
  }
  if (a.warmth < -0.05 && skyBrightness > 0.55 && a.brightness < 0.55) {
    return { jp: '清晨', en: 'Early morning', range: '05:30 – 06:30' };
  }
  if (a.brightness > 0.7) {
    return { jp: '正午', en: 'Midday', range: '11:30 – 13:30' };
  }
  return { jp: '午後', en: 'Afternoon', range: '14:00 – 16:30' };
}

export interface WeatherInference {
  jp: string;
  en: string;
}

export function inferWeather(a: SceneAnalysis): WeatherInference {
  const top = (a.topSkyR + a.topSkyG + a.topSkyB) / 3;
  const skyBlueScore = a.topSkyB - (a.topSkyR + a.topSkyG) / 2;
  const greyDelta = Math.max(
    Math.abs(a.topSkyR - a.topSkyG),
    Math.abs(a.topSkyG - a.topSkyB),
    Math.abs(a.topSkyR - a.topSkyB)
  );
  const skyGrey = greyDelta < 18;

  if (skyGrey && top < 110) {
    return { jp: '雨天 / 多雲', en: 'Cloudy / rain' };
  }
  if (skyGrey) {
    return { jp: '陰天', en: 'Overcast' };
  }
  if (skyBlueScore > 28 && a.saturation > 0.3) {
    return { jp: '晴朗', en: 'Clear sky' };
  }
  if (skyBlueScore > 10) {
    return { jp: '晴天 / 薄雲', en: 'Clear w/ thin clouds' };
  }
  if (a.warmth > 0.12 && top > 120) {
    return { jp: '霞 / 黃昏霧', en: 'Hazy golden' };
  }
  return { jp: '多雲', en: 'Partly cloudy' };
}

export interface CameraAngleInference {
  jp: string;
  en: string;
  light: string; // light direction subtitle e.g. "Light from left"
}

export function inferCameraAngle(a: SceneAnalysis): CameraAngleInference {
  // horizonY ≈ where the dominant sky/ground transition sits.
  //  - small y (high in frame, ground dominates) → camera tilted DOWN (high angle)
  //  - large y (low in frame, sky dominates)     → camera tilted UP   (low angle)
  let jp: string;
  let en: string;
  if (a.horizonY < 0.35) {
    jp = '俯角';
    en = 'High-angle';
  } else if (a.horizonY > 0.65) {
    jp = '仰角';
    en = 'Low-angle';
  } else {
    jp = '平視';
    en = 'Eye-level';
  }

  const diff = a.leftLum - a.rightLum;
  let light: string;
  if (Math.abs(diff) < 0.04) {
    light = 'Even lighting';
  } else if (diff > 0) {
    light = 'Light from left';
  } else {
    light = 'Light from right';
  }
  return { jp, en, light };
}

export interface DistanceInference {
  jp: string;
  en: string;
}

export function inferDistance(a: SceneAnalysis): DistanceInference {
  // Two structural signals:
  //  1. Sky-vs-ground luminance gap → outdoor wide vs indoor/close.
  //  2. Edge concentration in the center cell → close subject vs spread scene.
  const skyLum = (a.topSkyR + a.topSkyG + a.topSkyB) / (3 * 255);
  const groundLum =
    (a.bottomGroundR + a.bottomGroundG + a.bottomGroundB) / (3 * 255);
  const outdoorScore = Math.max(0, skyLum - groundLum * 0.7);

  const centerEdges = a.edgeCells[4];
  const edgesSum = a.edgeCells.reduce((s, v) => s + v, 0);
  const centerRatio = centerEdges / Math.max(0.01, edgesSum); // 1/9 ≈ 0.11 even

  let metres = 2.5;
  if (outdoorScore > 0.2) metres += 1.0;
  if (outdoorScore > 0.35) metres += 0.6;
  if (centerRatio > 0.22) metres -= 0.6;
  if (centerRatio > 0.3) metres -= 0.5;
  if (centerRatio < 0.13) metres += 0.5;
  metres = Math.max(1.2, Math.min(metres, 5.5));

  const rounded = (Math.round(metres * 10) / 10).toFixed(1);
  return { jp: `退後 ${rounded}m`, en: `Step back ~${rounded}m` };
}
