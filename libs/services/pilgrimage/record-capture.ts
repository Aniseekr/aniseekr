// 紀錄 mode filing: where a freshly taken (or imported) photo goes in the
// journal. One rule for the camera and the photo import, so a shot is filed
// the same way however it arrived:
//   1. the spot the camera was opened for, else
//   2. the nearest Atlas spot within range of where the photo was taken, else
//   3. the free bucket.
// Rule 8: only a real spot match is attached; no location means no match.
import { recordCapture, recordFreeCapture, type CaptureGeoLocation } from './captures';
import { findNearestCachedSpot } from './nearest-cached-spot';
import { getPilgrimageSpotTitles } from './pilgrimage-localization';

export interface RecordTarget {
  spotId: string;
  spotName: string | null;
  ep: number | null;
  animeTitle: string | null;
  animeId: number | null;
  animeColor: string;
  spotGeo: [number, number] | null;
}

export interface RecordedPhoto {
  uri: string;
  capturedAt: number;
  source: 'camera' | 'auto' | 'library';
  heading?: number | null;
  location: CaptureGeoLocation | null;
}

export interface FiledResult {
  /** Display name of the spot it was filed under; null for a free shot. */
  spotName: string | null;
  spotId: string | null;
  /** Atlas work of a spot matched by place; null when filed to the target or free. */
  workKey: string | null;
}

export async function fileRecordedPhoto(
  photo: RecordedPhoto,
  target: RecordTarget | null
): Promise<FiledResult> {
  const base = {
    uri: photo.uri,
    capturedAt: photo.capturedAt,
    source: photo.source,
    ...(photo.heading != null ? { heading: photo.heading } : {}),
    ...(photo.location
      ? { userLocation: { latitude: photo.location.latitude, longitude: photo.location.longitude } }
      : {}),
  };

  if (target) {
    await recordCapture({
      ...base,
      spotId: target.spotId,
      ...(target.spotName ? { spotName: target.spotName } : {}),
      ...(target.ep != null ? { spotEp: target.ep } : {}),
      ...(target.animeTitle ? { animeTitle: target.animeTitle } : {}),
      ...(target.animeId != null ? { animeId: target.animeId } : {}),
      animeColor: target.animeColor,
      ...(target.spotGeo ? { spotGeo: target.spotGeo } : {}),
    });
    return { spotName: target.spotName, spotId: target.spotId, workKey: null };
  }

  const near = photo.location ? await findNearestCachedSpot(photo.location) : null;
  if (near) {
    await recordCapture({
      ...base,
      spotId: near.spot.id,
      spotName: near.spot.name,
      workKey: near.workKey,
      ...(near.spot.lat !== null && near.spot.lon !== null
        ? { spotGeo: [near.spot.lat, near.spot.lon] as [number, number] }
        : {}),
    });
    return {
      spotName: getPilgrimageSpotTitles(near.spot).primary,
      spotId: near.spot.id,
      workKey: near.workKey,
    };
  }

  await recordFreeCapture({
    ...base,
    spotId: `free-${photo.capturedAt}-${Math.round(Math.random() * 1e6)}`,
  });
  return { spotName: null, spotId: null, workKey: null };
}

// EXIF embedding rewrites the JPEG (~1 s for a 4K shot in JS). 紀錄 mode files
// the shot and frees the shutter first; anything that copies the file out
// (camera roll) waits for its rewrite to finish.
const metadataJobs = new Map<string, Promise<void>>();

export function trackMetadataJob(uri: string, job: Promise<void>): void {
  const tracked = job.finally(() => {
    if (metadataJobs.get(uri) === tracked) metadataJobs.delete(uri);
  });
  metadataJobs.set(uri, tracked);
}

export function metadataReady(uri: string): Promise<void> {
  return metadataJobs.get(uri) ?? Promise.resolve();
}
