/**
 * Pilgrimage Event Notification Service
 *
 * Thin facade over libs/services/notifications/notification-service.ts that
 * keeps a synchronous in-memory mirror (eventId -> notificationId) so UI can
 * call `isEventReminderScheduled(eventId)` without awaiting. Mirrors the
 * animeNotificationService pattern; the trigger-time math lives in
 * libs/services/pilgrimage/local-intel/event-reminder-scheduling.ts.
 */

import { useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import {
  getCachedNotificationPrefs,
  notificationService,
} from '../../libs/services/notifications/notification-service';
import type { EventDateState } from '../../libs/services/pilgrimage/local-intel/event-schedule';
import {
  canScheduleEventReminder,
  computeEventReminderTrigger,
} from '../../libs/services/pilgrimage/local-intel/event-reminder-scheduling';
import { resolveLocalIntelText } from '../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type { LocalIntelEvent } from '../../libs/services/pilgrimage/local-intel/types';

export type ToggleEventReminderResult = 'scheduled' | 'cancelled' | 'permission-denied' | 'unavailable';

class PilgrimageEventNotificationService {
  private static instance: PilgrimageEventNotificationService;
  // eventId -> notificationId. Mirrors OS-scheduled notifications whose
  // data.kind === 'pilgrimage_event', so sync lookups stay cheap.
  private notifications: Map<string, string> = new Map();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  static getInstance(): PilgrimageEventNotificationService {
    if (!PilgrimageEventNotificationService.instance) {
      PilgrimageEventNotificationService.instance = new PilgrimageEventNotificationService();
    }
    return PilgrimageEventNotificationService.instance;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.warn('[PilgrimageEventNotificationService] listener threw', e);
      }
    }
  }

  async init(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydrating) return this.hydrating;
    this.hydrating = (async () => {
      try {
        await notificationService.initialize();
        await this.rehydrate();
      } finally {
        this.hydrated = true;
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  /** Refresh the in-memory mirror from the OS scheduler. */
  async rehydrate(): Promise<void> {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      this.notifications.clear();
      for (const n of scheduled) {
        const data = (n.content?.data ?? {}) as { kind?: string; eventId?: string };
        if (data.kind === 'pilgrimage_event' && data.eventId) {
          this.notifications.set(data.eventId, n.identifier);
        }
      }
      this.notify();
    } catch (e) {
      console.warn('[PilgrimageEventNotificationService] rehydrate failed', e);
    }
  }

  /**
   * Schedule or cancel the reminder for an event occurrence. Only `upcoming`
   * states are schedulable — the caller's UI should only offer the bell then.
   */
  async toggleEventReminder(
    event: LocalIntelEvent,
    state: EventDateState,
    opts?: { body?: string },
  ): Promise<ToggleEventReminderResult> {
    await this.init();

    if (this.notifications.has(event.id)) {
      await notificationService.cancelByRef('pilgrimage_event', event.id);
      this.notifications.delete(event.id);
      this.notify();
      return 'cancelled';
    }

    if (!canScheduleEventReminder(getCachedNotificationPrefs(), state) || state.state !== 'upcoming') {
      return 'unavailable';
    }
    const fireAt = computeEventReminderTrigger(state.occurrence, new Date(), event.timezone);
    if (!fireAt) return 'unavailable';

    const permission = await notificationService.requestPermission();
    if (!permission.granted) return 'permission-denied';

    const name = resolveLocalIntelText(event.name).value;
    const id = await notificationService.schedulePilgrimageEventReminder(
      event.id,
      String(event.bangumiIds[0] ?? ''),
      name,
      // Callers pass localized copy (Rule 11); the bare date is the neutral default.
      opts?.body ?? state.occurrence.startsAt,
      fireAt,
    );
    if (!id) return 'unavailable';
    this.notifications.set(event.id, id);
    this.notify();
    return 'scheduled';
  }

  isEventReminderScheduled(eventId: string): boolean {
    return this.notifications.has(eventId);
  }
}

export const pilgrimageEventNotificationService = PilgrimageEventNotificationService.getInstance();

/**
 * React hook returning whether `eventId` currently has an OS-scheduled
 * reminder. Re-renders on schedule/cancel/hydrate.
 */
export function useIsEventReminderScheduled(eventId: string | undefined | null): boolean {
  return useSyncExternalStore(
    (listener) => pilgrimageEventNotificationService.subscribe(listener),
    () => (eventId ? pilgrimageEventNotificationService.isEventReminderScheduled(eventId) : false),
    () => false,
  );
}
