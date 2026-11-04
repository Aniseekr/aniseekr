import type { PilgrimageSpot, PilgrimageWork } from './types';

export type ReferenceKind = 'imported';

/** Route params accepted by the compare camera. */
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
  time?: string;
  targetSpotId?: string;
  referenceKind?: ReferenceKind;
};

/** Open the camera for a real Atlas spot; the user imports its comparison screenshot there. */
export function buildSpotCompareParams(
  spot: PilgrimageSpot,
  work: PilgrimageWork,
  themeColor: string
): CompareRouteParams {
  const scene = spot.scenes[0];
  const episode = scene?.episode.match(/\d+/)?.[0] ?? '';
  const bgmId = work.bgm?.[0];
  return {
    spotId: spot.id,
    targetSpotId: spot.id,
    imageUrl: '',
    name: spot.name,
    ep: episode,
    animeId: bgmId === undefined ? '' : String(bgmId),
    animeTitle: work.titleJa,
    themeColor,
    ...(scene?.time ? { time: scene.time } : {}),
    ...(spot.lat !== null && spot.lon !== null
      ? { spotLat: String(spot.lat), spotLng: String(spot.lon) }
      : {}),
  };
}

/** Build a compare route from an image the user selected in the photo library. */
export function buildImportedCompareParams(
  uri: string,
  ctx: {
    label: string;
    themeColor: string;
    now: number;
    nonce: number;
    target?: Pick<CompareRouteParams, 'spotId' | 'targetSpotId' | 'name' | 'ep' | 'animeId' | 'animeTitle' | 'spotLat' | 'spotLng' | 'time'>;
  }
): CompareRouteParams {
  return {
    spotId: ctx.target?.spotId ?? `ref-${ctx.now}-${ctx.nonce}`,
    imageUrl: uri,
    name: ctx.target?.name ?? ctx.label,
    ep: ctx.target?.ep ?? '',
    animeId: ctx.target?.animeId ?? '',
    animeTitle: ctx.target?.animeTitle ?? '',
    themeColor: ctx.themeColor,
    ...(ctx.target?.targetSpotId ? { targetSpotId: ctx.target.targetSpotId } : {}),
    ...(ctx.target?.spotLat ? { spotLat: ctx.target.spotLat } : {}),
    ...(ctx.target?.spotLng ? { spotLng: ctx.target.spotLng } : {}),
    ...(ctx.target?.time ? { time: ctx.target.time } : {}),
    referenceKind: 'imported',
  };
}

/** Targeted screenshot comparisons save under the Atlas spot; standalone ones stay free. */
export function resolveCaptureBucket(input: {
  referenceKind?: string | null;
  imageUrl?: string | null;
  targetSpotId?: string | null;
}): 'spot' | 'free' {
  if (input.targetSpotId) return 'spot';
  if (input.referenceKind === 'imported') return 'free';
  return input.imageUrl ? 'spot' : 'free';
}

export type PreviewMode = 'stacked' | 'sideBySide' | 'overlay' | 'slider' | 'full';

export function availablePreviewModes(hasReference: boolean): PreviewMode[] {
  return hasReference ? ['stacked', 'sideBySide', 'overlay', 'slider', 'full'] : ['full'];
}
