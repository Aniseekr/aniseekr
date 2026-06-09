// PilgrimageDetailLoadingShell — first-paint loading skeleton for the
// /pilgrimage/[animeId] route. Mirrors the loaded layout (themed gradient
// background, top chrome, search pill, and a peek-height bottom sheet) so
// the swap from loading → loaded has no layout shift.
//
// Caller passes the chrome seed (title / titleSecondary / poster) that was
// carried in via route params from the list. We paint that immediately so
// the user sees the right title + poster on frame 1 (CLAUDE.md Rule 10).
// When the seed is missing the slots fall back to a shimmer block.

import React, { memo, useMemo } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ON_DARK, Skeleton, ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import { RoundHeaderButton } from './RoundHeaderButton';

export interface PilgrimageDetailLoadingShellProps {
  /** Resolved accent (seed themeColor if present, else theme.accent). */
  themeColor: string;
  /** Seeded primary title, painted on frame 1 when available. */
  seedTitle: string | null;
  /** Seeded secondary title (localized variant), painted on frame 1. */
  seedSubtitle: string | null;
  /** Seeded cover image URL, painted on frame 1. */
  seedPoster: string | null;
  /** Top safe-area inset to clear the status bar. */
  topInset: number;
  theme: ThemePalette;
  onBack: () => void;
}

