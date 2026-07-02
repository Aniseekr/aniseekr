import type { OverlayMode } from '../../../components/pilgrimage/camera/types';
import type { TranslationKey } from '../../i18n';

/** Carousel slot ids: the four overlay modes plus the synthetic 'off' slot. */
export type OverlayCarouselId = OverlayMode | 'off';

export interface OverlayCarouselItem {
  id: OverlayCarouselId;
  /** Ionicons glyph name; cast to `keyof typeof Ionicons.glyphMap` at the component boundary. */
  icon: string;
  labelKey: TranslationKey;
}

/**
 * Order mirrors the legacy OverlayControlsBar MODES strip (Off · Anime · Edge · Sketch · Subject).
 * 'edge' is the product default mode; 'off' is the visibility toggle, not a real OverlayMode.
 */
export const OVERLAY_CAROUSEL_ITEMS: readonly OverlayCarouselItem[] = [
  { id: 'off', icon: 'eye-off-outline', labelKey: 'common.off' },
  { id: 'anime', icon: 'image-outline', labelKey: 'commonUi.anime' },
  { id: 'edge', icon: 'analytics-outline', labelKey: 'pilgrimageUi.edge' },
  { id: 'sketch', icon: 'pencil-outline', labelKey: 'pilgrimageUi.sketch' },
  { id: 'subject', icon: 'person-outline', labelKey: 'pilgrimageUi.subject' },
] as const;

export interface OverlayCarouselState {
  overlayVisible: boolean;
  overlayMode: OverlayMode;
}

export interface OverlayCarouselSelection {
  overlayVisible: boolean;
  overlayMode?: OverlayMode;
}

export function clampOverlayIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.round(index), OVERLAY_CAROUSEL_ITEMS.length - 1));
}

/** HUD state → carousel slot index. A hidden overlay always resolves to the Off slot (0). */
export function overlayCarouselIndex({ overlayVisible, overlayMode }: OverlayCarouselState): number {
  if (!overlayVisible) return 0;
  const idx = OVERLAY_CAROUSEL_ITEMS.findIndex((item) => item.id === overlayMode);
  return idx <= 0 ? 1 : idx; // a visible overlay never resolves to the Off slot
}

/**
 * Carousel slot index → HUD patch. The Off slot only flips visibility off (the previous
 * overlayMode is intentionally retained in the HUD so toggling back restores it).
 */
export function overlaySelectionForIndex(index: number): OverlayCarouselSelection {
  const item = OVERLAY_CAROUSEL_ITEMS[clampOverlayIndex(index)];
  if (item.id === 'off') return { overlayVisible: false };
  return { overlayVisible: true, overlayMode: item.id };
}

export function nextOverlayIndex(index: number): number {
  return clampOverlayIndex(clampOverlayIndex(index) + 1);
}

export function prevOverlayIndex(index: number): number {
  return clampOverlayIndex(clampOverlayIndex(index) - 1);
}

export function overlayCarouselItemAt(index: number): OverlayCarouselItem {
  return OVERLAY_CAROUSEL_ITEMS[clampOverlayIndex(index)];
}
