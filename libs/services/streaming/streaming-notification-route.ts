/**
 * Map an expo-notifications NotificationResponse (or anything shaped like it)
 * to the in-app route that the user expects when they tap the notification.
 *
 * Kept side-effect-free so it can be unit-tested without an Expo runtime.
 * The actual navigation happens in `_layout.tsx` via `expo-router`.
 */

import type { NotificationKind } from '../notifications/notification-service';

export interface NotificationLike {
  notification?: {
    request?: {
      content?: {
        data?: Record<string, unknown> | null;
      };
    };
  };
}

export function routeForNotificationResponse(
  response: NotificationLike | null | undefined
): string | null {
  if (!response) return null;
  const data = response.notification?.request?.content?.data;
  if (!data || typeof data !== 'object') return null;
  const kind = data.kind as NotificationKind | string | undefined;
  if (!kind) return null;

  switch (kind) {
    case 'episode_reminder': {
      const id = typeof data.animeId === 'string' ? data.animeId.trim() : '';
      if (!id) return null;
      // openWatch=1 is consumed by the detail page to surface the user's
      // primary watch option (jump to platform).
      return `/anime/${id}?openWatch=1`;
    }
    case 'daily_digest':
      return '/';
    case 'achievement_unlock':
      return '/(setting)/achievements';
    case 'sync_complete':
      return '/';
    case 'movie_drop': {
      const id = typeof data.animeId === 'string' ? data.animeId.trim() : '';
      if (!id) return null;
      return `/anime/${id}`;
    }
    case 'pilgrimage_event': {
      const id = typeof data.animeId === 'string' ? data.animeId.trim() : '';
      if (!id) return null;
      const eventId = typeof data.eventId === 'string' ? data.eventId.trim() : '';
      return eventId
        ? `/pilgrimage/${id}?intelEvent=${encodeURIComponent(eventId)}`
        : `/pilgrimage/${id}`;
    }
    default:
      return null;
  }
}
