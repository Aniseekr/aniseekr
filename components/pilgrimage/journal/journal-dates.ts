// Journal dates through the i18n catalog: Hermes here has no reliable Intl
// date formatting, and the catalog already knows each language's order.
import type { useT } from '../../../libs/i18n';

type T = ReturnType<typeof useT>;

export function formatJournalDay(ms: number, t: T): string {
  const d = new Date(ms);
  return t('pilgrimage.album.dayLabel', { month: d.getMonth() + 1, day: d.getDate() });
}

export function formatJournalRange(from: number, to: number, t: T): string {
  const start = formatJournalDay(from, t);
  const end = formatJournalDay(to, t);
  return start === end ? start : t('pilgrimage.album.dateRange', { start, end });
}
