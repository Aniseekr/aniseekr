// Centered 3-up parallax carousel for the Seasonal mode of the Home screen.
// Mirrors the "03 — Home Carousel (Seasonal)" design from japanwalker.pen:
// hero card with season label, title, meta, and a Continue Watching CTA,
// flanked by dimmed neighbouring cards, with a pill-style page indicator.

import { memo, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Anime } from './types';
import {
  FontFamily,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from '../../constants/DesignSystem';
import { readableTextOn } from '../themed/contrast';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const CARD_W = 283;
const CARD_H = 430;
const CARD_GAP = 12;
const ITEM_FULL = CARD_W + CARD_GAP;
const MAX_DOTS = 6;

type Props = {
  data: Anime[];
  onSelect?: (anime: Anime) => void;
};

function seasonOf(anime: Anime): string {
  const month = anime.startDate?.month;
  const year = anime.startDate?.year;
  let label = '';
  if (month != null) {
    if (month <= 3) label = 'WINTER';
    else if (month <= 6) label = 'SPRING';
    else if (month <= 9) label = 'SUMMER';
    else label = 'AUTUMN';
  }
  if (label && year) return `${label} ${year}`;
  if (year) return `${year}`;
  return label;
}

function formatScore(score: number | undefined | null): string | null {
  if (score == null) return null;
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}

function humanizeStatus(status?: string): string | null {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper === 'RELEASING' || upper === 'CURRENTLY_AIRING') return 'Ongoing';
  if (upper === 'FINISHED' || upper === 'FINISHED_AIRING') return 'Complete';
  if (upper === 'NOT_YET_RELEASED' || upper === 'NOT_YET_AIRED') return 'Upcoming';
  if (upper === 'CANCELLED') return 'Cancelled';
  if (upper === 'HIATUS') return 'Hiatus';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function buildMeta(anime: Anime): string {
  const parts: string[] = [];
  if (anime.episodes) parts.push(`Episode ${anime.episodes}`);
  const status = humanizeStatus(anime.status);
  if (status) parts.push(status);
  const score = formatScore(anime.score);
  if (score) parts.push(`★ ${score}`);
  return parts.join('  •  ');
}

function SeasonalCarouselComponent({ data, onSelect }: Props) {
  const { width: screenW } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sidePadding = Math.max(0, (screenW - CARD_W) / 2);
  const scrollX = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const accentText = readableTextOn(theme.accent);

  const setActiveIndexJS = useCallback((idx: number) => {
    setActiveIndex((prev) => {
      if (prev === idx) return prev;
      hapticsBridge.selection();
      return idx;
    });
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      const idx = Math.round(event.contentOffset.x / ITEM_FULL);
      runOnJS(setActiveIndexJS)(idx);
    },
  });

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Loading this season…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={ITEM_FULL}
        snapToAlignment="start"
        contentContainerStyle={{
          paddingHorizontal: sidePadding,
          alignItems: 'center',
        }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scroller}>
        {data.map((anime, index) => (
          <SeasonalCardItem
            key={anime.id}
            anime={anime}
            index={index}
            scrollX={scrollX}
            accent={theme.accent}
            accentText={accentText}
            onPress={() => onSelect?.(anime)}
          />
        ))}
      </Animated.ScrollView>

      <Dots
        length={Math.min(data.length, MAX_DOTS)}
        activeIndex={Math.min(activeIndex, MAX_DOTS - 1)}
        accent={theme.accent}
      />
    </View>
  );
}

interface CardItemProps {
  anime: Anime;
  index: number;
  scrollX: SharedValue<number>;
  accent: string;
  accentText: string;
  onPress: () => void;
}

const SeasonalCardItem = memo(function SeasonalCardItem({
  anime,
  index,
  scrollX,
  accent,
  accentText,
  onPress,
}: CardItemProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const inputRange = [
    (index - 1) * ITEM_FULL,
    index * ITEM_FULL,
    (index + 1) * ITEM_FULL,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.78, 1, 0.78], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.45, 1, 0.45], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const season = seasonOf(anime);
  const meta = buildMeta(anime);

  return (
    <Animated.View style={[styles.item, animatedStyle]}>
      <Pressable
        onPress={onPress}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={anime.title}>
        <Image
          source={{ uri: anime.bannerImage ?? anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.92)', 'rgba(0,0,0,1)']}
          locations={[0.15, 0.7, 0.92]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.cardContent}>
          {season ? <Text style={styles.seasonLabel}>{season}</Text> : null}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {anime.title}
          </Text>
          {meta ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}

          <View style={styles.ctaRow}>
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel="Continue watching"
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: accent, opacity: pressed ? 0.88 : 1 },
              ]}>
              <Ionicons name="play" size={14} color={accentText} />
              <Text style={[styles.ctaText, { color: accentText }]}>Continue Watching</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

interface DotsProps {
  length: number;
  activeIndex: number;
  accent: string;
}

const Dots = memo(function Dots({ length, activeIndex, accent }: DotsProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (length <= 1) return null;
  return (
    <View style={styles.dots}>
      {Array.from({ length }, (_, i) => {
        const active = i === activeIndex;
        return (
          <View
            key={i}
            style={
              active
                ? [styles.dotActive, { backgroundColor: accent }]
                : styles.dot
            }
          />
        );
      })}
    </View>
  );
});

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    root: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      paddingVertical: Spacing.md,
    },
    scroller: {
      flexGrow: 0,
    },
    item: {
      width: CARD_W,
      marginRight: CARD_GAP,
    },
    card: {
      width: CARD_W,
      height: CARD_H,
      borderRadius: Radius.xl,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      ...Shadow.medium,
    },
    cardContent: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 24,
      gap: 10,
    },
    // Card text overlays a dark gradient on top of the cover image, so white is
    // universally legible regardless of theme.
    seasonLabel: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 2,
      fontFamily: FontFamily.text,
    },
    cardTitle: {
      color: '#FFFFFF',
      fontSize: 26,
      fontWeight: '700',
      lineHeight: 30,
      fontFamily: FontFamily.rounded,
    },
    cardMeta: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 12,
      fontWeight: '500',
      fontFamily: FontFamily.text,
    },
    ctaRow: {
      flexDirection: 'row',
      marginTop: 4,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      minHeight: 44,
      borderRadius: 22,
    },
    ctaText: {
      fontSize: 14,
      fontWeight: '700',
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.text.tertiary,
    },
    dotActive: {
      width: 20,
      height: 6,
      borderRadius: 3,
    },
    empty: {
      paddingVertical: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCard: {
      width: CARD_W,
      height: CARD_H,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: theme.text.secondary,
      ...Typography.bodyMedium,
    },
  });

export const SeasonalCarousel = memo(SeasonalCarouselComponent);
