import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { referenceResize } from './reference-image-policy';

export type ImportReferenceResult =
  { status: 'cancelled' } | { status: 'denied' } | { status: 'ok'; uri: string };

const REFERENCE_DIR = 'pilgrimage-references';

/**
 * Let the user pick a reference image from their library and keep a normalised
 * copy (JPEG, ≤1920px) in the documents directory — the Journal shows it next to
 * the shot long after this session, so it can't live in the cache. The result
 * is a `file://` URI: bare paths would be mistaken for Anitabi image paths.
 */
export async function importReferenceImage(): Promise<ImportReferenceResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'cancelled' };

  const source = await ImageManipulator.manipulate(picked.assets[0].uri).renderAsync();
  const resize = referenceResize(source.width, source.height);
  const rendered = resize
    ? await ImageManipulator.manipulate(source).resize(resize).renderAsync()
    : source;
  const saved = await rendered.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });

  const dir = new Directory(Paths.document, REFERENCE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${Crypto.randomUUID()}.jpg`);
  new File(saved.uri).move(dest);
  return { status: 'ok', uri: dest.uri };
}

export type ImportLibraryPhotoResult =
  { status: 'cancelled' } | { status: 'denied' } | { status: 'ok'; uri: string };

const LIBRARY_IMPORT_DIR = 'pilgrimage-imports';

/**
 * Import a photo from the library as a capture of the user's own (kept at
 * original quality — unlike a reference, it is the shot itself). Copied into
 * the documents directory so the Journal can still show it after the picker's
 * temporary file is gone.
 */
export async function importLibraryPhoto(): Promise<ImportLibraryPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'cancelled' };

  const dir = new Directory(Paths.document, LIBRARY_IMPORT_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const source = new File(picked.assets[0].uri);
  const extension = source.extension || '.jpg';
  const dest = new File(dir, `${Crypto.randomUUID()}${extension}`);
  source.copy(dest);
  return { status: 'ok', uri: dest.uri };
}
