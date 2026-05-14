import { getStringParam, type RouterParams } from '../../utils/route-params';

export type PilgrimageDetailReturnTo = 'hub' | 'search' | 'map' | 'album' | 'plan';

export interface PilgrimageRoute {
  pathname: string;
  params?: Record<string, string>;
}

interface DetailRouteOptions {
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

  return {
    pathname: '/pilgrimage/[animeId]',
    params,
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
