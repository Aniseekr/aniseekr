// Heuristic scene analysis for the Photo Tips screen — pure JS.
// The Skia-based loader lives in ./scene-analysis-skia.ts; this file holds
// the data shape, the pixel reduction (operates on a raw Uint8Array so it
// stays test-friendly), and all the inference helpers used by the UI.

const HIST_BINS = 16;
// Quantize to 4-bit per channel (16 levels) → 4096 buckets total. Easy to
// post-process into a top-5 palette without burning memory.
const PALETTE_BITS = 4;
const PALETTE_LEVELS = 1 << PALETTE_BITS; // 16
const PALETTE_BUCKETS = PALETTE_LEVELS ** 3; // 4096

export interface SceneAnalysis {
  // Whole-frame averages.
  avgR: number; // 0–255
  avgG: number;
  avgB: number;
  brightness: number; // 0–1
  warmth: number; // (R − B) / 255, positive = warm
  saturation: number; // 0–1, (maxV − minV) / maxV across pixel luminance

  // Whole-frame dynamic range / variance.
  minLum: number; // 0–255
  maxLum: number;
  contrast: number; // 0–1, (max − min) / 255
  colorVariance: number; // 0–1, normalized RGB std-dev — monochrome vs colorful

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
  leftLum: number; // 0–1
  rightLum: number; // 0–1
  centerLum: number; // 0–1, brightness of center cell
  cornerLum: number; // 0–1, average brightness of 4 corner cells
  edgeCells: number[]; // 9 cells (row-major), normalized 0–1 Sobel magnitude

  // Edge totals.
  edgeMagnitude: number; // 0–1, normalized total Sobel — scene complexity
  verticalEdgeRatio: number; // 0–1, |gx| / (|gx|+|gy|) → vertical-line dominance

  // Exposure risks.
  highlightRatio: number; // 0–1, fraction of pixels with v > 235
  shadowRatio: number; // 0–1, fraction of pixels with v < 12

  // Distributions.
  luminanceHistogram: number[]; // 16 bins, each 0–1
  palette: string[]; // up to 5 dominant hex colors, ranked by frequency
}

