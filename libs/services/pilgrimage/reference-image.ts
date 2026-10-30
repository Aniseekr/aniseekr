import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import {
  ImageManipulator,
  SaveFormat,
  type ImageManipulatorContext,
  type ImageRef,
} from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { loadAllCapturesSync } from './captures';
import { referenceResize } from './reference-image-policy';

export type ImportReferenceResult = { status: 'cancelled' } | { status: 'ok'; uri: string };

const REFERENCE_DIR = 'pilgrimage-references';
const LIBRARY_IMPORT_DIR = 'pilgrimage-imports';

// The system photo picker runs out of process and hands back only what the
// user picked, so neither import asks for library permission.
async function pickOneImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return null;
  return picked.assets[0];
}

function appDirectory(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

async function measure(uri: string): Promise<{ width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  const image = await context.renderAsync();
  const size = { width: image.width, height: image.height };
  image.release();
  context.release();
  return size;
}

/**
 * Let the user pick a reference image from their library and keep a normalised
 * copy (JPEG, ≤1920px) in the documents directory — the Journal shows it next to
 * the shot long after this session, so it can't live in the cache. The result
 * is a `file://` URI: bare paths would be mistaken for Anitabi image paths.
 */
export async function importReferenceImage(): Promise<ImportReferenceResult> {
  const asset = await pickOneImage();
  if (!asset) return { status: 'cancelled' };

  // The picker reports the size; only decode to measure when it doesn't.
  const size =
    asset.width > 0 && asset.height > 0
      ? { width: asset.width, height: asset.height }
      : await measure(asset.uri);
  const resize = referenceResize(size.width, size.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (resize) context.resize(resize);
  let image: ImageRef | null = null;
  let fix: ImageManipulatorContext | null = null;
  try {
    image = await context.renderAsync();
    // The picker may report pre-rotation dimensions (EXIF-rotated images); the
    // render is upright, so re-check the real longest edge once.
    const again = referenceResize(image.width, image.height);
    if (again) {
      fix = ImageManipulator.manipulate(image).resize(again);
      const fixed = await fix.renderAsync();
      image.release();
      image = fixed;
    }
    const saved = await image.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
    const dest = new File(appDirectory(REFERENCE_DIR), `${Crypto.randomUUID()}.jpg`);
    new File(saved.uri).move(dest);
    return { status: 'ok', uri: dest.uri };
  } finally {
    image?.release();
    fix?.release();
    context.release();
  }
}

export type ImportLibraryPhotoResult = { status: 'cancelled' } | { status: 'ok'; uri: string };

/**
 * Import a photo from the library as a capture of the user's own (kept at
 * original quality — unlike a reference, it is the shot itself). Copied into
 * the documents directory so the Journal can still show it after the picker's
 * temporary file is gone.
 */
export async function importLibraryPhoto(): Promise<ImportLibraryPhotoResult> {
  const asset = await pickOneImage();
  if (!asset) return { status: 'cancelled' };

  const source = new File(asset.uri);
  const extension = source.extension || '.jpg';
  const dest = new File(appDirectory(LIBRARY_IMPORT_DIR), `${Crypto.randomUUID()}${extension}`);
  source.copy(dest);
  return { status: 'ok', uri: dest.uri };
}

function isAppCopy(uri: string, dir: string): boolean {
  return uri.startsWith('file://') && uri.includes(`/${dir}/`);
}

function deleteQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('[reference] could not delete', error);
  }
}

/**
 * Delete an imported reference copy once no capture compares against it. Only
 * files this module wrote are touched; anything else is left alone.
 */
export function releaseImportedReference(uri: string): void {
  if (!isAppCopy(uri, REFERENCE_DIR)) return;
  if (loadAllCapturesSync().some((capture) => capture.referenceUri === uri)) return;
  deleteQuietly(uri);
}

/** Delete the app's copy of a library-imported photo once its record is gone. */
export function releaseImportedPhoto(uri: string): void {
  if (!isAppCopy(uri, LIBRARY_IMPORT_DIR)) return;
  if (loadAllCapturesSync().some((capture) => capture.uri === uri)) return;
  deleteQuietly(uri);
}
