// Skia loader for scene analysis. Kept separate from scene-analysis.ts so the
// pure inference functions (and their unit tests) don't transitively import
// react-native through @shopify/react-native-skia.

import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import { centerCropRect, reducePixels, type SceneAnalysis } from './scene-analysis';

const SAMPLE_W = 64;
const SAMPLE_H = 64;

type Rect = { x: number; y: number; width: number; height: number };

async function decode(uri: string): Promise<SkImage | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

/** Downsample `src` of `image` to the 64×64 grid and reduce it. */
function sample(image: SkImage, src: Rect): SceneAnalysis | null {
  try {
    const surface = Skia.Surface.Make(SAMPLE_W, SAMPLE_H);
    if (!surface) return null;
    surface
      .getCanvas()
      .drawImageRect(image, src, { x: 0, y: 0, width: SAMPLE_W, height: SAMPLE_H }, Skia.Paint());
    const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
      width: SAMPLE_W,
      height: SAMPLE_H,
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
    }) as Uint8Array | null;
    return pixels ? reducePixels(pixels, SAMPLE_W, SAMPLE_H) : null;
  } catch {
    return null;
  }
}

const fullRect = (image: SkImage): Rect => ({
  x: 0,
  y: 0,
  width: image.width(),
  height: image.height(),
});

export async function analyzeImage(uri: string): Promise<SceneAnalysis | null> {
  const image = await decode(uri);
  return image ? sample(image, fullRect(image)) : null;
}

/**
 * Analyse a reference and a shot for comparison: the shot is centre-cropped to
 * the reference's aspect ratio first, so both grids cover the same shape of
 * frame (see `centerCropRect`). Either side is null when it can't be decoded.
 */
export async function analyzeImagePair(
  referenceUri: string,
  shotUri: string
): Promise<[SceneAnalysis | null, SceneAnalysis | null]> {
  const [reference, shot] = await Promise.all([decode(referenceUri), decode(shotUri)]);
  if (!reference || !shot) {
    return [reference ? sample(reference, fullRect(reference)) : null, null];
  }
  const aspect = reference.width() / reference.height();
  return [
    sample(reference, fullRect(reference)),
    sample(shot, centerCropRect(shot.width(), shot.height(), aspect)),
  ];
}
