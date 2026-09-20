import { Spacing, TabBar } from '../../constants/DesignSystem';

/** Clearance above the floating pill, excluding the device safe-area inset. */
export const FLOATING_TAB_BAR_CONTENT_INSET = TabBar.height + Spacing.lg;

/** Bottom position for absolute controls that must sit above the floating pill. */
export function floatingTabBarOverlayBottom(safeAreaBottom: number): number {
  return safeAreaBottom + FLOATING_TAB_BAR_CONTENT_INSET;
}
