// PilgrimageDetailLoadingShell — first-paint loading skeleton for the
// /pilgrimage/[animeId] route. Mirrors the loaded layout (themed gradient
// background, navigation chrome and content sheet) so
// the swap from loading → loaded has no layout shift.
//
// Caller passes the chrome seed (title / titleSecondary / poster) that was
// carried in via route params from the list. We paint that immediately so
// the user sees the right title + poster on frame 1 (CLAUDE.md Rule 10).
// When the seed is missing the slots fall back to a shimmer block.

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { Skeleton, ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
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
  const t = useT();
  const styles = useMemo(() => makeStyles(theme, topInset), [theme, topInset]);

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
            accessibilityLabel={t('common.back')}
            tint={theme.text.primary}
            theme={theme}
          />
          <View style={styles.headerRightGroup}>
            <View style={[styles.headerButtonStub, { borderColor: theme.glassBorder }]} />
            <View style={[styles.headerButtonStub, { borderColor: theme.glassBorder }]} />
          </View>
        </View>
      </View>

      <View style={styles.loadingContent}>
        <View style={styles.controlsStub}>
          <View style={styles.searchStub}>
            <Ionicons name="search" size={17} color={theme.text.tertiary} />
            <ThemedText variant="bodyMedium" tone="tertiary">
              {t('pilgrimageUi.loading')}
            </ThemedText>
          </View>
          <View style={styles.controlRowStub}>
            <Skeleton.Block width={104} height={44} borderRadius={Radius.lg} intensity="low" />
            <Skeleton.Block width={168} height={48} borderRadius={Radius.lg} intensity="low" />
          </View>
        </View>
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

        <Skeleton.MapList mapHeight={0} listCount={4} style={styles.mapListSkeleton} />
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
    loadingContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      minHeight: '58%',
      paddingTop: Spacing.xl,
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: Spacing.xl,
      gap: Spacing.md,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      backgroundColor: theme.background.primary,
    },
    controlsStub: {
      gap: Spacing.xs,
    },
    searchStub: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    controlRowStub: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    mapListSkeleton: {
      padding: 0,
    },
  });
}
