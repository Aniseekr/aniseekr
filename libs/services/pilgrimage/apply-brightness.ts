// Post-capture brightness baking. expo-camera v17 has no exposure control, so
// `useBrightnessPreview` produces a Skia ColorMatrix that we apply to the
// captured frame on disk — that's what makes the exposure tool's brightness
// REAL instead of a preview-only overlay. The shutter callback awaits this
// function, then the rest of the app (preview screen, share card, gallery)
// consumes the new URI as if it were the original photo.
//
// Two input paths:
//   - `inputUri`    — the classic shape; the caller already has a file URI
//                     (e.g. from `takePictureAsync()`).
//   - `pictureRef`  — the new `expo-camera@17.1+` shape, where the caller
//                     captured to a `PictureRef` (no disk write yet) and lets
//                     us persist via `savePictureAsync()`. Saving inside this
//                     function keeps the Skia pipeline single-threaded with
//                     the file write and means callers don't have to know
//                     about cache paths.
//
// EXIF preservation: when EV != 0 we re-encode the JPEG through Skia, which
// drops the APP1/EXIF segment that expo-camera's native writer embedded. To
// preserve GPS, anime title, scene name, and the Aniseekr UserComment, the
// caller passes the `exif` object it got back from `takePictureAsync` /
// `PictureRef.savePictureAsync` and we splice it back in via `embedExifIntoJpegFile`.
// If the embed throws we log and return the brightness-baked URI WITHOUT exif —
// worst case the photo survives, just without metadata (Rule 8: never fabricate).
//
// Identity short-circuit: when EV = 0 the user wants the unmodified photo.
// `useBrightnessPreview` builds the diagonal-1 matrix (R/G/B scale = 2^0 = 1).
// Re-encoding through JPEG would double-compress the original without changing
// a pixel, so we detect identity and return the input URI unchanged. For the
// PictureRef path the "input URI" is the path produced by `savePictureAsync`,
// because the native ref isn't directly readable by Skia. The identity path
// also implicitly preserves EXIF because we return the original URI — no
// re-encode, no embed needed.
//
// On error (decode fail, surface fail, encode fail, write fail) we log and
// fall back to the best URI we have:
//   1. the original `inputUri` if it was provided;
//   2. the URI produced by `savePictureAsync()` if we got that far on the
//      PictureRef path.
// We NEVER fabricate a path — CLAUDE.md Rule 8.

import { Skia, ImageFormat } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import type { PictureRef } from 'expo-camera';
import { embedExifIntoJpegFile } from '../../utils/exif-embed';
import { resolveCapturedUri } from './camera-capture';

export interface ApplyBrightnessInput {
  /** Path-on-disk input. Mutually exclusive with `pictureRef`; if both are set, `pictureRef` wins. */
  inputUri?: string;
  /** Native picture ref from `takePictureAsync({ pictureRef: true })`. Saved to cache before decode. */
  pictureRef?: PictureRef;
  colorMatrix: number[] | null | undefined;
  quality?: number;
  /**
   * EXIF metadata to re-embed into the brightness-baked JPEG. Pass the `exif`
   * field from `takePictureAsync({ exif: true })`, or the app EXIF metadata
   * that was written through `PictureRef.savePictureAsync({ metadata })`.
   * Only used on the non-identity re-encode path; the identity path returns
   * the source URI untouched. Failure to embed is logged and ignored.
   */
  exif?: Record<string, unknown> | null;
}

export interface ApplyBrightnessResult {
  uri: string;
  width: number;
  height: number;
}

const DEFAULT_QUALITY = 0.92;

// Indices 0, 6, 12, 18 are the R, G, B, A diagonal scale factors. When all
// four are exactly 1 the matrix is the identity transform and re-encoding
// would just be a lossy round-trip.
function isIdentityMatrix(m: number[] | null | undefined): boolean {
  if (!m || m.length !== 20) return true;
  return m[0] === 1 && m[6] === 1 && m[12] === 1 && m[18] === 1;
}

