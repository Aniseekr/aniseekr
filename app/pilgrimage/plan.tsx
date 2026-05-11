// Travel Planner — top-level entry for one-day pilgrimage trips.
// Derives a "Featured Trip" from the most-documented pilgrimage anime, shows
// the user's visited stats, and surfaces curated suggested trips. No backing
// trip-storage exists yet — saved trips would land here when that lands.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { cityToColor } from '../../components/pilgrimage/PilgrimageMapView';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../../libs/services/pilgrimage/collection-pilgrimage-service';
import { loadVisitedSpots, type VisitedMap } from '../../libs/services/pilgrimage/visited-prefs';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

type TripCandidate = {
  anime: AnitabiBangumi;
  estimatedDays: number;
  walkingHours: number;
};

const PLAN_PRESETS: readonly { id: string; label: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'quick', label: 'Quick Walk', subtitle: '~3 spots · half-day', icon: 'walk' },
  { id: 'full', label: 'Full Day', subtitle: '5–7 spots · 8 hrs', icon: 'sunny' },
  { id: 'weekend', label: 'Weekend', subtitle: '2 days · multi-city', icon: 'calendar' },
  { id: 'ai', label: 'AI Plan', subtitle: 'Tailor to your watchlist', icon: 'sparkles' },
];

export default function PilgrimagePlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [candidates, setCandidates] = useState<TripCandidate[]>([]);
  const [collectedCount, setCollectedCount] = useState(0);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [loading, setLoading] = useState(true);

  // Load the curated featured set + the user's collection stats + their
  // visited-spot map in parallel. All three feed the stats row + featured
  // trip card.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      Promise.allSettled(
        FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
          pilgrimageRepository.getSpotsByBangumiId(bangumiId)
        )
      ),
      collectionPilgrimageService.getStats().catch(() => ({ total: 0 })),
      loadVisitedSpots().catch(() => ({} as VisitedMap)),
    ])
      .then(([fetched, stats, visitedMap]) => {
        if (cancelled) return;
        const animeList: AnitabiBangumi[] = [];
        for (const r of fetched) {
          if (r.status === 'fulfilled' && r.value) animeList.push(r.value);
        }
        animeList.sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        const enriched: TripCandidate[] = animeList.map((a) => {
          const spots = a.pointsLength ?? 0;
          // Heuristic: ~6 spots/day, ~25 minutes per stop including transit.
          const days = Math.max(1, Math.ceil(spots / 6));
          const hours = +(spots * 0.4).toFixed(1);
          return { anime: a, estimatedDays: days, walkingHours: hours };
        });
        setCandidates(enriched);
        setCollectedCount(stats.total ?? 0);
        setVisited(visitedMap);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const featured = candidates[0] ?? null;
  const suggested = useMemo(() => candidates.slice(1, 7), [candidates]);

  const stats = useMemo(() => {
    const visitedTotal = Object.values(visited).filter(Boolean).length;
    const totalSpots = candidates.reduce((acc, c) => acc + (c.anime.pointsLength ?? 0), 0);
    return {
      visited: visitedTotal,
      destinations: candidates.length,
      collected: collectedCount,
      totalSpots,
    };
  }, [visited, candidates, collectedCount]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${anime.id}`);
    },
    [router]
  );

  const handlePresetPress = useCallback(
    (presetId: string) => {
      Haptics.selectionAsync().catch(() => undefined);
      // No preset detail screens yet — preset taps route into the main
      // pilgrimage hub where the user can pick a region + filter. The id is
      // forwarded in case we later surface preset-specific defaults there.
      router.push({ pathname: '/pilgrimage', params: { preset: presetId } });
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={Colors.gradients.background as unknown as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bgGlowPrimary} pointerEvents="none" />
      <View style={styles.bgGlowSecondary} pointerEvents="none" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.78 }]}>
          <Ionicons name="chevron-back" size={20} color={Colors.text.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Trip Planner</Text>
          <Text style={styles.headerSubtitle}>Plan your walking route</Text>
        </View>
        <Pressable
          onPress={() => Haptics.selectionAsync().catch(() => undefined)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.78 }]}>
          <Ionicons name="ellipsis-horizontal" size={18} color={Colors.text.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}>
        {loading && !featured ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Building your trip ideas…</Text>
          </View>
        ) : null}

        {featured ? (
          <FeaturedTripCard
            candidate={featured}
            onPress={() => handleAnimePress(featured.anime)}
          />
        ) : null}

        <View style={styles.statRow}>
          <StatTile
            icon="map"
            value={String(stats.destinations)}
            label="Destinations"
            tint={Colors.primary}
          />
          <StatTile
            icon="bookmark"
            value={String(stats.collected)}
            label="Saved"
            tint={Colors.secondary}
          />
          <StatTile
            icon="checkmark-circle"
            value={String(stats.visited)}
            label="Spots Visited"
            tint="#34D399"
          />
        </View>

        <View style={styles.presetSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Presets</Text>
            <Text style={styles.sectionSubtitle}>Tap to start a plan</Text>
          </View>
          <View style={styles.presetGrid}>
            {PLAN_PRESETS.map((p) => (
              <PresetTile
                key={p.id}
                label={p.label}
                subtitle={p.subtitle}
                icon={p.icon}
                onPress={() => handlePresetPress(p.id)}
              />
            ))}
          </View>
        </View>

        <BuildOwnBanner
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push('/pilgrimage');
          }}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Suggested Trips</Text>
                {suggested.length > 0 ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{suggested.length}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.sectionSubtitle}>
                Curated 1-day plans inspired by featured anime
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/pilgrimage')}
              hitSlop={6}>
              <Text style={styles.sectionLink}>See all</Text>
            </Pressable>
          </View>

          {suggested.length === 0 && !loading ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="explore-off" size={36} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No suggested trips yet</Text>
              <Text style={styles.emptyBody}>
                Curated trip ideas will appear once pilgrimage data finishes loading.
              </Text>
            </View>
          ) : (
            <View style={styles.suggestedList}>
              {suggested.map((c) => (
                <SuggestedTripRow
                  key={`sugg-${c.anime.id}`}
                  candidate={c}
                  onPress={() => handleAnimePress(c.anime)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

interface FeaturedTripCardProps {
  candidate: TripCandidate;
  onPress: () => void;
}

function FeaturedTripCard({ candidate, onPress }: FeaturedTripCardProps) {
  const { anime, estimatedDays, walkingHours } = candidate;
  const tint = cityToColor(anime.city, anime.color || Colors.primary);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured trip: ${anime.title}`}
      style={({ pressed }) => [styles.featuredCard, pressed && { opacity: 0.92 }]}>
      {anime.cover ? (
        <Image
          source={{ uri: anime.cover.replace('?plan=h160', '?plan=h720') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background.secondary }]} />
      )}
      <LinearGradient
        colors={['rgba(8,8,8,0)', 'rgba(8,8,8,0.78)', 'rgba(8,8,8,0.96)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.featuredContent}>
        <View style={styles.featuredBadge}>
          <Ionicons name="star" size={10} color={Colors.primary} />
          <Text style={styles.featuredBadgeText}>FEATURED TRIP</Text>
        </View>
        <Text style={styles.featuredCity} numberOfLines={1}>
          {anime.city || 'Featured destination'}
          {anime.cn ? ` · ${anime.cn}` : ''}
        </Text>
        <Text style={styles.featuredTitle} numberOfLines={2}>
          {anime.title || 'Untitled'} · {estimatedDays}-Day
        </Text>
        <View style={styles.featuredMetaRow}>
          <View style={styles.featuredChip}>
            <Ionicons name="calendar" size={11} color={Colors.text.primary} />
            <Text style={styles.featuredChipText}>{estimatedDays} day</Text>
          </View>
          <View style={styles.featuredChip}>
            <Ionicons name="location" size={11} color={Colors.text.primary} />
            <Text style={styles.featuredChipText}>{anime.pointsLength} spots</Text>
          </View>
          <View style={styles.featuredChip}>
            <Ionicons name="walk" size={11} color={Colors.text.primary} />
            <Text style={styles.featuredChipText}>~{walkingHours}h</Text>
          </View>
        </View>
        <View style={styles.featuredActions}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.featuredCta,
              { backgroundColor: tint },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={styles.featuredCtaText}>Continue</Text>
            <Ionicons name="arrow-forward" size={14} color="#000" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

interface StatTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint: string;
}

function StatTile({ icon, value, label, tint }: StatTileProps) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface PresetTileProps {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

function PresetTile({ label, subtitle, icon, onPress }: PresetTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.presetTile, pressed && { opacity: 0.85 }]}>
      <View style={styles.presetIcon}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.presetLabel}>{label}</Text>
        <Text style={styles.presetSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Colors.text.tertiary} />
    </Pressable>
  );
}

