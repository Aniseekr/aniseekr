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
import { findNearestCachedSpot } from './nearest-cached-spot';
import { pilgrimageRepository } from './pilgrimage-repository';
import { getPilgrimageAnimeTitles, getPilgrimageSpotTitles } from './pilgrimage-localization';
import { fileRecordedPhoto } from './record-capture';

const IMPORT_DIR = 'pilgrimage-imports';
export const MAX_IMPORT_PHOTOS = 50;

export interface PickedPhoto {
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
async function pickWithImagePicker(max: number): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: max > 1,
    selectionLimit: max,
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

async function pickPhotos(max: number): Promise<PickedPhoto[]> {
  if (Platform.OS === 'android') {
    await askMediaLocation();
    const native = await pickPhotosWithPlace(max);
    if (native) return native;
  }
  return pickWithImagePicker(max);
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

export interface ImportPlanMatch {
  spotId: string;
  spotName: string;
  workKey: string;
  workTitle: string;
}

/** One picked photo, read and matched but not saved yet. */
export interface ImportPlanItem {
  uri: string;
  capturedAt: number;
  /** Whether the time came from the photo itself (EXIF) rather than its file. */
  timeFromPhoto: boolean;
  location: { latitude: number; longitude: number } | null;
  /** Same time and place as a photo already in the journal. */
  duplicate: boolean;
  /** The Atlas spot this photo was taken at; null when none is in range. */
  match: ImportPlanMatch | null;
}

/** Open the picker. One photo for a free import, many for Pro. */
export async function pickImportPhotos(max: number): Promise<PickedPhoto[]> {
  return pickPhotos(Math.max(1, Math.min(MAX_IMPORT_PHOTOS, max)));
}

/**
 * Read where and when each photo was taken and which spot it lands on, without
 * saving anything. A photo without a capture time is dated by its file's
 * modified time, else the moment of import — the timeline needs a time.
 */
export async function planPhotoImport(picked: readonly PickedPhoto[]): Promise<ImportPlanItem[]> {
  const existing = loadAllCapturesSync().filter((c) => c.source === 'library');
  const index = await pilgrimageRepository.getWorksIndex().catch(() => []);
  const now = Date.now();
  const items: ImportPlanItem[] = [];
  for (const photo of picked) {
    const capturedAt = photo.takenAt ?? photo.modifiedAt ?? now;
    const location =
      photo.latitude !== null && photo.longitude !== null
        ? { latitude: photo.latitude, longitude: photo.longitude }
        : null;
    const near = location ? await findNearestCachedSpot(location) : null;
    const work = near ? index.find((w) => w.key === near.workKey) : undefined;
    items.push({
      uri: photo.uri,
      capturedAt,
      timeFromPhoto: photo.takenAt !== null,
      location,
      duplicate: existing.some((c) => sameShot(c, photo, capturedAt)),
      match: near
        ? {
            spotId: near.spot.id,
            spotName: getPilgrimageSpotTitles(near.spot).primary,
            workKey: near.workKey,
            workTitle: work ? getPilgrimageAnimeTitles(work).primary : near.workKey,
          }
        : null,
    });
  }
  return items;
}

/** Drop the app's copies of photos that will not be saved. */
export function discardImportPlan(items: readonly ImportPlanItem[]): void {
  for (const item of items) deleteCopy(item.uri);
}

/**
 * Save the chosen photos to the journal (filed the same way as a 紀錄 shot) and
 * drop the rest. Duplicates are never saved twice.
 */
export async function commitPhotoImport(
  items: readonly ImportPlanItem[],
  keep: (item: ImportPlanItem) => boolean = () => true
): Promise<PhotoImportSummary> {
  const byWork = new Map<string, ImportedWork>();
  const summary: PhotoImportSummary = {
    imported: 0,
    matched: 0,
    noPlace: 0,
    duplicates: 0,
    works: [],
  };
  for (const item of items) {
    if (item.duplicate) {
      summary.duplicates += 1;
      deleteCopy(item.uri);
      continue;
    }
    if (!keep(item)) {
      deleteCopy(item.uri);
      continue;
    }
    const filed = await fileRecordedPhoto(
      { uri: item.uri, capturedAt: item.capturedAt, source: 'library', location: item.location },
      null
    );
    summary.imported += 1;
    if (!item.location) summary.noPlace += 1;
    if (filed.spotId && filed.workKey) {
      summary.matched += 1;
      const title =
        item.match?.workKey === filed.workKey ? item.match.workTitle : filed.workKey;
      const work = byWork.get(filed.workKey) ?? {
        workKey: filed.workKey,
        title,
        photos: 0,
        spotNames: [],
      };
      work.photos += 1;
      if (filed.spotName && !work.spotNames.includes(filed.spotName)) {
        work.spotNames.push(filed.spotName);
      }
      byWork.set(filed.workKey, work);
    }
  }
  summary.works = [...byWork.values()].sort((a, b) => b.photos - a.photos);
  return summary;
}

/** Pick, match and save in one go (the free single-photo import). Null on cancel. */
export async function importTripPhotos(max = 1): Promise<PhotoImportSummary | null> {
  const picked = await pickImportPhotos(max);
  if (picked.length === 0) return null;
  return commitPhotoImport(await planPhotoImport(picked));
}
