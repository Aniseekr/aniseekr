// Wiring between the compare preview and the capture index.
//
// The preview is opened from two places — the compare camera right after a
// shot, and the Journal for a shot that is already filed — and it may re-pair
// a shot with another reference. These builders keep every entry point on the
// same params, and turn "this shot against this reference" into exactly one
// capture record (see `recordCapture` / `recordFreeCapture` for the merge).

import { albumFallbackAnimeTitle, type PilgrimageAlbumEntry } from './album-captures';
import { capturedOnWideAngle } from './capture-lens-gate';
import { sanitizeCaptureNote, type CaptureSessionShot } from './capture-session';
import type { PilgrimageCapture, SensorSnapshot } from './captures';
import { getPilgrimageAnimeTitles, getPilgrimageSpotTitles } from './pilgrimage-localization';
import { resolveCaptureBucket, type CompareRouteParams } from './reference-route';
import { resolveTargetLocation } from './target-location';
import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';

export type PreviewParams = Record<string, string>;

/** Who opened the preview. A Journal shot is already filed; a camera shot is new. */
export type PreviewOrigin = 'camera' | 'journal';

function numberParam(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? String(value) : '';
}

function hasRealGeo(geo: readonly number[] | undefined): geo is [number, number] {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function referenceParams(reference: CompareRouteParams): PreviewParams {
  return {
    spotId: reference.spotId,
    imageUrl: reference.imageUrl,
    name: reference.name,
    ep: reference.ep,
    animeId: reference.animeId,
    animeTitle: reference.animeTitle,
    themeColor: reference.themeColor,
    spotLat: reference.spotLat ?? '',
    spotLng: reference.spotLng ?? '',
    ...(reference.sceneOrigin ? { sceneOrigin: reference.sceneOrigin } : {}),
    ...(reference.sceneOriginURL ? { sceneOriginURL: reference.sceneOriginURL } : {}),
    ...(reference.referenceKind ? { referenceKind: reference.referenceKind } : {}),
  };
}

/**
 * Camera → preview. The shot's own shutter-time fields plus the camera
 * session's reference — including `referenceKind`, without which a shot taken
 * against an imported reference would be filed under its synthetic spot id.
 * `reference.name` must be the real scene name or '' (never a display fallback:
 * it is persisted as the spot name).
 */
export function buildCameraPreviewParams(
  shot: CaptureSessionShot,
  reference: CompareRouteParams
): PreviewParams {
  return {
    ...referenceParams(reference),
    origin: 'camera',
    shotUri: shot.uri,
    shotWidth: String(shot.width),
    shotHeight: String(shot.height),
    capturedAt: String(shot.createdAt),
    heading: numberParam(shot.heading),
    distanceMeters: numberParam(shot.distanceMeters),
    headingDeltaDeg: numberParam(shot.headingDeltaDeg),
    tilt: numberParam(shot.tilt),
    captureMode: shot.captureMode,
    shotSource: shot.source,
    userLat: numberParam(shot.userLocation?.latitude),
    userLng: numberParam(shot.userLocation?.longitude),
    note: shot.note ?? '',
    burstTotal: numberParam(shot.burstTotal),
    burstUris: shot.burstUris ? JSON.stringify(shot.burstUris) : '',
    burstBestIndex: numberParam(shot.burstBestIndex),
  };
}

/**
 * Journal → preview for a shot that is already filed. Carries everything the
 * record knows about the photo so the preview shows the real shutter-time
 * sensors; the record itself is merged, never replaced, on later saves.
 */
export function buildJournalPreviewParams(
  entry: PilgrimageAlbumEntry,
  ctx: { importedLabel: string; fallbackColor: string }
): PreviewParams {
  const { capture } = entry;
  const snapshot = capture.sensorSnapshot;
  const shot: PreviewParams = {
    origin: 'journal',
    shotUri: capture.uri,
    // Unknown here; the preview decodes the real dimensions.
    shotWidth: '0',
    shotHeight: '0',
    capturedAt: String(capture.capturedAt),
    heading: numberParam(capture.heading),
    distanceMeters: numberParam(snapshot?.distanceMeters),
    headingDeltaDeg: numberParam(snapshot?.headingDeltaDeg),
    tilt: numberParam(snapshot?.tilt),
    shotSource:
      capture.source === 'library' ? 'library' : capture.source === 'auto' ? 'auto' : 'manual',
    userLat: numberParam(capture.userLocation?.latitude),
    userLng: numberParam(capture.userLocation?.longitude),
    note: capture.note ?? '',
  };

  if (entry.isFree) {
    const referenceUri = capture.referenceUri;
    return {
      ...shot,
      spotId: capture.spotId,
      imageUrl: referenceUri ?? '',
      name: referenceUri ? ctx.importedLabel : '',
      ep: '',
      animeId: '',
      animeTitle: '',
      themeColor: ctx.fallbackColor,
      ...(referenceUri ? { referenceKind: 'imported' } : {}),
    };
  }

  const { spot, anime } = entry;
  // Display fallbacks (`Bangumi #id`, episode 0 for "unknown") must not travel:
  // the preview persists what it is given.
  const animeTitle = getPilgrimageAnimeTitles(anime).primary;
  const ep = capture.spotEp ?? (spot.ep > 0 ? spot.ep : null);
  return {
    ...shot,
    spotId: spot.id,
    imageUrl: spot.image,
    name: getPilgrimageSpotTitles(spot).primary,
    ep: ep != null ? String(ep) : '',
    animeId: String(anime.id),
    animeTitle: animeTitle === albumFallbackAnimeTitle(anime.id) ? '' : animeTitle,
    themeColor: anime.color || ctx.fallbackColor,
    ...(hasRealGeo(spot.geo) ? { spotLat: String(spot.geo[0]), spotLng: String(spot.geo[1]) } : {}),
    ...(spot.origin ? { sceneOrigin: spot.origin } : {}),
    ...(spot.originURL ? { sceneOriginURL: spot.originURL } : {}),
  };
}

/** The reference a preview compares against, parsed from its route params. */
export interface PreviewReference {
  spotId: string;
  /** Reference image ('' = a lone shot with nothing to compare against). */
  imageUrl: string;
  referenceKind: string | null;
  /** Real scene name only — never a display fallback. */
  sceneName: string | null;
  animeId: number | null;
  animeTitle: string | null;
  themeColor: string;
  ep: number | null;
  spotGeo?: [number, number];
}

export function previewReferenceFromParams(
  params: RouterParams,
  ctx: { fallbackColor: string; resolveImageUrl?: (url: string) => string }
): PreviewReference {
  const rawImage = getStringParam(params, 'imageUrl') ?? '';
  const target = resolveTargetLocation(
    getStringParam(params, 'spotLat'),
    getStringParam(params, 'spotLng')
  );
  return {
    spotId: getStringParam(params, 'spotId') ?? '',
    imageUrl: ctx.resolveImageUrl ? ctx.resolveImageUrl(rawImage) : rawImage,
    referenceKind: getStringParam(params, 'referenceKind'),
    sceneName: getStringParam(params, 'name'),
    animeId: getNumberParam(params, 'animeId'),
    animeTitle: getStringParam(params, 'animeTitle'),
    themeColor: getStringParam(params, 'themeColor') || ctx.fallbackColor,
    ep: getNumberParam(params, 'ep'),
    ...(target ? { spotGeo: [target.latitude, target.longitude] as [number, number] } : {}),
  };
}

/** Pull a shot's capture-time sensor snapshot, or null if it carries none. */
export function snapshotFromShot(shot: CaptureSessionShot | null): SensorSnapshot | null {
  if (!shot) return null;
  const { distanceMeters, headingDeltaDeg, tilt } = shot;
  if (distanceMeters == null && headingDeltaDeg == null && tilt == null) return null;
  return { distanceMeters, headingDeltaDeg, tilt };
}

/**
 * Distance and heading offset were measured against the reference the shot was
 * taken for. Paired with another reference they'd describe the wrong place.
 */
export function withoutTargetFields(shot: CaptureSessionShot): CaptureSessionShot {
  if (shot.distanceMeters == null && shot.headingDeltaDeg == null) return shot;
  return { ...shot, distanceMeters: null, headingDeltaDeg: null };
}

export interface PreviewFrameResult {
  total: number | null;
  valid: boolean;
  reason?: SensorSnapshot['frameReason'];
}

export interface PreviewCaptureRecord {
  bucket: 'spot' | 'free';
  capture: PilgrimageCapture;
}

/** True when `record` is already filed against `reference` (writing it won't move it). */
export function isFiledUnder(record: PilgrimageCapture, reference: PreviewReference): boolean {
  if (resolveCaptureBucket(reference) === 'spot') return record.spotId === reference.spotId;
  if (reference.referenceKind === 'imported') return record.referenceUri === reference.imageUrl;
  return !record.referenceUri && record.spotId === reference.spotId;
}

/**
 * The record for `shot` filed against `reference`.
 *
 * - `note`: a string is authoritative ('' clears it); `undefined` leaves the
 *   stored note alone (e.g. a non-focused shot saved alongside the focused one).
 * - `frame`: only a fresh, completed analysis is written. None yet, or a failed
 *   one (offline reference), leaves the stored frame match alone.
 * - Frame match and composite only count for wide-angle captures; other lenses
 *   compare different optics (`capture-lens-gate.ts`).
 */
export function buildPreviewCaptureRecord(input: {
  shot: CaptureSessionShot;
  reference: PreviewReference;
  frame?: PreviewFrameResult | null;
  compositeUri?: string;
  note?: string;
}): PreviewCaptureRecord {
  const { shot, reference } = input;
  const allowAnalysis = capturedOnWideAngle(shot);
  const frame =
    allowAnalysis && input.frame && input.frame.reason !== 'analysisFailed' ? input.frame : null;
  const compositeUri = allowAnalysis && reference.imageUrl ? input.compositeUri : undefined;
  const snap = snapshotFromShot(shot);
  const sensorSnapshot: SensorSnapshot | undefined = snap
    ? {
        ...snap,
        ...(frame
          ? { frameMatch: frame.total, frameValid: frame.valid, frameReason: frame.reason ?? null }
          : {}),
      }
    : undefined;
  const note = input.note === undefined ? undefined : (sanitizeCaptureNote(input.note) ?? '');
  const photo: PilgrimageCapture = {
    spotId: reference.spotId,
    uri: shot.uri,
    capturedAt: shot.createdAt,
    ...(compositeUri ? { compositeUri } : {}),
    ...(shot.heading != null ? { heading: shot.heading } : {}),
    ...(sensorSnapshot ? { sensorSnapshot } : {}),
    ...(shot.userLocation ? { userLocation: shot.userLocation } : {}),
    ...(note !== undefined ? { note } : {}),
    source: shot.source === 'library' ? 'library' : shot.source === 'auto' ? 'auto' : 'camera',
  };

  if (resolveCaptureBucket(reference) === 'free') {
    // No known scene behind this shot: the free bucket, with the imported
    // reference if there is one — never an orphaned synthetic spot.
    return {
      bucket: 'free',
      capture: {
        ...photo,
        ...(reference.referenceKind === 'imported' && reference.imageUrl
          ? { referenceUri: reference.imageUrl }
          : {}),
      },
    };
  }

  return {
    bucket: 'spot',
    capture: {
      ...photo,
      ...(reference.animeId != null ? { animeId: reference.animeId } : {}),
      ...(reference.animeTitle ? { animeTitle: reference.animeTitle } : {}),
      animeColor: reference.themeColor,
      ...(reference.sceneName ? { spotName: reference.sceneName } : {}),
      spotImage: reference.imageUrl,
      ...(reference.ep != null ? { spotEp: reference.ep } : {}),
      ...(reference.spotGeo ? { spotGeo: reference.spotGeo } : {}),
    },
  };
}
