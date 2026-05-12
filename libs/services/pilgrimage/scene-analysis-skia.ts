// Skia loader for scene analysis. Kept separate from scene-analysis.ts so the
// pure inference functions (and their unit tests) don't transitively import
// react-native through @shopify/react-native-skia.

import {
  AlphaType,
  ColorType,
  Skia,
} from '@shopify/react-native-skia';
import { reducePixels, type SceneAnalysis } from './scene-analysis';

const SAMPLE_W = 64;
const SAMPLE_H = 64;

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
