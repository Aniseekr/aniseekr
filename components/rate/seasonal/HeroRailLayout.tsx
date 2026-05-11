// Layout 2 — "03A — Seasonal (Hero + Rails)" from japanwalker.pen.
// Big hero card on top (featured anime), then a horizontal "Now Airing" rail
// of taller poster tiles, and a Continue Watching teaser at the bottom.

import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { episodeBadge, formatScore, humanizeStatus, seasonOf } from './shared';
import type { Anime } from '../types';

interface HeroRailLayoutProps {
  data: Anime[];
  onSelect?: (anime: Anime) => void;
}

const POSTER_W = 128;
const POSTER_H = 168;

function HeroRailLayoutComponent({ data, onSelect }: HeroRailLayoutProps) {
  const { theme } = useTheme();
  const accentFg = readableTextOn(theme.accent);

  if (data.length === 0) {
    return <EmptyState />;
  }

  const hero = data[0];
  const rail = data.slice(1, 10);
  const continueAnime = data[0];

  const heroMeta = [
    formatScore(hero.score) ? `★ ${formatScore(hero.score)}` : null,
    hero.episodes ? `${hero.episodes} eps` : null,
    humanizeStatus(hero.status),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root}>
      {/* Hero */}
      <Pressable
        onPress={() => onSelect?.(hero)}
        style={({ pressed }) => [styles.heroWrap, pressed && { opacity: 0.94 }]}
        accessibilityRole="button"
        accessibilityLabel={`Featured: ${hero.title}`}>
        <View
          style={[
            styles.heroCard,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          <Image
            source={{ uri: hero.bannerImage ?? hero.image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['transparent', 'rgba(10,10,10,0.92)']}
            locations={[0.3, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTop}>
            <View
              style={[
                styles.heroPill,
                { backgroundColor: `${theme.accent}33`, borderColor: `${theme.accent}55` },
              ]}>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: theme.accent, letterSpacing: 1.2 }}>
                {seasonOf(hero) || 'Featured'}
              </ThemedText>
            </View>
            <View
              style={[
                styles.heroSave,
                {
                  backgroundColor: `${theme.background.primary}AA`,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <Ionicons name="bookmark-outline" size={16} color={theme.text.primary} />
            </View>
          </View>
          <View style={styles.heroBottom}>
            {heroMeta ? (
              <ThemedText variant="captionSmall" weight="600" tone="secondary">
                {heroMeta}
              </ThemedText>
            ) : null}
            <ThemedText variant="headlineSmall" weight="800" numberOfLines={2}>
              {hero.title}
            </ThemedText>
            <View style={styles.heroActions}>
              <View style={[styles.heroCta, { backgroundColor: theme.accent }]}>
                <Ionicons name="play" size={14} color={accentFg} />
                <ThemedText
                  variant="bodySmall"
                  weight="700"
                  style={{ color: accentFg }}>
                  Watch Now
                </ThemedText>
              </View>
              <View
                style={[
                  styles.heroSecondary,
                  {
                    backgroundColor: `${theme.background.primary}99`,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <Ionicons name="add" size={16} color={theme.text.primary} />
              </View>
            </View>
          </View>
        </View>
      </Pressable>

      {/* Rail head */}
      <View style={styles.railHead}>
        <ThemedText variant="titleLarge" weight="700">
          Now Airing
        </ThemedText>
        <View style={styles.seeAll}>
          <ThemedText variant="captionSmall" weight="600" tone="secondary">
            See all
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.text.secondary} />
        </View>
      </View>

      {/* Rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railList}>
        {rail.map((anime) => (
          <RailPoster
            key={anime.id}
            anime={anime}
            onPress={() => onSelect?.(anime)}
            borderColor={theme.glassBorder}
            accent={theme.accent}
          />
        ))}
      </ScrollView>

      {/* Continue watching */}
      {continueAnime ? (
        <View style={styles.continueWrap}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              onSelect?.(continueAnime);
            }}
            style={({ pressed }) => [
              styles.continueCard,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.88 : 1,
              },
            ]}>
            <View
              style={[styles.continueThumb, { borderColor: theme.glassBorder }]}>
              <Image
                source={{ uri: continueAnime.image }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>
            <View style={styles.continueText}>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: theme.accent }}>
                {episodeBadge(continueAnime) ?? 'Latest episode'} · pick up where you left off
              </ThemedText>
              <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
                {continueAnime.title}
              </ThemedText>
              <View
                style={[styles.progressTrack, { backgroundColor: theme.glassBorder }]}>
                <View
                  style={[styles.progressFill, { backgroundColor: theme.accent }]}
                />
              </View>
            </View>
            <View
              style={[
                styles.continuePlay,
                { backgroundColor: theme.accent },
              ]}>
              <Ionicons name="play" size={14} color={accentFg} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface RailPosterProps {
  anime: Anime;
  onPress: () => void;
  borderColor: string;
  accent: string;
}

const RailPoster = memo(function RailPoster({
  anime,
  onPress,
  borderColor,
  accent,
}: RailPosterProps) {
  const score = formatScore(anime.score);
  const episode = episodeBadge(anime);
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.posterCell, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel={anime.title}>
      <View
        style={[
          styles.posterImage,
          { borderColor, backgroundColor: theme.background.tertiary },
        ]}>
        <Image
          source={{ uri: anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      </View>
      <ThemedText variant="captionSmall" weight="700" numberOfLines={2}>
        {anime.title}
      </ThemedText>
      <View style={styles.posterMetaRow}>
        {score ? (
          <>
            <Ionicons name="star" size={10} color={accent} />
            <ThemedText variant="captionSmall" weight="700">
              {score}
            </ThemedText>
          </>
        ) : null}
        {score && episode ? (
          <ThemedText variant="captionSmall" tone="tertiary">
            ·
          </ThemedText>
        ) : null}
        {episode ? (
          <ThemedText variant="captionSmall" tone="secondary">
            {episode}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
});

function EmptyState() {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
      ]}>
      <ThemedText variant="bodyMedium" tone="secondary">
        Loading this season…
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.md,
  },
  heroWrap: {
    paddingHorizontal: Spacing.lg,
  },
  heroCard: {
    height: 280,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroTop: {
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  heroSave: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroBottom: {
    padding: Spacing.md + 2,
    gap: 8,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 4,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    borderRadius: 22,
  },
  heroSecondary: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  railHead: {
    paddingHorizontal: Spacing.lg + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  railList: {
    paddingHorizontal: Spacing.lg + 4,
    gap: 14,
  },
  posterCell: {
    width: POSTER_W,
    gap: 6,
  },
  posterImage: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  posterMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  continueWrap: {
    paddingHorizontal: Spacing.lg + 4,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    padding: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
  },
  continueThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  continueText: {
    flex: 1,
    gap: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '40%',
    borderRadius: 2,
  },
  continuePlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    height: 280,
    borderRadius: Radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.lg,
  },
});

export const HeroRailLayout = memo(HeroRailLayoutComponent);
