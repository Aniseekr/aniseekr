export interface ReleaseDateParts {
  year: number | null;
  month: number | null;
  day: number | null;
}

/**
 * Preserve only the date precision supplied by the source. AniList can omit
 * the month or day for an announced title, so this never invents either.
 */
export function formatReleaseDate(startDate: ReleaseDateParts | undefined): string | null {
  const year = startDate?.year;
  if (typeof year !== 'number' || !Number.isFinite(year)) return null;

  const month = startDate?.month;
  const day = startDate?.day;
  const parts = [String(year)];

  if (typeof month === 'number' && month >= 1 && month <= 12) {
    parts.push(String(month).padStart(2, '0'));
    if (typeof day === 'number' && day >= 1 && day <= 31) {
      parts.push(String(day).padStart(2, '0'));
    }
  }

  return parts.join('.');
}
