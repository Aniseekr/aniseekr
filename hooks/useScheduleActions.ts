import { useCallback, useReducer, useRef, useState } from 'react';
import { Linking } from 'react-native';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Anime } from '../components/rate/types';
import { animeNotificationService } from '../modules/notifications/animeNotificationService';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { trackingService } from '../libs/services/tracking/tracking-service';
import { getCachedNotificationPrefs } from '../libs/services/notifications/notification-service';
import {
  addSeasonSkip,
  clearSeasonSkips,
  loadSeasonSkipsSync,
  removeSeasonSkip,
} from '../libs/services/bangumi/season-skip-store';
import { useT } from '../libs/i18n';
import type { Season } from '../libs/utils/season-utils';

type Snackbar = {
  key: number;
  message: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  actionLabel?: string;
  onAction?: () => void;
};
export function useScheduleActions(
  season: Season,
  year: number,
  notificationsEnabled: boolean,
  onManageReminders: () => void
) {
  const t = useT();
  const [snackbar, setSnackbar] = useState<Snackbar | null>(null);
  const [skipTick, bumpSkipTick] = useReducer((value: number) => value + 1, 0);
  const [skipEpoch, bumpSkipEpoch] = useReducer((value: number) => value + 1, 0);
  const busy = useRef(new Set<string>());
  // Existing blobs use lower-case season names; keep their skips visible.
  const skipSeason = season.toLowerCase();
  const dismissSnackbar = useCallback(() => setSnackbar(null), []);
  const notify = (
    message: string,
    icon: Snackbar['icon'],
    onAction?: () => void,
    actionLabel?: string
  ) =>
    setSnackbar({
      key: Date.now(),
      message,
      icon,
      onAction,
      actionLabel: actionLabel ?? (onAction ? t('tabs.bangumiScreen.snackbar.undo') : undefined),
    });
  const handleWant = async (anime: Anime, fromBell: boolean) => {
    if (busy.current.has(anime.id)) return;
    busy.current.add(anime.id);
    try {
      if (fromBell && !getCachedNotificationPrefs().episodeReminders) {
        notify(
          t('tabs.schedule.remindersOff'),
          'notifications-off',
          onManageReminders,
          t('tabs.schedule.manageReminders')
        );
        return;
      }
      if (
        fromBell &&
        notificationsEnabled &&
        !(await animeNotificationService.requestPermissions())
      ) {
        notify(
          t('tabs.schedule.permissionDenied'),
          'notifications-off',
          () => {
            void Linking.openSettings();
          },
          t('tabs.schedule.openSettings')
        );
        return;
      }
      const prior = await trackingService.getStatus(anime.id);
      if (!prior)
        await trackingService.upsertTracking({
          animeId: anime.id,
          status: 'planned',
          title: anime.title,
          imageUrl: anime.image,
          totalEpisodes: anime.episodes,
        });
      let reminderId: string | null = null;
      if (
        notificationsEnabled &&
        getCachedNotificationPrefs().episodeReminders &&
        !animeNotificationService.isAnimeScheduled(anime.id) &&
        (fromBell || (await animeNotificationService.hasPermission().catch(() => false)))
      ) {
        reminderId = await animeNotificationService
          .scheduleAnimeNotification(anime)
          .catch(() => null);
      }
      hapticsBridge.success();
      notify(
        reminderId
          ? t('tabs.bangumiScreen.snackbar.wantToWatchWithReminder', { title: anime.title })
          : fromBell && notificationsEnabled
            ? t('tabs.bangumiScreen.snackbar.noUpcomingEpisode', { title: anime.title })
            : t('tabs.bangumiScreen.snackbar.addedToWishlist', { title: anime.title }),
        'bookmark-added',
        () => {
          if (!prior) void trackingService.removeTracking(anime.id);
          if (reminderId) void animeNotificationService.cancelAnimeNotification(anime.id);
        }
      );
    } catch (error) {
      console.warn('[schedule] follow failed', error);
      notify(t('tabs.bangumiScreen.snackbar.couldntAddToWishlist'), 'error-outline');
    } finally {
      busy.current.delete(anime.id);
    }
  };
  const handleBell = async (anime: Anime, scheduled: boolean) => {
    if (!scheduled) return handleWant(anime, true);
    if (busy.current.has(anime.id)) return;
    busy.current.add(anime.id);
    try {
      await animeNotificationService.cancelAnimeNotification(anime.id);
      notify(t('tabs.bangumiScreen.snackbar.reminderCancelled'), 'notifications-off');
    } catch (error) {
      console.warn('[schedule] cancel failed', error);
    } finally {
      busy.current.delete(anime.id);
    }
  };
  const handleSkip = (anime: Anime) => {
    addSeasonSkip(skipSeason, year, anime.id);
    bumpSkipTick();
    notify(
      t('tabs.bangumiScreen.snackbar.skippedForSeason', { title: anime.title }),
      'visibility-off',
      () => {
        removeSeasonSkip(skipSeason, year, anime.id);
        bumpSkipTick();
      }
    );
  };
  const restoreSkipped = () => {
    hapticsBridge.selection();
    clearSeasonSkips(skipSeason, year);
    bumpSkipTick();
    bumpSkipEpoch();
  };
  // Each render reflects skip mutations; the deck separately freezes its input on opening.
  const skips = loadSeasonSkipsSync(skipSeason, year);
  return {
    snackbar,
    dismissSnackbar,
    notify,
    handleBell,
    handleWant: (anime: Anime) => handleWant(anime, false),
    handleSkip,
    restoreSkipped,
    skips,
    skipTick,
    skipEpoch,
  };
}
