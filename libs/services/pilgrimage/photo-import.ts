// Import trip photos into the journal: pick several, read where and when each
// was taken, and file it the same way a 紀錄 shot is filed (nearest Atlas spot
// within range, else the free bucket). The summary says what matched which
// work — the "these photos are from 冰菓" moment of the import story.
import { Platform, PermissionsAndroid } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { pickPhotosWithPlace } from '../../../modules/photo-import/src';
import { loadAllCapturesSync } from './captures';
import { readPhotoPlaceTime } from './photo-exif';
import { pilgrimageRepository } from './pilgrimage-repository';
import { getPilgrimageAnimeTitles } from './pilgrimage-localization';
import { fileRecordedPhoto } from './record-capture';

const IMPORT_DIR = 'pilgrimage-imports';
export const MAX_IMPORT_PHOTOS = 50;

interface PickedPhoto {
  uri: string;
  latitude: number | null;
  longitude: number | null;
  /** When the photo was taken; null when its file does not say. */
  takenAt: number | null;
  modifiedAt: number | null;
}

export interface ImportedWork {
  workKey: string;
  title: string;
  photos: number;
  spotNames: string[];
}

export interface PhotoImportSummary {
  imported: number;
  /** Photos that landed on an Atlas spot. */
  matched: number;
  /** Photos whose file carries no location. */
  noPlace: number;
  /** Already in the journal (same time and place), skipped. */
  duplicates: number;
  works: ImportedWork[];
}

async function askMediaLocation(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 29) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION);
  } catch {
    // Without it the photos still import, just without their place.
  }
}

function importDirectory(): Directory {
  const dir = new Directory(Paths.document, IMPORT_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** iOS (and Android builds without the native importer): the system picker. */
async function pickWithImagePicker(): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMPORT_PHOTOS,
    exif: true,
    quality: 1,
  });
  if (result.canceled) return [];
  const dir = importDirectory();
  return result.assets.map((asset) => {
    const source = new File(asset.uri);
    const dest = new File(dir, `${Crypto.randomUUID()}${source.extension || '.jpg'}`);
    source.copy(dest);
    const place = readPhotoPlaceTime(asset.exif);
    return { uri: dest.uri, ...place, modifiedAt: null };
  });
}

async function pickPhotos(): Promise<PickedPhoto[]> {
  if (Platform.OS === 'android') {
    await askMediaLocation();
    const native = await pickPhotosWithPlace(MAX_IMPORT_PHOTOS);
    if (native) return native;
  }
  return pickWithImagePicker();
}

function deleteCopy(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A leftover copy only costs disk space.
  }
}

function sameShot(
  a: { capturedAt: number; userLocation?: { latitude: number; longitude: number } },
  photo: PickedPhoto,
  capturedAt: number
): boolean {
  if (a.capturedAt !== capturedAt) return false;
  if (!a.userLocation || photo.latitude === null || photo.longitude === null) {
    return !a.userLocation && photo.latitude === null;
  }
  return (
    Math.abs(a.userLocation.latitude - photo.latitude) < 1e-6 &&
    Math.abs(a.userLocation.longitude - photo.longitude) < 1e-6
  );
}

/**
 * Pick photos and file them. Resolves null when the user cancelled.
 * A photo without a capture time is dated by its file's modified time, else
 * the moment of import — the journal's timeline needs a time to place it.
 */
export async function importTripPhotos(): Promise<PhotoImportSummary | null> {
  const picked = await pickPhotos();
  if (picked.length === 0) return null;

  const existing = loadAllCapturesSync().filter((c) => c.source === 'library');
  const byWork = new Map<string, { photos: number; spotNames: Set<string> }>();
  const summary: PhotoImportSummary = {
    imported: 0,
    matched: 0,
    noPlace: 0,
    duplicates: 0,
    works: [],
  };

  const now = Date.now();
  for (const photo of picked) {
    const capturedAt = photo.takenAt ?? photo.modifiedAt ?? now;
    if (existing.some((c) => sameShot(c, photo, capturedAt))) {
      summary.duplicates += 1;
      deleteCopy(photo.uri);
      continue;
    }
    const location =
      photo.latitude !== null && photo.longitude !== null
        ? { latitude: photo.latitude, longitude: photo.longitude }
        : null;
    const filed = await fileRecordedPhoto(
      { uri: photo.uri, capturedAt, source: 'library', location },
      null
    );
    summary.imported += 1;
    if (!location) summary.noPlace += 1;
    if (filed.spotId && filed.workKey) {
      summary.matched += 1;
      const work = byWork.get(filed.workKey) ?? { photos: 0, spotNames: new Set<string>() };
      work.photos += 1;
      if (filed.spotName) work.spotNames.add(filed.spotName);
      byWork.set(filed.workKey, work);
    }
  }

  if (byWork.size > 0) {
    const index = await pilgrimageRepository.getWorksIndex().catch(() => []);
    for (const [workKey, work] of byWork) {
      const entry = index.find((w) => w.key === workKey);
      summary.works.push({
        workKey,
        title: entry ? getPilgrimageAnimeTitles(entry).primary : workKey,
        photos: work.photos,
        spotNames: [...work.spotNames],
      });
    }
    summary.works.sort((a, b) => b.photos - a.photos);
  }
  return summary;
}
