const WEEKDAY_KEYS = [
  'news.calendar.weekdays.sun',
  'news.calendar.weekdays.mon',
  'news.calendar.weekdays.tue',
  'news.calendar.weekdays.wed',
  'news.calendar.weekdays.thu',
  'news.calendar.weekdays.fri',
  'news.calendar.weekdays.sat',
] as const;

/** Unix seconds → weekday in the device's local timezone. */
export function airingWeekdayKey(airingAt: number) {
  return WEEKDAY_KEYS[new Date(airingAt * 1000).getDay()];
}

/** Local 24-hour clock, without Intl (Hermes). */
export function formatAiringClock(airingAt: number): string {
  const date = new Date(airingAt * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export type Countdown = { unit: 'now' | 'minutes' | 'hours' | 'days'; value: number };

/** Time until the next episode, rounded to the coarsest useful unit. */
export function airingCountdown(airingAt: number, nowMs = Date.now()): Countdown {
  const minutes = Math.max(0, Math.round((airingAt * 1000 - nowMs) / 60000));
  if (minutes < 1) return { unit: 'now', value: 0 };
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  if (minutes < 24 * 60) return { unit: 'hours', value: Math.round(minutes / 60) };
  return { unit: 'days', value: Math.round(minutes / (24 * 60)) };
}
