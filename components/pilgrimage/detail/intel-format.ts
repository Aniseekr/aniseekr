// Display formatting for local-intel data. Deterministic (no Intl variance):
// CJK locales read "10月", everything else reads "Oct".

import type { ComputedBestTime } from '../../../libs/services/pilgrimage/local-intel/best-time';

const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatMonthLabel(month: number, language: string): string {
  const m = Math.min(12, Math.max(1, Math.round(month)));
  const lang = (language || '').toLowerCase();
  if (lang.startsWith('zh') || lang.startsWith('ja')) return `${m}月`;
  return EN_MONTHS[m - 1];
}

/** CJK readers get the jp label ("夕陽"); everyone else the en one. */
export function pickBestTimeLabel(bestTime: ComputedBestTime, language: string): string {
  const lang = (language || '').toLowerCase();
  return lang.startsWith('zh') || lang.startsWith('ja') ? bestTime.jp : bestTime.en;
}
