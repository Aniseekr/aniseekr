import { getStringParam, type RouterParams } from '../../utils/route-params';

export type PilgrimageDetailReturnTo = 'hub' | 'search' | 'map' | 'album' | 'plan';

export interface PilgrimageRoute {
  pathname: string;
  params?: Record<string, string>;
}

/**
 * Optional frame-1 chrome carried via route params so the detail screen can
 * paint hero + title + accent before any I/O resolves (CLAUDE.md Rule 10).
 * The detail screen still revalidates from the network — these are seeds, not
 * sources of truth.
 */
export interface PilgrimageDetailChromeSeed {
  /** Primary display title (Japanese original or whichever the caller showed). */
  title?: string | null;
  /** Secondary display title (Chinese/localized). */
  titleSecondary?: string | null;
  /** Cover/poster URL. */
  poster?: string | null;
  /** Theme accent hex string, e.g. "#8DC5D8". */
  themeColor?: string | null;
}

interface DetailRouteOptions extends PilgrimageDetailChromeSeed {
  returnTo?: PilgrimageDetailReturnTo;
  returnQuery?: string | null;
  albumAnimeId?: string | number | null;
}

export function buildPilgrimageDetailRoute(
  bangumiId: string | number,
  options: DetailRouteOptions = {}
): PilgrimageRoute {
  const params: Record<string, string> = {
    animeId: String(bangumiId),
  };
  if (options.returnTo) params.returnTo = options.returnTo;
  if (options.returnQuery) params.returnQuery = options.returnQuery;
  if (options.albumAnimeId != null) params.albumAnimeId = String(options.albumAnimeId);
  if (options.title) params.title = options.title;
  if (options.titleSecondary) params.titleSecondary = options.titleSecondary;
  if (options.poster) params.poster = options.poster;
  if (options.themeColor) params.themeColor = options.themeColor;

  return {
    pathname: '/pilgrimage/[animeId]',
    params,
  };
}

/**
 * Pull the optional chrome seed back out of the detail route's query params.
 * Returns nulls when the caller did not provide a seed; the detail screen
 * should treat those as "wait for I/O" and fall back to a skeleton.
 */
export function getPilgrimageDetailChromeSeed(
  params: RouterParams
): PilgrimageDetailChromeSeed {
  return {
    title: getStringParam(params, 'title'),
    titleSecondary: getStringParam(params, 'titleSecondary'),
    poster: getStringParam(params, 'poster'),
    themeColor: getStringParam(params, 'themeColor'),
  };
}

export function getPilgrimageDetailBackRoute(params: RouterParams): PilgrimageRoute | null {
  const returnTo = getStringParam(params, 'returnTo');
  switch (returnTo) {
    case 'search':
      return {
        pathname: '/search',
        params: {
          context: 'pilgrimage',
          q: getStringParam(params, 'returnQuery') ?? '',
        },
      };
    case 'map':
      return { pathname: '/pilgrimage/map' };
    case 'album': {
      const animeId = getStringParam(params, 'albumAnimeId') ?? getStringParam(params, 'animeId');
      return {
        pathname: '/pilgrimage/album',
        params: animeId ? { animeId } : undefined,
      };
    }
    case 'plan':
      return { pathname: '/pilgrimage/plan' };
    case 'hub':
      return { pathname: '/pilgrimage' };
    default:
      return null;
  }
}

export type MapsPlatform = 'google' | 'apple';

/** Google dir URLs allow up to ~9 intermediate waypoints + 1 destination. */
const GOOGLE_MAX_WAYPOINTS = 9;

const latLng = (p: readonly [number, number]): string => `${p[0]},${p[1]}`;

/**
 * Build deep links that route through an ordered list of pilgrimage stops.
 *
 * Google: origin is omitted so Maps uses the user's current location; each
 * segment carries up to 9 waypoints then a final destination. A trip longer
 * than 10 stops is split into chained segments (the next segment resumes from
 * the previous segment's last stop). Apple Maps has no multi-stop URL, so we
 * fall back to one search pin per stop.
 */
export function buildMultiStopDirectionsUrl(
  stops: readonly (readonly [number, number])[],
  platform: MapsPlatform
): string[] {
  if (stops.length === 0) return [];

  if (platform === 'apple') {
    return stops.map((p) => `https://maps.apple.com/?ll=${latLng(p)}`);
  }

  // google — chunk into segments of at most (GOOGLE_MAX_WAYPOINTS + 1) stops,
  // overlapping by one so each segment starts where the previous ended.
  const segmentSize = GOOGLE_MAX_WAYPOINTS + 1;
  const urls: string[] = [];
  let start = 0;
  while (start < stops.length) {
    const end = Math.min(start + segmentSize, stops.length);
    const segment = stops.slice(start, end);
    if (segment.length < 2) {
      // A trailing lone stop (only when a segment boundary landed exactly on the
      // last stop) — link straight to it.
      urls.push(`https://www.google.com/maps/dir/?api=1&destination=${latLng(segment[0])}`);
      break;
    }
    const destination = latLng(segment[segment.length - 1]);
    const waypoints = segment
      .slice(0, segment.length - 1)
      .map(latLng)
      .join('|');
    urls.push(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}`
    );
    if (end >= stops.length) break;
    start = end - 1; // resume from this segment's destination
  }
  return urls;
}
