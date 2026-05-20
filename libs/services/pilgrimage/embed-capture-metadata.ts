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
 * Embeds the given EXIF record into the JPEG at `uri` (a `file://` URI). Strips
 * the `file://` prefix because `embedExifIntoJpegFile` operates on filesystem
 * paths via `expo-file-system`.
 *
 * Returns silently on success or failure — the original file is preserved in
 * both cases.
 */
export async function embedCaptureMetadata(
  uri: string | null | undefined,
  exif: ExifInput | null | undefined
): Promise<void> {
  if (!uri) return;
  if (!exif || typeof exif !== 'object') return;
  const path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    await embedExifIntoJpegFile(path, exif);
  } catch (error) {
    console.warn('[embedCaptureMetadata] failed', error);
  }
}