export function reducePixels(p: Uint8Array, W: number, H: number): SceneAnalysis {
  const N = W * H;

  const L = new Float32Array(N);
  let r = 0;
  let g = 0;
  let b = 0;
  let rSq = 0;
  let gSq = 0;
  let bSq = 0;
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
  let highlightCount = 0;
  let shadowCount = 0;

  const histogram = new Uint32Array(HIST_BINS);
  const paletteBuckets = new Uint32Array(PALETTE_BUCKETS);
  const cellLumSum = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const cellLumN = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  const topCutoff = H / 4;
  const bottomCutoff = (3 * H) / 4;
  const midX = W / 2;
  const rowLum = new Float32Array(H);

  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    const cellY = y < H / 3 ? 0 : y < (2 * H) / 3 ? 1 : 2;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const R = p[i];
      const G = p[i + 1];
      const B = p[i + 2];
      r += R;
      g += G;
      b += B;
      rSq += R * R;
      gSq += G * G;
      bSq += B * B;
      const v = (R + G + B) / 3;
      L[y * W + x] = v;
      rowSum += v;
      if (v > maxV) maxV = v;
      if (v < minV) minV = v;
      if (v > 235) highlightCount++;
      if (v < 12) shadowCount++;

      // Luminance histogram (16 bins of width 16).
      const bin = Math.min(HIST_BINS - 1, (v / (256 / HIST_BINS)) | 0);
      histogram[bin]++;

      // 4-bit-per-channel color histogram for palette extraction.
      const qR = R >> (8 - PALETTE_BITS);
      const qG = G >> (8 - PALETTE_BITS);
      const qB = B >> (8 - PALETTE_BITS);
      paletteBuckets[(qR << (PALETTE_BITS * 2)) | (qG << PALETTE_BITS) | qB]++;

      // Cell brightness (3×3 grid).
      const cellX = x < W / 3 ? 0 : x < (2 * W) / 3 ? 1 : 2;
      const cell = cellY * 3 + cellX;
      cellLumSum[cell] += v;
      cellLumN[cell]++;

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
      rowLum[y] - rowLum[y - 1] + (rowLum[y - 1] - rowLum[y - 2]) * 0.5
    );
    if (d > maxDelta) {
      maxDelta = d;
      horizonRow = y;
    }
  }

  // Sobel magnitude accumulated into a 3×3 cell grid + totals.
  const edgeCellSum = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const edgeCellCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let totalGx = 0;
  let totalGy = 0;
  let totalMag = 0;
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
      const aGx = Math.abs(gx);
      const aGy = Math.abs(gy);
      const mag = aGx + aGy;
      totalGx += aGx;
      totalGy += aGy;
      totalMag += mag;
      const cellX = x < W / 3 ? 0 : x < (2 * W) / 3 ? 1 : 2;
      const cellY = y < H / 3 ? 0 : y < (2 * H) / 3 ? 1 : 2;
      const cell = cellY * 3 + cellX;
      edgeCellSum[cell] += mag;
      edgeCellCount[cell]++;
    }
  }
  let maxCell = 1;
  const cellAvg = edgeCellSum.map((s, i) => {
    const v = s / Math.max(1, edgeCellCount[i]);
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

  const varR = Math.max(0, rSq / N - avgR * avgR);
  const varG = Math.max(0, gSq / N - avgG * avgG);
  const varB = Math.max(0, bSq / N - avgB * avgB);
  const colorVariance = Math.min(
    1,
    Math.sqrt((varR + varG + varB) / 3) / 96
  );

  const cellLum = cellLumSum.map((s, i) => s / Math.max(1, cellLumN[i]) / 255);
  const centerLum = cellLum[4];
  const cornerLum = (cellLum[0] + cellLum[2] + cellLum[6] + cellLum[8]) / 4;

  // Normalize edge totals by pixel count of the interior region.
  const edgeArea = (H - 2) * (W - 2);
  // Sobel magnitude in [0, ~1020] per pixel; 200 is a reasonable "busy" floor.
  const edgeMagnitude = Math.min(1, totalMag / edgeArea / 200);
  const verticalEdgeRatio = totalGx / Math.max(1, totalGx + totalGy);

  const highlightRatio = highlightCount / N;
  const shadowRatio = shadowCount / N;

  const luminanceHistogram = Array.from(histogram).map((c) => c / N);

  const palette = extractPalette(paletteBuckets);

  return {
    avgR,
    avgG,
    avgB,
    brightness,
    warmth,
    saturation,
    minLum: minV,
    maxLum: maxV,
    contrast: (maxV - minV) / 255,
    colorVariance,
    topSkyR: tN > 0 ? tR / tN : avgR,
    topSkyG: tN > 0 ? tG / tN : avgG,
    topSkyB: tN > 0 ? tB / tN : avgB,
    bottomGroundR: bgN > 0 ? bgR / bgN : avgR,
    bottomGroundG: bgN > 0 ? bgG / bgN : avgG,
    bottomGroundB: bgN > 0 ? bgB / bgN : avgB,
    horizonY: horizonRow / H,
    leftLum: leftN > 0 ? leftSum / leftN / 255 : brightness,
    rightLum: rightN > 0 ? rightSum / rightN / 255 : brightness,
    centerLum,
    cornerLum,
    edgeCells,
    edgeMagnitude,
    verticalEdgeRatio,
    highlightRatio,
    shadowRatio,
    luminanceHistogram,
    palette,
  };
}

// Pick top-5 dominant colors from the 4-bit-per-channel histogram, with a
// simple suppression step so we don't return five near-identical greys.
function extractPalette(buckets: Uint32Array): string[] {
  const entries: { idx: number; count: number }[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const c = buckets[i];
    if (c > 0) entries.push({ idx: i, count: c });
  }
  entries.sort((a, b) => b.count - a.count);

  const picked: number[] = [];
  for (const e of entries) {
    if (picked.length >= 5) break;
    const qR = (e.idx >> (PALETTE_BITS * 2)) & (PALETTE_LEVELS - 1);
    const qG = (e.idx >> PALETTE_BITS) & (PALETTE_LEVELS - 1);
    const qB = e.idx & (PALETTE_LEVELS - 1);
    let tooClose = false;
    for (const p of picked) {
      const pR = (p >> (PALETTE_BITS * 2)) & (PALETTE_LEVELS - 1);
      const pG = (p >> PALETTE_BITS) & (PALETTE_LEVELS - 1);
      const pB = p & (PALETTE_LEVELS - 1);
      const d = Math.abs(qR - pR) + Math.abs(qG - pG) + Math.abs(qB - pB);
      if (d < 4) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) picked.push(e.idx);
  }
  return picked.map(quantizedToHex);
}

function quantizedToHex(idx: number): string {
  const qR = (idx >> (PALETTE_BITS * 2)) & (PALETTE_LEVELS - 1);
  const qG = (idx >> PALETTE_BITS) & (PALETTE_LEVELS - 1);
  const qB = idx & (PALETTE_LEVELS - 1);
  // De-quantize: q * 17 maps {0..15} → {0..255} evenly.
  const R = qR * 17;
  const G = qG * 17;
  const B = qB * 17;
  return (
    '#' +
    R.toString(16).padStart(2, '0') +
    G.toString(16).padStart(2, '0') +
    B.toString(16).padStart(2, '0')
  ).toUpperCase();
}

// ===================== INFERENCE FUNCTIONS =====================

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
  light: string;
}

