import type { Anime } from '../../../components/rate/types';
import type { BangumiTypeFilter } from '../../../components/bangumi/BangumiSettingsSheet';

/** Paged providers may repeat an item; retain its first position and value. */
export function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function groupAnimeByWeekday(list: Anime[]): Record<number | 'unknown', Anime[]> {
  const groups: Record<number | 'unknown', Anime[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    unknown: [],
  };
  for (const anime of list) {
    const time = anime.nextAiringEpisode?.airingAt;
    const date = time == null ? null : new Date(time * 1000);
    const day = date && Number.isFinite(date.getTime()) ? date.getDay() : 'unknown';
    groups[day].push(anime);
  }
  return groups;
}

/**
 * ONA is a release channel, not a length: weekly web series (e.g. JoJo: Steel
 * Ball Run on Netflix) belong in the week grid with TV. Only one-off ONAs
 * (a single episode with no airing schedule) read as specials.
 */
function isSeriesOna(anime: Anime): boolean {
  return anime.nextAiringEpisode != null || (anime.episodes ?? 0) > 1;
}

// Bangumi reports web releases as platform "WEB"; AniList / Shikimori say "ONA".
const isOnaFormat = (format: string) => format === 'ONA' || format === 'WEB';

function isSeries(anime: Anime): boolean {
  const format = (anime.format ?? '').toUpperCase();
  if (isOnaFormat(format)) return isSeriesOna(anime);
  return !['MOVIE', 'OVA', 'SPECIAL'].includes(format);
}

export function splitSpecialAnime(list: Anime[]) {
  const special: Anime[] = [];
  const regular: Anime[] = [];
  for (const anime of list) (isSeries(anime) ? regular : special).push(anime);
  return { special, regular };
}

export function matchesTypeFilter(anime: Anime, filter: BangumiTypeFilter): boolean {
  const format = (anime.format ?? '').toUpperCase();
  switch (filter) {
    case 'tv':
      return format === 'TV' || format === 'TV_SHORT' || (isOnaFormat(format) && isSeriesOna(anime));
    case 'movie':
      return format === 'MOVIE';
    case 'ova':
      return format === 'OVA';
    case 'special':
      return format === 'SPECIAL' || (isOnaFormat(format) && !isSeriesOna(anime));
    default:
      return true;
  }
}
