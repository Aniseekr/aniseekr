// Pure reminder-trigger computation for local-intel events (spec §13).
// The facade (modules/notifications/pilgrimageEventNotificationService.ts)
// owns the OS scheduling side effects; everything testable lives here.

import type { NotificationPreferences } from '../../notifications/notification-service';
import type { EventDateState } from './event-schedule';
import { wallDateToInstant } from './timezone';
import type { EventOccurrence } from './types';
import { DEFAULT_SPOT_TIMEZONE } from './types';

const REMINDER_HOUR_LOCAL = 9;
const FALLBACK_DELAY_MS = 5 * 60 * 1000;

/**
 * When to fire the reminder for an occurrence:
 * - 09:00 event-local on the day before `startsAt`;
 * - if that slot already passed but the event hasn't started, now + 5 min;
 * - null once the event has started (nothing left to remind about).
 */
export function computeEventReminderTrigger(
  occurrence: EventOccurrence,
  now: Date,
  tz: string = DEFAULT_SPOT_TIMEZONE,
): Date | null {
  const start = wallDateToInstant(occurrence.startsAt, tz, false);
  if (!start || start.getTime() <= now.getTime()) return null;
  const slot = start.getTime() - 24 * 60 * 60 * 1000 + REMINDER_HOUR_LOCAL * 60 * 60 * 1000;
  if (slot > now.getTime()) return new Date(slot);
  return new Date(now.getTime() + FALLBACK_DELAY_MS);
}

/** Only `upcoming` occurrences are schedulable, and only when the pref is on. */
export function canScheduleEventReminder(
  prefs: Pick<NotificationPreferences, 'pilgrimageEventReminders'>,
  state: EventDateState,
): boolean {
  return prefs.pilgrimageEventReminders && state.state === 'upcoming';
}
