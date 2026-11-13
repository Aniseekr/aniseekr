// Pro: every show the user is watching gets a reminder for its next episode
// without tapping each bell. Runs when the app comes to the foreground; each
// reminder is one-shot, so the next pass after an episode airs sets the
// following one. Times follow the user's watch platform, like the schedule tab.
import type { Anime } from '../../../components/rate/types';
import { animeNotificationService } from '../../../modules/notifications/animeNotificationService';
import { LocalDB } from '../../db';
import { AnimeRepository, unifiedToLegacyAnime } from '../../repositories/anime-repository';
import { getBroadcastSeason } from '../../utils/season-utils';
import { applyPlatformAiring, dedupeById } from '../bangumi/schedule';
import { ensureBangumiData, getPlatformSites } from '../streaming/bangumi-data';
import { loadUserPrefsSync } from '../user-prefs';
import { loadNotificationPrefs } from './notification-service';

/** iOS keeps at most 64 pending local notifications; leave room for the rest. */
export const AUTO_REMINDER_LIMIT = 30;
const MIN_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Which shows the auto pass should schedule now: watched, not muted, not
 * already scheduled, with an air time far enough ahead for the lead time.
 * Soonest first, capped.
 */
export function pickAutoReminderTargets(
  schedule: readonly Anime[],
  input: {
    watchingIds: ReadonlySet<string>;
    mutedIds: ReadonlySet<string>;
    isScheduled: (animeId: string) => boolean;
    nowSec: number;
    leadTimeMinutes: number;
    freeSlots: number;
  }
): Anime[] {
  const earliest = input.nowSec + input.leadTimeMinutes * 60;
  return schedule
    .filter((anime) => {
      const airingAt = anime.nextAiringEpisode?.airingAt;
      return (
        airingAt != null &&
        airingAt > earliest &&
        input.watchingIds.has(anime.id) &&
        !input.mutedIds.has(anime.id) &&
        !input.isScheduled(anime.id)
      );
    })
    .sort((a, b) => (a.nextAiringEpisode?.airingAt ?? 0) - (b.nextAiringEpisode?.airingAt ?? 0))
    .slice(0, Math.max(0, input.freeSlots));
}

/**
 * This season's shows the user is watching, with air times on their watch
 * platform (the same times the schedule tab shows). Shared with the widget.
 */
export async function loadWatchingSchedule(): Promise<Anime[]> {
  const db = await LocalDB.getDatabase();
  const rows = await db.getAllAsync<{ anime_id: string }>(
    "SELECT anime_id FROM user_anime WHERE status = 'watching'"
  );
  if (rows.length === 0) return [];
  const watchingIds = new Set(rows.map((row) => row.anime_id));

  const { season, year } = getBroadcastSeason();
  const [fetched] = await Promise.all([
    AnimeRepository.defaultInstance().fetchSeasonalAnimeBatched(season, year, {
      perPage: 50,
      maxItems: 200,
    }),
    ensureBangumiData(),
  ]);
  const platforms = loadUserPrefsSync().streamingPlatforms;
  const order = [
    ...(platforms.primary ? [platforms.primary] : []),
    ...platforms.enabled.filter((id) => id !== platforms.primary),
  ];
  return applyPlatformAiring(
    dedupeById(fetched.map(unifiedToLegacyAnime)).filter((anime) => watchingIds.has(anime.id)),
    order,
    getPlatformSites
  );
}

let lastRunAt = 0;
let running = false;

/** Resolves with how many reminders were added. Never throws, never prompts. */
export async function refreshAutoEpisodeReminders(isPro: boolean): Promise<number> {
  if (!isPro || running || Date.now() - lastRunAt < MIN_INTERVAL_MS) return 0;
  running = true;
  try {
    const prefs = await loadNotificationPrefs();
    if (!prefs.episodeReminders || !prefs.autoEpisodeReminders) return 0;
    if (!(await animeNotificationService.hasPermission())) return 0;

    const [watching] = await Promise.all([loadWatchingSchedule(), animeNotificationService.init()]);
    if (watching.length === 0) return 0;
    const pending = await animeNotificationService.getScheduledNotifications();
    const targets = pickAutoReminderTargets(watching, {
      watchingIds: new Set(watching.map((anime) => anime.id)),
      mutedIds: new Set(prefs.autoMutedAnimeIds),
      isScheduled: (id) => animeNotificationService.isAnimeScheduled(id),
      nowSec: Date.now() / 1000,
      leadTimeMinutes: prefs.leadTimeMinutes,
      freeSlots: AUTO_REMINDER_LIMIT - pending.length,
    });

    let added = 0;
    for (const anime of targets) {
      const id = await animeNotificationService.scheduleAnimeNotification(anime, { auto: true });
      if (id) added += 1;
    }
    lastRunAt = Date.now();
    return added;
  } catch (error) {
    console.warn('[auto-reminders] failed', error);
    return 0;
  } finally {
    running = false;
  }
}

/** A settings change should take effect on the next pass, not half an hour later. */
export function resetAutoReminderThrottle(): void {
  lastRunAt = 0;
}
