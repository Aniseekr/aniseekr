// Styles for the pilgrimage detail route shell + its in-route children.
// The route uses a map-first layout: a full-bleed map with a stack of
// navigation chrome on top and a persistent pull-up bottom sheet for browse
// controls, anime context and scene results.
//
// Lifted out of `[animeId].tsx` so the route shell can stay near the
// < 500-line target for route files.

import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';

export function makePilgrimageDetailStyles(theme: ThemePalette, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background.primary },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.sm,
    },
    backBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: Radius.md,
    },

    // Map background — fills the screen behind every floating layer.
    mapBackground: {
      ...StyleSheet.absoluteFill,
    },
    mapBackgroundInner: {
      flex: 1,
    },
    mapScrim: {
      // Gentle scrim so the floating chrome reads against bright tiles
      // (e.g. light-mode street maps).
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    localityLegend: {
      position: 'absolute',
      left: Spacing.screenPadding,
      right: Spacing.screenPadding,
    },

    // Floating navigation stack (back/series/album/layer tools).
    topOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: topInset + Spacing.xs,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexShrink: 1,
      minWidth: 0,
    },
    headerRightGroup: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    // Inline "couldn't load all seasons" warning shown in the header when the
    // Bangumi series relations fail to resolve (P0 #4). Tappable to retry.
    seriesWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingLeft: 10,
      paddingRight: 8,
      paddingVertical: 7,
      minHeight: 36,
      borderRadius: Radius.full,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      flexShrink: 1,
      minWidth: 0,
    },

    // Error / fallback "no map data" hero — used in place of the map when
    // the anime has no geo (we still show the floating overlay + sheet,
    // but the map area becomes a gradient with a hint).
    fallbackMapHint: {
      position: 'absolute',
      top: '38%',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.screenPadding,
    },

    // Generic empty card retained for the loading/empty error state.
    emptyCard: {
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.lg,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.cardLg,
      alignItems: 'center',
      gap: Spacing.xs,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      marginTop: Spacing.xs,
    },
  });
}

export type PilgrimageDetailStyles = ReturnType<typeof makePilgrimageDetailStyles>;
