// Route params and filing rules for the compare camera's reference image.
//
// A reference is either an anime scene we know (an Anitabi point) or an image
// the user imported from their library. Scenes carry their real spot fields;
// imports carry nothing we'd have to invent — no scene name, anime or geo.

import { getPilgrimageSpotTitles } from './pilgrimage-localization';
import type { PilgrimageSeriesPoint } from './pilgrimage-series';
import type { AnitabiPoint } from './types';

export type ReferenceKind = 'imported';

/** Params accepted by `app/compare/[spotId]` (all strings — they are route params). */
// A type alias (not an interface) so it satisfies expo-router's param index signature.
export type CompareRouteParams = {
  spotId: string;
  imageUrl: string;
  name: string;
  ep: string;
  animeId: string;
  animeTitle: string;
  themeColor: string;
  spotLat?: string;
  spotLng?: string;
  /** Anitabi `origin` attribution for the reference scene (CC BY-NC-SA). */
  sceneOrigin?: string;
  sceneOriginURL?: string;
  /** Set for user-imported references; absent for anime scenes. */
  referenceKind?: ReferenceKind;
};

function hasRealGeo(geo: readonly [number, number] | null | undefined): geo is [number, number] {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function sourceBangumiId(point: AnitabiPoint): number | null {
  const source = (point as Partial<PilgrimageSeriesPoint>).sourceBangumiId;
  return typeof source === 'number' && Number.isFinite(source) && source > 0 ? source : null;
}

/** Compare params for an anime scene: the spot's own fields, geo only when real. */
export function buildSceneCompareParams(
  spot: AnitabiPoint,
  ctx: { animeId: number | null; animeTitle: string; themeColor: string }
): CompareRouteParams {
  const animeId = sourceBangumiId(spot) ?? ctx.animeId;
  return {
    spotId: spot.id,
    imageUrl: spot.image,
    name: getPilgrimageSpotTitles(spot).primary,
    ep: String(spot.ep),
    animeId: animeId !== null ? String(animeId) : '',
    animeTitle: ctx.animeTitle,
    themeColor: ctx.themeColor,
    ...(hasRealGeo(spot.geo) ? { spotLat: String(spot.geo[0]), spotLng: String(spot.geo[1]) } : {}),
    ...(spot.origin ? { sceneOrigin: spot.origin } : {}),
    ...(spot.originURL ? { sceneOriginURL: spot.originURL } : {}),
  };
}

/**
 * Compare params for a user-imported reference. The id is synthetic (it names
 * the session, not a place) and `label` is the caller's translated
 * "imported reference" string — never an English default baked in here.
 */
export function buildImportedCompareParams(
  uri: string,
  ctx: { label: string; themeColor: string; now: number; nonce: number }
): CompareRouteParams {
  return {
    spotId: `ref-${ctx.now}-${ctx.nonce}`,
    imageUrl: uri,
    name: ctx.label,
    ep: '',
    animeId: '',
    animeTitle: '',
    themeColor: ctx.themeColor,
    referenceKind: 'imported',
  };
}

/**
 * Where a shot is recorded. Scene references file under their spot; imported
 * references (and shots with no reference at all) stay in the free bucket —
 * a synthetic spot id there would be an orphan the album can't show.
 */
export function resolveCaptureBucket(input: {
  referenceKind?: string | null;
  imageUrl?: string | null;
}): 'spot' | 'free' {
  if (input.referenceKind === 'imported') return 'free';
  return input.imageUrl ? 'spot' : 'free';
}

export type PreviewMode = 'stacked' | 'sideBySide' | 'overlay' | 'slider' | 'full';

/** Comparison layouts need two images; a lone shot only has the single view. */
export function availablePreviewModes(hasReference: boolean): PreviewMode[] {
  return hasReference ? ['stacked', 'sideBySide', 'overlay', 'slider', 'full'] : ['full'];
}
