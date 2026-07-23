import type { TranslationKey, TranslationValues } from '../../i18n';

type Translate = (key: TranslationKey | string, values?: TranslationValues) => string;

export function formatNewsRelativeTime(
  publishedAt: number,
  t: Translate,
  nowMs = Date.now()
): string {
  if (publishedAt <= 0) return t('news.undated');

  const diffMs = nowMs - publishedAt;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return t('news.relative.justNow');

  const future = diffMs < 0;
  if (absMs < hour) {
    const count = Math.max(1, Math.round(absMs / minute));
    return t(future ? 'news.relative.inMinutes' : 'news.relative.minutes', { count });
  }
  if (absMs < day) {
    const count = Math.max(1, Math.round(absMs / hour));
    return t(future ? 'news.relative.inHours' : 'news.relative.hours', { count });
  }
  const count = Math.max(1, Math.round(absMs / day));
  return t(future ? 'news.relative.inDays' : 'news.relative.days', { count });
}