export async function applyBrightnessToImage(
  input: ApplyBrightnessInput
): Promise<ApplyBrightnessResult> {
  const { pictureRef, inputUri: rawInputUri, colorMatrix, exif } = input;
  const quality = input.quality ?? DEFAULT_QUALITY;

  if (!pictureRef && !rawInputUri) {
    throw new Error('applyBrightnessToImage requires either inputUri or pictureRef');
  }

  // Resolve to a concrete on-disk URI. If a PictureRef was supplied we ask
  // expo-camera to persist it; that URI also becomes our error-fallback.
  let resolvedUri: string;
  let pictureRefSavedUri: string | null = null;
  if (pictureRef) {
    try {
      const saved = await pictureRef.savePictureAsync({
        quality,
        ...(exif ? { metadata: exif } : {}),
      });
      const savedUri = resolveCapturedUri(saved);
      if (!savedUri) throw new Error('PictureRef.savePictureAsync returned no uri/url');
      pictureRefSavedUri = savedUri;
      resolvedUri = savedUri;
    } catch (error) {
      console.warn('[applyBrightnessToImage] PictureRef.savePictureAsync failed', error);
      // If we also have an inputUri we can still try Skia on that path; otherwise rethrow.
      if (rawInputUri) {
        resolvedUri = rawInputUri;
      } else {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  } else {
    // Non-null asserted because the (!pictureRef && !rawInputUri) guard ran.
    resolvedUri = rawInputUri as string;
  }

  const identity = isIdentityMatrix(colorMatrix);

  // Decode is required either way: identity callers still need width/height
  // for the preview layout, and non-identity needs the image to draw.
  let skImage: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
  try {
    const data = await Skia.Data.fromURI(resolvedUri);
    if (!data) throw new Error('Failed to load image data');

    skImage = Skia.Image.MakeImageFromEncoded(data);
    if (!skImage) throw new Error('Failed to decode image');

    const width = skImage.width();
    const height = skImage.height();
    if (!width || !height) throw new Error('Image has zero dimensions');

    if (identity) {
      return { uri: resolvedUri, width, height };
    }

    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) throw new Error('Failed to allocate Skia surface');

    let paint: ReturnType<typeof Skia.Paint> | null = null;
    let snapshot: ReturnType<typeof surface.makeImageSnapshot> | null = null;
    try {
      const filter = Skia.ColorFilter.MakeMatrix(colorMatrix as number[]);
      paint = Skia.Paint();
      paint.setColorFilter(filter);

      surface.getCanvas().drawImage(skImage, 0, 0, paint);
      surface.flush();

      snapshot = surface.makeImageSnapshot();
      const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
      if (!jpegBytes || jpegBytes.length === 0) {
        throw new Error('Encoded JPEG was empty');
      }

      const filename = `brightness-${Date.now()}.jpg`;
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(jpegBytes);

      // Re-embed EXIF onto the freshly-encoded JPEG. Skia drops the APP1
      // chunk during re-encode, so without this step GPS / anime metadata /
      // Aniseekr UserComment are lost whenever EV != 0. Failure is non-fatal:
      // log and return the URI without metadata rather than fabricate (Rule 8).
      if (exif && typeof exif === 'object') {
        try {
          await embedExifIntoJpegFile(file.uri, exif);
        } catch (embedError) {
          console.warn('[applyBrightnessToImage] EXIF embed failed', embedError);
        }
      }

      return { uri: file.uri, width, height };
    } finally {
      snapshot?.dispose();
      paint?.dispose();
      surface.dispose();
    }
  } catch (error) {
    console.warn('[applyBrightnessToImage]', error);
    const fallbackWidth = skImage?.width() ?? 0;
    const fallbackHeight = skImage?.height() ?? 0;
    // Prefer the originally-supplied URI; otherwise the URI we saved from the
    // PictureRef. Never fabricate.
    const fallbackUri = rawInputUri ?? pictureRefSavedUri ?? resolvedUri;
    return { uri: fallbackUri, width: fallbackWidth, height: fallbackHeight };
  } finally {
    skImage?.dispose();
  }
}
