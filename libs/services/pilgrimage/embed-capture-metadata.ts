// Post-capture EXIF embed step.
//
// Background: expo-camera previously embedded our `additionalExif` payload
// (anime title, scene name, Aniseekr UserComment, live GPS / heading / tilt)
// natively at the moment of takePictureAsync. VisionCamera's `capturePhoto`
// has no equivalent option, so the embed now happens here on the JS side via
// piexif-ts — applied to every saved JPEG, single / burst / HDR alike.
//
// Failure is non-fatal (Rule 8: we never fabricate EXIF or fail the whole
// capture over metadata). On any error we log and leave the photo untouched.
import { embedExifIntoJpegFile, type ExifInput } from '../../utils/exif-embed';

/**
 * Embeds the given EXIF record into the JPEG at `uri` (a `file://` URI).
 *
 * `embedExifIntoJpegFile` instantiates `new File(uri)` from the modern
 * `expo-file-system` package, which requires an absolute URI — passing a
 * raw `/data/...` path throws `URI is not absolute`. The prior strip-and-
 * call comment described the older legacy-FileSystem behaviour; the
 * underlying API has since moved to the URI-only signature, so we forward
 * `uri` as-is. The only normalisation we still need is to ensure the
 * `file://` scheme is present when callers hand us a raw path (rare —
 * `EnginePhoto.uri` is always a URI — but defensive).
 *
 * Returns silently on success or failure — the original file is preserved
 * in both cases.
 */
export async function embedCaptureMetadata(
  uri: string | null | undefined,
  exif: ExifInput | null | undefined
): Promise<void> {
  if (!uri) return;
  if (!exif || typeof exif !== 'object') return;
  const absoluteUri = uri.startsWith('file://')
    ? uri
    : uri.startsWith('/')
      ? `file://${uri}`
      : uri;
  try {
    await embedExifIntoJpegFile(absoluteUri, exif);
  } catch (error) {
    console.warn('[embedCaptureMetadata] failed', error);
  }
}