function PilgrimageDetailLoadingShellImpl({
  themeColor,
  seedTitle,
  seedSubtitle,
  seedPoster,
  topInset,
  theme,
  onBack,
}: PilgrimageDetailLoadingShellProps) {
  const styles = useMemo(() => makeStyles(theme, topInset), [theme, topInset]);
  // 58% mid-snap is where the sheet lands in list mode; the shell uses the
  // 16% peek so it matches map-mode entry (the user most often sees this).
  const peekTop = useMemo(() => {
    const screenH = Dimensions.get('window').height;
    return Math.round(screenH * (1 - 0.46));
  }, []);

  // Gradient that tones the seed themeColor down into the background so the
  // hue reads as "this anime's accent" without overpowering the chrome.
  const gradientColors = useMemo<readonly [string, string, string]>(
    () => [`${themeColor}33`, `${themeColor}11`, theme.background.primary],
    [themeColor, theme.background.primary]
  );

  return (
    <View style={styles.root}>
      {/* Themed gradient stands in for the map until tiles arrive. */}
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.scrim} pointerEvents="none" />

      {/* Top chrome — back is live so the user can bail mid-load. The other
          actions wait for the real anime data. */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.headerActions}>
          <RoundHeaderButton
            icon="chevron-back"
            onPress={onBack}
            accessibilityLabel="Back"
            tint={theme.text.primary}
            theme={theme}
          />
          <View style={styles.headerRightGroup}>
            <View style={[styles.headerButtonStub, { borderColor: theme.glassBorder }]} />
            <View style={[styles.headerButtonStub, { borderColor: theme.glassBorder }]} />
          </View>
        </View>

        {/* Inert search pill — same shape as the live one so there is no
            layout shift when the data lands. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.searchPill}>
          <Ionicons name="search" size={16} color={theme.text.tertiary} />
          <ThemedText variant="bodyMedium" tone="tertiary" style={styles.searchPlaceholder}>
            Loading scenes…
          </ThemedText>
        </Pressable>
      </View>

      {/* Bottom sheet stub. Mid-height so the user reads the title without
          dragging — the live sheet snaps to this height on first paint when
          viewMode is `list`. */}
      <View
        style={[
          styles.sheet,
          {
            top: peekTop,
            backgroundColor: theme.background.primary,
            borderColor: theme.glassBorder,
          },
        ]}>
        <View style={[styles.sheetHandle, { backgroundColor: theme.glassBorder }]} />

        <View style={styles.titleRow}>
          <View
            style={[
              styles.posterWrap,
              {
                backgroundColor: theme.background.tertiary,
                borderColor: theme.glassBorder,
              },
            ]}>
            {seedPoster ? (
              <Image
                source={{ uri: seedPoster }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Skeleton.Block width="100%" height="100%" borderRadius={Radius.lg} />
            )}
            <View style={styles.posterBadge} pointerEvents="none">
              <ThemedText
                variant="captionSmall"
                weight="800"
                numberOfLines={1}
                style={{ color: ON_DARK }}>
                Loading
              </ThemedText>
            </View>
          </View>

          <View style={styles.titleColumn}>
            {seedTitle ? (
              <ThemedText variant="headlineMedium" weight="800" numberOfLines={2}>
                {seedTitle}
              </ThemedText>
            ) : (
              <Skeleton.Block width="80%" height={22} />
            )}
            {seedSubtitle ? (
              <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
                {seedSubtitle}
              </ThemedText>
            ) : (
              <Skeleton.Block width="55%" height={13} style={{ marginTop: 6 }} />
            )}
            <View
              style={[
                styles.browseChip,
                {
                  borderColor: `${themeColor}55`,
                  backgroundColor: `${themeColor}1A`,
                },
              ]}>
              <Ionicons name="library-outline" size={11} color={themeColor} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: themeColor }}
                numberOfLines={1}>
                Bangumi
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Stats strip stub. */}
        <View
          style={[
            styles.statsRow,
            {
              borderColor: theme.glassBorder,
              backgroundColor: theme.background.secondary,
            },
          ]}>
          {Array.from({ length: 4 }).map((_, i) => (
            <React.Fragment key={i}>
              <View style={styles.statCell}>
                <Skeleton.Block width={28} height={20} />
                <Skeleton.Block width={36} height={10} style={{ marginTop: 4 }} />
              </View>
              {i < 3 ? (
                <View style={[styles.statDivider, { backgroundColor: theme.glassBorder }]} />
              ) : null}
            </React.Fragment>
          ))}
        </View>

        {/* Scene-spots header + grid stub. */}
        <View style={styles.sectionTitleRow}>
          <Skeleton.Block width={120} height={16} />
          <Skeleton.Block width={68} height={12} />
        </View>
        <View style={styles.gridRow}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton.Block key={i} width="48%" height={158} borderRadius={16} intensity="low" />
          ))}
        </View>
        <View style={[styles.gridRow, { marginTop: Spacing.sm }]}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton.Block
              key={i + 'b'}
              width="48%"
              height={158}
              borderRadius={16}
              intensity="low"
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function areEqual(
  prev: PilgrimageDetailLoadingShellProps,
  next: PilgrimageDetailLoadingShellProps
): boolean {
  return (
    prev.themeColor === next.themeColor &&
    prev.seedTitle === next.seedTitle &&
    prev.seedSubtitle === next.seedSubtitle &&
    prev.seedPoster === next.seedPoster &&
    prev.topInset === next.topInset &&
    prev.theme === next.theme &&
    prev.onBack === next.onBack
  );
}

export const PilgrimageDetailLoadingShell = memo(PilgrimageDetailLoadingShellImpl, areEqual);

function makeStyles(theme: ThemePalette, topInset: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.background.primary,
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.08)',
    },
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
    headerRightGroup: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    headerButtonStub: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: `${theme.background.secondary}99`,
    },
    searchPill: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.secondary}E6`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      opacity: 0.85,
    },
    searchPlaceholder: {
      ...Typography.bodyMedium,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 14,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: Spacing.md,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 2,
      marginBottom: Spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'flex-start',
    },
    posterWrap: {
      width: 84,
      height: 84,
      borderRadius: Radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    posterBadge: {
      position: 'absolute',
      left: 6,
      right: 6,
      bottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: Radius.sm,
      backgroundColor: 'rgba(0,0,0,0.62)',
      alignItems: 'center',
    },
    titleColumn: {
      flex: 1,
      gap: 4,
      paddingTop: 2,
    },
    browseChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
      borderWidth: 1,
      marginTop: 8,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: 4,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    gridRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
}