function BuildOwnBanner({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Build your own 1-day plan"
      style={({ pressed }) => [styles.buildBanner, pressed && { opacity: 0.92 }]}>
      <LinearGradient
        colors={['#3A1F70', '#4338CA', '#5B2D8E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.buildIconRing}>
        <Ionicons name="sparkles" size={18} color="#FFF" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.buildTitle}>Build Your Own 1-Day Plan</Text>
        <Text style={styles.buildSubtitle} numberOfLines={2}>
          Pick a neighborhood, anime, and route — we’ll optimize the order.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#FFF" />
    </Pressable>
  );
}

interface SuggestedTripRowProps {
  candidate: TripCandidate;
  onPress: () => void;
}

function SuggestedTripRow({ candidate, onPress }: SuggestedTripRowProps) {
  const { anime, estimatedDays, walkingHours } = candidate;
  const tint = cityToColor(anime.city, anime.color || Colors.primary);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={anime.title}
      style={({ pressed }) => [
        styles.suggestedCard,
        { borderLeftColor: tint },
        pressed && { opacity: 0.85 },
      ]}>
      {anime.cover ? (
        <Image
          source={{ uri: anime.cover.replace('?plan=h160', '?plan=h360') }}
          style={styles.suggestedThumb}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.suggestedThumb, { backgroundColor: Colors.background.secondary }]} />
      )}
      <View style={styles.suggestedBody}>
        <View style={styles.suggestedCityRow}>
          <View style={[styles.suggestedCityDot, { backgroundColor: tint }]} />
          <Text style={styles.suggestedCity}>{anime.city || 'Multiple areas'}</Text>
        </View>
        <Text style={styles.suggestedTitle} numberOfLines={1}>
          {anime.title}
        </Text>
        <View style={styles.suggestedMetaRow}>
          <Text style={styles.suggestedMeta}>{estimatedDays}d</Text>
          <Text style={styles.suggestedDot}>·</Text>
          <Text style={styles.suggestedMeta}>{anime.pointsLength} spots</Text>
          <Text style={styles.suggestedDot}>·</Text>
          <Text style={styles.suggestedMeta}>~{walkingHours}h walk</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  bgGlowPrimary: {
    position: 'absolute',
    top: 220,
    right: -90,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(255, 159, 10, 0.10)',
    opacity: 0.7,
  },
  bgGlowSecondary: {
    position: 'absolute',
    bottom: 80,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(191, 90, 242, 0.10)',
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40,40,44,0.78)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  loadingState: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.text.secondary,
    ...Typography.bodyMedium,
  },
  featuredCard: {
    marginHorizontal: Spacing.screenPadding,
    height: 270,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
    justifyContent: 'flex-end',
  },
  featuredContent: {
    padding: 16,
    gap: 6,
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 159, 10, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.65)',
  },
  featuredBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  featuredCity: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  featuredTitle: {
    color: Colors.text.primary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  featuredMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  featuredChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  featuredChipText: {
    color: Colors.text.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  featuredActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  featuredCtaText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screenPadding,
    gap: 10,
  },
  statTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.medium,
    gap: 4,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    color: Colors.text.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '600',
  },
  presetSection: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing.sm,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(20,20,22,0.78)',
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 64,
  },
  presetIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,159,10,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.45)',
  },
  presetLabel: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  presetSubtitle: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  buildBanner: {
    marginHorizontal: Spacing.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  buildIconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  buildTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  buildSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    marginTop: 3,
  },
  section: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: Colors.text.tertiary,
    fontSize: 12,
    marginTop: 2,
  },
  sectionLink: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  countBadgeText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyCard: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.medium,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  emptyBody: {
    color: Colors.text.secondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  suggestedList: {
    gap: 10,
  },
  suggestedCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(20,20,22,0.78)',
    borderLeftWidth: 3,
    alignItems: 'center',
  },
  suggestedThumb: {
    width: 56,
    height: 76,
    borderRadius: 10,
  },
  suggestedBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  suggestedCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  suggestedCityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  suggestedCity: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  suggestedTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  suggestedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  suggestedMeta: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '600',
  },
  suggestedDot: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
});
