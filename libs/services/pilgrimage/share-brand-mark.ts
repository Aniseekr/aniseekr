// The Aniseekr mark on exported share images (compare card, trip album).
//
// Pure helpers: which mark styles exist per surface, which are Pro, and the
// date + place line. Free exports carry the small Seekr logo (corner-sized,
// like Gemini's sparkle) — it doubles as marketing. Pro can remove it or swap
// in the seal / date + place styles. On the compare card this is a user
// decision (2026-11-05): those cards had no forced mark before, and the user
// chose to add one for free exports.
// The free custom-text watermark on the compare card is separate and stays free.

export type BrandMarkStyle = 'none' | 'logo' | 'seal' | 'dateline';

export type BrandMarkOption = { id: BrandMarkStyle; pro: boolean };

/** First entry is the free default. */
export const BRAND_MARKS: readonly BrandMarkOption[] = [
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