export function inferCameraAngle(a: SceneAnalysis): CameraAngleInference {
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
  const skyLum = (a.topSkyR + a.topSkyG + a.topSkyB) / (3 * 255);
  const groundLum =
    (a.bottomGroundR + a.bottomGroundG + a.bottomGroundB) / (3 * 255);
  const outdoorScore = Math.max(0, skyLum - groundLum * 0.7);
  const centerEdges = a.edgeCells[4];
  const edgesSum = a.edgeCells.reduce((s, v) => s + v, 0);
  const centerRatio = centerEdges / Math.max(0.01, edgesSum);
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

// ----- New inferences (built on the expanded SceneAnalysis fields) -----

export interface ContrastInference {
  jp: string;
  en: string;
  level: 'low' | 'mid' | 'high';
}

export function inferContrast(a: SceneAnalysis): ContrastInference {
  if (a.contrast > 0.85) return { jp: '高對比', en: 'High contrast', level: 'high' };
  if (a.contrast > 0.55) return { jp: '均衡對比', en: 'Balanced contrast', level: 'mid' };
  return { jp: '柔和對比', en: 'Soft / low contrast', level: 'low' };
}

export interface ComplexityInference {
  jp: string;
  en: string;
}

export function inferSceneComplexity(a: SceneAnalysis): ComplexityInference {
  if (a.edgeMagnitude > 0.55) return { jp: '繁複場景', en: 'Detailed scene' };
  if (a.edgeMagnitude > 0.3) return { jp: '一般細節', en: 'Moderate detail' };
  return { jp: '簡潔場景', en: 'Minimal / clean' };
}

export interface MoodInference {
  jp: string;
  en: string;
}

export function inferMood(a: SceneAnalysis): MoodInference {
  if (a.brightness < 0.25 && a.colorVariance < 0.35) {
    return { jp: '低調幽暗', en: 'Moody / noir' };
  }
  if (a.warmth > 0.18 && a.saturation > 0.35) {
    return { jp: '溫暖電影感', en: 'Warm cinematic' };
  }
  if (a.warmth < -0.1 && a.brightness > 0.5) {
    return { jp: '冷冽清晨', en: 'Cool & crisp' };
  }
  if (a.colorVariance > 0.45 && a.saturation > 0.4) {
    return { jp: '繽紛活潑', en: 'Vivid pop' };
  }
  if (a.brightness > 0.65 && a.colorVariance < 0.3) {
    return { jp: '柔和淡色', en: 'Pastel soft' };
  }
  return { jp: '自然樸實', en: 'Natural / neutral' };
}

export interface AspectRatioInference {
  ratio: '16:9' | '4:5' | '1:1';
  jp: string;
  en: string;
}

export function inferAspectRatio(a: SceneAnalysis): AspectRatioInference {
  // verticalEdgeRatio = |gx|/total. Gx detects horizontal change → vertical
  // edges (building walls, pillars). So high value → portrait / 4:5.
  if (a.verticalEdgeRatio > 0.58) {
    return { ratio: '4:5', jp: '直幅 4:5', en: 'Tall crop emphasises verticals' };
  }
  if (a.verticalEdgeRatio < 0.42) {
    return { ratio: '16:9', jp: '橫幅 16:9', en: 'Wide crop for landscape lines' };
  }
  return { ratio: '1:1', jp: '方形 1:1', en: 'Square balances both axes' };
}

export interface ColorVarietyInference {
  jp: string;
  en: string;
}

export function inferColorVariety(a: SceneAnalysis): ColorVarietyInference {
  if (a.colorVariance > 0.5) return { jp: '色彩豐富', en: 'Rich palette' };
  if (a.colorVariance > 0.28) return { jp: '中等色彩', en: 'Moderate palette' };
  return { jp: '單色傾向', en: 'Monochrome leaning' };
}

export interface ExposureInference {
  ev: string; // signed string, e.g. '+0.7' or '−0.3' or '0'
  jp: string;
  en: string;
}

export function inferExposureCompensation(a: SceneAnalysis): ExposureInference {
  // Histogram-weighted mean bin (0–15). Ideal middle gray ≈ bin 7.5.
  let weightedSum = 0;
  for (let i = 0; i < a.luminanceHistogram.length; i++) {
    weightedSum += i * a.luminanceHistogram[i];
  }
  const offset = weightedSum - 7.5;
  if (offset < -2.5)
    return { ev: '+0.7', jp: '提亮 +0.7 EV', en: 'Brighten +0.7 EV' };
  if (offset < -1)
    return { ev: '+0.3', jp: '微提亮 +0.3 EV', en: 'Slight brighten +0.3 EV' };
  if (offset > 2.5)
    return { ev: '-0.7', jp: '壓暗 −0.7 EV', en: 'Darken −0.7 EV' };
  if (offset > 1)
    return { ev: '-0.3', jp: '微壓暗 −0.3 EV', en: 'Slight darken −0.3 EV' };
  return { ev: '0', jp: '無需補償', en: 'Balanced exposure' };
}

export interface CameraSettingsInference {
  iso: string;
  aperture: string;
  shutter: string;
  jp: string;
}

export function inferCameraSettings(a: SceneAnalysis): CameraSettingsInference {
  if (a.brightness > 0.72) {
    return { iso: 'ISO 100', aperture: 'f/8.0', shutter: '1/250s', jp: '明亮環境' };
  }
  if (a.brightness > 0.5) {
    return { iso: 'ISO 200', aperture: 'f/5.6', shutter: '1/125s', jp: '正常光線' };
  }
  if (a.brightness > 0.28) {
    return { iso: 'ISO 400', aperture: 'f/4.0', shutter: '1/60s', jp: '弱光環境' };
  }
  return { iso: 'ISO 1600', aperture: 'f/2.8', shutter: '1/30s', jp: '夜間 / 三腳架' };
}

export interface FocalCellInference {
  cell: number; // 0–8 (row-major)
  leftPct: number; // 0–100, where to render the dot on a rule-of-thirds grid
  topPct: number;
  jp: string; // "右下" etc.
  en: string; // "bottom-right"
}

const FOCAL_POSITIONS: Record<number, { jp: string; en: string; left: number; top: number }> = {
  0: { jp: '左上', en: 'top-left', left: 33.33, top: 33.33 },
  1: { jp: '上方中央', en: 'top-center', left: 50, top: 33.33 },
  2: { jp: '右上', en: 'top-right', left: 66.66, top: 33.33 },
  3: { jp: '左中', en: 'left-center', left: 33.33, top: 50 },
  4: { jp: '中央', en: 'center', left: 50, top: 50 },
  5: { jp: '右中', en: 'right-center', left: 66.66, top: 50 },
  6: { jp: '左下', en: 'bottom-left', left: 33.33, top: 66.66 },
  7: { jp: '下方中央', en: 'bottom-center', left: 50, top: 66.66 },
  8: { jp: '右下', en: 'bottom-right', left: 66.66, top: 66.66 },
};

export function inferFocalCell(a: SceneAnalysis): FocalCellInference {
  // Argmax of edge density across the 9 cells. If the center wins we snap to
  // the strongest corner instead — rule of thirds, not center punch.
  let maxIdx = 0;
  let maxVal = a.edgeCells[0];
  for (let i = 1; i < a.edgeCells.length; i++) {
    if (a.edgeCells[i] > maxVal) {
      maxVal = a.edgeCells[i];
      maxIdx = i;
    }
  }
  if (maxIdx === 4) {
    const corners = [0, 2, 6, 8];
    let bestCorner = corners[0];
    let bestVal = a.edgeCells[corners[0]];
    for (const c of corners) {
      if (a.edgeCells[c] > bestVal) {
        bestVal = a.edgeCells[c];
        bestCorner = c;
      }
    }
    maxIdx = bestCorner;
  }
  const pos = FOCAL_POSITIONS[maxIdx];
  return {
    cell: maxIdx,
    leftPct: pos.left,
    topPct: pos.top,
    jp: pos.jp,
    en: pos.en,
  };
}

export type WarningIcon =
  | 'sunny'
  | 'moon'
  | 'eye-off'
  | 'flash-off'
  | 'walk'
  | 'people'
  | 'alert-circle'
  | 'contrast';

export interface WarningItem {
  icon: WarningIcon;
  title: string; // jp
  body: string; // en hint
}

export function inferWarnings(a: SceneAnalysis): WarningItem[] {
  const list: WarningItem[] = [];

  if (a.highlightRatio > 0.08) {
    list.push({
      icon: 'sunny',
      title: '高光易爆',
      body: 'Bright highlights may clip — bracket exposure or use HDR.',
    });
  }
  if (a.shadowRatio > 0.12) {
    list.push({
      icon: 'moon',
      title: '暗部破壞',
      body: 'Deep shadows lose detail — try +0.3 EV or fill light.',
    });
  }
  if (a.contrast > 0.95 && (a.highlightRatio > 0.04 || a.shadowRatio > 0.06)) {
    list.push({
      icon: 'contrast',
      title: '對比過強',
      body: 'Extreme dynamic range — bracket or use a graduated filter.',
    });
  }
  if (a.brightness < 0.22) {
    list.push({
      icon: 'walk',
      title: '弱光需穩定',
      body: 'Low light — brace your phone or use a tripod, skip the flash.',
    });
  }
  if (a.edgeMagnitude > 0.65) {
    list.push({
      icon: 'alert-circle',
      title: '畫面繁雜',
      body: 'Busy scene — zoom in or simplify to keep the subject readable.',
    });
  }

  // Always backstop with the two evergreen tips so the section never goes
  // empty for clean / well-exposed scenes.
  if (list.length < 2) {
    list.push({
      icon: 'people',
      title: '避開人潮高峰',
      body: 'Crowds peak on weekend afternoons — try early morning or weekdays.',
    });
  }
  if (!list.some((w) => w.icon === 'flash-off')) {
    list.push({
      icon: 'flash-off',
      title: '勿用閃光燈',
      body: 'Flash washes out the cinematic depth — keep it off.',
    });
  }

  return list.slice(0, 3);
}
