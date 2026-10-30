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
