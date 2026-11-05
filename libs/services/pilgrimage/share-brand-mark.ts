// The Aniseekr mark on exported share images (compare card, trip album).
//
// Pure helpers: which mark styles exist per surface, which are Pro, and the
// date + place line. The line between free and Pro follows what each surface
// already gave free users before Pro existed — nothing free users had is
// taken away:
//   - compare cards never carried a forced mark, so free keeps "none"
//     (still the default) and the small logo;
//   - the trip album always ended in an "Aniseekr" mark, so free keeps it
//     (now the small logo) and removing it is Pro.
// The free mark is the small Seekr logo, corner-sized like Gemini's sparkle.

export type BrandMarkStyle = 'none' | 'logo' | 'seal' | 'dateline';

export type BrandMarkOption = { id: BrandMarkStyle; pro: boolean };

/** First entry is the free default. */
export const COMPARE_BRAND_MARKS: readonly BrandMarkOption[] = [
  { id: 'none', pro: false },
  { id: 'logo', pro: false },
  { id: 'seal', pro: true },
  { id: 'dateline', pro: true },
];

/** First entry is the free default. */
export const ALBUM_BRAND_MARKS: readonly BrandMarkOption[] = [
  { id: 'logo', pro: false },
  { id: 'seal', pro: true },
  { id: 'dateline', pro: true },
  { id: 'none', pro: true },
];

export function isBrandMarkLocked(
  options: readonly BrandMarkOption[],
  style: BrandMarkStyle,
  isPro: boolean
): boolean {
  const option = options.find((o) => o.id === style);
  return !option || (option.pro && !isPro);
}

/**
 * The style that is actually rendered and exported. A Pro style picked while
 * subscribed falls back to the surface's free default once the entitlement
 * is gone, so a lapsed subscription can never export a Pro-only mark.
 */
export function effectiveBrandMark(
  options: readonly BrandMarkOption[],
  style: BrandMarkStyle,
  isPro: boolean
): BrandMarkStyle {
  return isBrandMarkLocked(options, style, isPro) ? options[0].id : style;
}

/** "2026.11.05 · 鎌倉高校前" (drawn next to the logo) — empty parts are skipped. */
export function buildDateline(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0)
    .join(' · ');
}
