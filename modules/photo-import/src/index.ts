import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** One photo copied into the app, with what its own file says about it. */
export interface NativeImportedPhoto {
  /** file:// copy in the app's documents directory. */
  uri: string;
  latitude: number | null;
  longitude: number | null;
  /** EXIF DateTimeOriginal (epoch ms), null when the file has none. */
  takenAt: number | null;
  /** The document's last-modified time (epoch ms), null when unknown. */
  modifiedAt: number | null;
  /** Whether the unredacted original was read (GPS can only come from it). */
  originalAccess: boolean;
}

interface NativePhotoImportModule {
  pickPhotos(max: number): Promise<NativeImportedPhoto[]>;
}

function nativeModule(): NativePhotoImportModule | null {
  if (Platform.OS !== 'android') return null;
  return requireOptionalNativeModule<NativePhotoImportModule>('AniseekrPhotoImport');
}

/** Whether this build has the Android importer (old dev clients do not). */
export function isNativePhotoImportAvailable(): boolean {
  return nativeModule() !== null;
}

/** Open the document picker. Resolves [] on cancel; null when unavailable. */
export async function pickPhotosWithPlace(max: number): Promise<NativeImportedPhoto[] | null> {
  const module = nativeModule();
  if (!module) return null;
  return module.pickPhotos(max);
}
