// Layout 3 — "03B — Seasonal (Spring Showcase)" from japanwalker.pen.
// Editorial banner up top, scrollable genre filter chips, then a horizontal
// rail of tall poster cards with score & NEW pills overlaid.

import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { formatScore, humanizeStatus, seasonOf } from './shared';
import type { Anime } from '../types';

interface ShowcaseLayoutProps {
  data: Anime[];
  onSelect?: (anime: Anime) => void;
}

const GENRES = ['All', 'Action', 'Romance', 'Fantasy', 'Slice of Life', 'Mecha'];
const POSTER_W = 220;
const POSTER_H = 280;

function matchesGenre(anime: Anime, chip: string): boolean {
  if (chip === 'All') return true;
  const haystacks: string[] = [];
  if (anime.tags) haystacks.push(...anime.tags);
  if (anime.studios) haystacks.push(...anime.studios);
  if (anime.mood) haystacks.push(anime.mood);
  const needle = chip.toLowerCase();
  return haystacks.some((h) => h?.toLowerCase().includes(needle));
}

function ShowcaseLayoutComponent({ data, onSelect }: ShowcaseLayoutProps) {
  const { theme } = useTheme();
  const accentFg = readableTextOn(theme.accent);
  const [selectedGenre, setSelectedGenre] = useState('All');

  const filtered = useMemo(() => {
    if (selectedGenre === 'All') return data;
    const matches = data.filter((a) => matchesGenre(a, selectedGenre));
    // Fall back to full list if the filter would otherwise be empty —
    // better to show something than an empty rail.
    return matches.length > 0 ? matches : data;
  }, [data, selectedGenre]);

  const banner = data[0];

  if (data.length === 0) {
    return <EmptyState />;
  }

  return (
    <View style={styles.root}>
      {/* Editorial banner */}
      {banner ? (
        <View style={styles.bannerWrap}>
          <Pressable
            onPress={() => onSelect?.(banner)}
            style={({ pressed }) => [
              styles.banner,
              { borderColor: theme.glassBorder },
              pressed && { opacity: 0.92 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Featured: ${banner.title}`}>
            <Image
              source={{ uri: banner.bannerImage ?? banner.image }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
            <LinearGradient
              colors={[
                'rgba(10,10,10,0.92)',
                'rgba(10,10,10,0.2)',
                'rgba(0,0,0,0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.bannerContent}>
              <View
                style={[
                  styles.bannerPill,
                  { backgroundColor: `${theme.accent}33` },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: theme.accent, letterSpacing: 1.5 }}>
                  {seasonOf(banner) || 'This Season'}
                </ThemedText>
              </View>
              <ThemedText variant="titleLarge" weight="800" numberOfLines={2}>
                The season&rsquo;s biggest premieres
              </ThemedText>
              <View style={styles.bannerCta}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: theme.accent }}>
                  View calendar
                </ThemedText>
                <Ionicons name="arrow-forward" size={12} color={theme.accent} />
              </View>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Genre chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipList}>
        {GENRES.map((chip) => {
          const active = chip === selectedGenre;
          return (
            <Pressable
              key={chip}
              onPress={() => {
                hapticsBridge.selection();
                setSelectedGenre(chip);
              }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? theme.accent : theme.background.secondary,
                  borderColor: active ? theme.accent : theme.glassBorder,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${chip} filter`}>
              <ThemedText
                variant="captionSmall"
                weight={active ? '700' : '600'}
                style={{ color: active ? accentFg : theme.text.secondary }}>
                {chip}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Section head */}
      <View style={styles.sectionHead}>
        <ThemedText variant="titleLarge" weight="700">
          Latest Season
        </ThemedText>
        <View
          style={[
            styles.refreshBtn,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          <Ionicons name="refresh" size={12} color={theme.accent} />
        </View>
      </View>

      {/* Poster rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railList}>
        {filtered.slice(0, 12).map((anime, idx) => (
          <ShowcasePoster
            key={anime.id}
            anime={anime}
            isNew={idx < 3}
            onPress={() => onSelect?.(anime)}
            accent={theme.accent}
            borderColor={theme.glassBorder}
          />
        ))}
      </ScrollView>

      {/* For-you teaser */}
      {data.length > 0 ? (
        <View style={styles.forYouWrap}>
          <View
            style={[
              styles.forYou,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <View
              style={[
                styles.forYouIcon,
                { backgroundColor: `${theme.accent}26` },
              ]}>
              <Ionicons name="sparkles" size={20} color={theme.accent} />
            </View>
            <View style={styles.forYouText}>
              <ThemedText variant="bodySmall" weight="700">
                Tuned to your taste
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                {data.length} picks based on your watch history
              </ThemedText>
            </View>
            <View
              style={[
                styles.forYouArrow,
                { backgroundColor: theme.background.tertiary },
              ]}>
              <Ionicons name="arrow-forward" size={16} color={theme.text.primary} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface ShowcasePosterProps {
  anime: Anime;
  isNew: boolean;
  onPress: () => void;
  accent: string;
  borderColor: string;
}

const ShowcasePoster = memo(function ShowcasePoster({
  anime,
  isNew,
  onPress,
  accent,
  borderColor,
}: ShowcasePosterProps) {
  const { theme } = useTheme();
  const score = formatScore(anime.score);
  const genre = anime.tags?.[0] ?? anime.mood ?? 'Anime';
  const meta = humanizeStatus(anime.status) ?? (anime.episodes ? `${anime.episodes} eps` : null);
  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.posterCell, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={anime.title}>
      <View
        style={[
          styles.posterCard,
          { borderColor, backgroundColor: theme.background.tertiary },
        ]}>
        <Image
          source={{ uri: anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        {score ? (
          <View
            style={[
              styles.scorePill,
              { backgroundColor: 'rgba(10,10,10,0.62)' },
            ]}>
            <Ionicons name="star" size={10} color={accent} />
            <ThemedText variant="captionSmall" weight="700">
              {score}
            </ThemedText>
          </View>
        ) : null}
        {isNew ? (
          <View
            style={[
              styles.newPill,
              { backgroundColor: `${accent}40`, borderColor: `${accent}80` },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: accent, letterSpacing: 0.5 }}>
              NEW
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText variant="bodySmall" weight="700" numberOfLines={2}>
        {anime.title}
      </ThemedText>
      <View style={styles.posterMetaRow}>
        <ThemedText variant="captionSmall" weight="600" style={{ color: accent }}>
          {genre}
        </ThemedText>
        {meta ? (
          <>
            <ThemedText variant="captionSmall" tone="tertiary">
              ·
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              {meta}
            </ThemedText>
          </>
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
  bannerWrap: {
    paddingHorizontal: Spacing.lg,
  },
  banner: {
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  bannerContent: {
    flex: 1,
    padding: Spacing.md + 2,
    gap: 6,
    justifyContent: 'center',
  },
  bannerPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
  },
  bannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  chipList: {
    paddingHorizontal: Spacing.lg,
    gap: 10,
  },
  chip: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    paddingHorizontal: Spacing.lg + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railList: {
    paddingHorizontal: Spacing.lg + 4,
    gap: 16,
  },
  posterCell: {
    width: POSTER_W,
    gap: 8,
  },
  posterCard: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scorePill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  newPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  posterMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  forYouWrap: {
    paddingHorizontal: Spacing.lg,
  },
  forYou: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  forYouIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forYouText: {
    flex: 1,
    gap: 2,
  },
  forYouArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
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

export const ShowcaseLayout = memo(ShowcaseLayoutComponent);
