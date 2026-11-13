// What the home-screen widget shows over time: the next episodes of the shows
// the user is watching. Pure — the widget runtime cannot fetch or compute, so
// the app works out every state in advance and hands it over as a timeline.
import type { Anime } from '../../../components/rate/types';

export interface AiringWidgetItem {
  title: string;
  episode: number;
  /** Already formatted for the user's language, e.g. "週五 22:30". */
  when: string;
}

export interface AiringTimelineEntry {
  date: Date;
  items: AiringWidgetItem[];
}

export const AIRING_WIDGET_MAX_ITEMS = 3;

/**
 * One entry for now, then one right after each episode airs so it drops off
 * the list. Only each show's next episode is known, so the last entry is empty:
 * the widget then asks the user to open the app instead of showing old times.
 */
export function buildAiringTimeline(
  watching: readonly Anime[],
  nowMs: number,
  formatWhen: (airingAtMs: number) => string,
  titleOf: (anime: Anime) => string = (anime) => anime.title,
  maxItems: number = AIRING_WIDGET_MAX_ITEMS
): AiringTimelineEntry[] {
  const upcoming = watching
    .flatMap((anime) => {
      const next = anime.nextAiringEpisode;
      const airingAtMs = next ? next.airingAt * 1000 : 0;
      return next && airingAtMs > nowMs
        ? [{ title: titleOf(anime), episode: next.episode, airingAtMs }]
        : [];
    })
    .sort((a, b) => a.airingAtMs - b.airingAtMs);

  const itemsFrom = (index: number): AiringWidgetItem[] =>
    upcoming.slice(index, index + maxItems).map((show) => ({
      title: show.title,
      episode: show.episode,
      when: formatWhen(show.airingAtMs),
    }));

  const entries: AiringTimelineEntry[] = [{ date: new Date(nowMs), items: itemsFrom(0) }];
  upcoming.forEach((show, index) => {
    entries.push({ date: new Date(show.airingAtMs), items: itemsFrom(index + 1) });
  });
  return entries;
}
