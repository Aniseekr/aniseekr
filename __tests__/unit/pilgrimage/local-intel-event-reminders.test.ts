import { describe, expect, it } from 'bun:test';

import {
  canScheduleEventReminder,
  computeEventReminderTrigger,
} from '../../../libs/services/pilgrimage/local-intel/event-reminder-scheduling';
import {
  DEFAULT_PREFERENCES,
  refreshNotificationPrefs,
} from '../../../libs/services/notifications/notification-service';
import { kvSet } from '../../../libs/services/storage/app-storage';
import { NOTIFICATION_PREFS_KEY } from '../../../libs/services/storage/keys';
import type { EventOccurrence } from '../../../libs/services/pilgrimage/local-intel/types';

// Bonbori-like occurrence: 2026-10-17, Asia/Tokyo.
const OCCURRENCE: EventOccurrence = { year: 2026, startsAt: '2026-10-17', endsAt: '2026-10-17' };
// Start of the event: Oct 17 00:00 JST.
const START_INSTANT = Date.UTC(2026, 9, 16, 15, 0, 0);
// Reminder slot: Oct 16 09:00 JST.
const SLOT_INSTANT = Date.UTC(2026, 9, 16, 0, 0, 0);

describe('local-intel event reminders', () => {
  it('PILG-046 fires 09:00 local on the day before the event starts', () => {
    const now = new Date(Date.UTC(2026, 6, 17));
    const trigger = computeEventReminderTrigger(OCCURRENCE, now);
    expect(trigger?.getTime()).toBe(SLOT_INSTANT);
  });

  it('PILG-046 falls back to now+5min when the slot passed but the event has not started', () => {
    const now = new Date(Date.UTC(2026, 9, 16, 10, 0, 0)); // 19:00 JST on the eve
    const trigger = computeEventReminderTrigger(OCCURRENCE, now);
    expect(trigger?.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it('PILG-046 returns null once the event has started or passed', () => {
    expect(computeEventReminderTrigger(OCCURRENCE, new Date(START_INSTANT))).toBeNull();
    expect(
      computeEventReminderTrigger(OCCURRENCE, new Date(Date.UTC(2026, 10, 1))),
    ).toBeNull();
  });

  it('PILG-047 pilgrimageEventReminders validates through preference merging', async () => {
    expect(DEFAULT_PREFERENCES.pilgrimageEventReminders).toBe(true);

    kvSet(
      NOTIFICATION_PREFS_KEY,
      JSON.stringify({ pilgrimageEventReminders: false, episodeReminders: true }),
    );
    const prefs = await refreshNotificationPrefs();
    expect(prefs.pilgrimageEventReminders).toBe(false);

    // Non-boolean garbage falls back to the default instead of leaking through.
    kvSet(NOTIFICATION_PREFS_KEY, JSON.stringify({ pilgrimageEventReminders: 'yes' }));
    const fallback = await refreshNotificationPrefs();
    expect(fallback.pilgrimageEventReminders).toBe(true);

    kvSet(NOTIFICATION_PREFS_KEY, JSON.stringify(DEFAULT_PREFERENCES));
    await refreshNotificationPrefs();
  });

  it('PILG-047 a disabled preference or non-upcoming state blocks scheduling', () => {
    const on = { ...DEFAULT_PREFERENCES, pilgrimageEventReminders: true };
    const off = { ...DEFAULT_PREFERENCES, pilgrimageEventReminders: false };
    const upcoming = { state: 'upcoming', occurrence: OCCURRENCE, startsInDays: 3 } as const;

    expect(canScheduleEventReminder(on, upcoming)).toBe(true);
    expect(canScheduleEventReminder(off, upcoming)).toBe(false);
    expect(canScheduleEventReminder(on, { state: 'active', occurrence: OCCURRENCE })).toBe(false);
    expect(canScheduleEventReminder(on, { state: 'ended', occurrence: null })).toBe(false);
    expect(canScheduleEventReminder(on, { state: 'unannounced', typicalMonth: 10 })).toBe(false);
  });
});
