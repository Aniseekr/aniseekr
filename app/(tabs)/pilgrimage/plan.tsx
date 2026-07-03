// Travel Planner — the user's planned pilgrimage spots, grouped by anime.
// Reads persisted planned intents (spot-intents v2), each carrying a meta
// snapshot (anime + point geo/image) so this list works fully offline. No fake
// stats, no dead presets (spec Phase 4.1): every number here is real — planned
// spot counts and visited∩planned progress. Tapping "Start pilgrimage" opens
// the full-screen trip map (trip/[animeId]).

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ThemedButton, ThemedText, readableTextOn } from '../../../components/themed';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import {
  loadSpotIntentsSync,
  type SpotIntentMap,
} from '../../../libs/services/pilgrimage/spot-intents';
import {
  groupPlannedIntents,
  type PlannedTripGroup,
} from '../../../libs/services/pilgrimage/planned-trips';
import {
  loadVisitedSpotsSync,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import { getIndexedById } from '../../../libs/services/pilgrimage/anitabi-index';
import { useT } from '../../../libs/i18n';

export default function PilgrimagePlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Seed sync from MMKV so the list is real on frame 1 (Rule 10) — no skeleton.
  const [intents, setIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);

  // Screens pushed on top (trip map today; check-in flows as they land) can
  // change intents/visited in MMKV while this screen stays mounted underneath
  // — silently re-seed on every focus after the first so returning here shows
  // current state without a loading flash (skip-first-focus guard, mirrors
  // index.tsx).
  const focusRefreshSeenRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusRefreshSeenRef.current) {
        focusRefreshSeenRef.current = true;
        return;
      }
      setIntents(loadSpotIntentsSync());
      setVisited(loadVisitedSpotsSync());
    }, [])
  );

  const { groups, uncategorized } = useMemo(() => groupPlannedIntents(intents), [intents]);

  const handleStart = useCallback(
    (group: PlannedTripGroup) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push({
        pathname: '/pilgrimage/trip/[animeId]',
        params: { animeId: String(group.animeId) },
      });
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  const isEmpty = groups.length === 0 && uncategorized.length === 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.78 }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <ThemedText variant="titleMedium" weight="700" style={{ letterSpacing: 0.5 }}>
            {t('pilgrimage.plan.title')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary" weight="500">
            {t('pilgrimage.plan.subtitle')}
          </ThemedText>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="flag" size={40} color={theme.text.tertiary} />
            <ThemedText variant="titleMedium" weight="800" align="center" style={{ marginTop: 8 }}>
              {t('pilgrimage.plan.emptyTitle')}
            </ThemedText>
            <ThemedText
              variant="bodySmall"
              tone="secondary"
              align="center"
              style={{ marginTop: 4, marginBottom: 16 }}>
              {t('pilgrimage.plan.emptyBody')}
            </ThemedText>
            <ThemedButton
              label={t('pilgrimage.plan.emptyCta')}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                router.push('/pilgrimage');
              }}
              size="lg"
            />
          </View>
        ) : (
          <>
            {groups.length > 0 ? (
              <ThemedText
                variant="captionSmall"
                tone="tertiary"
                weight="700"
                style={styles.sectionLabel}>
                {t('pilgrimage.plan.plannedHeader')}
              </ThemedText>
            ) : null}
            {groups.map((group) => (
              <PlannedGroupCard
                key={`trip-${group.animeId}`}
                group={group}
                visited={visited}
                theme={theme}
                onStart={() => handleStart(group)}
              />
            ))}

            {uncategorized.length > 0 ? (
              <View style={styles.uncategorizedCard}>
                <ThemedText variant="bodyMedium" weight="700">
                  {t('pilgrimage.plan.uncategorizedTitle')}
                </ThemedText>
                <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
                  {t('pilgrimage.plan.uncategorizedBody', { count: uncategorized.length })}
                </ThemedText>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface PlannedGroupCardProps {
  group: PlannedTripGroup;
  visited: VisitedMap;
  theme: ThemePalette;
  onStart: () => void;
}

function PlannedGroupCard({ group, visited, theme, onStart }: PlannedGroupCardProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Prefer the meta-snapshot title; fall back to the live index if present.
  const indexed = getIndexedById(group.animeId);
  const title = group.name || indexed?.title || indexed?.cn || '';
  const accent = indexed?.color || theme.accent;
  const total = group.spots.length;
  const visitedCount = group.spots.filter((s) => visited[s.id] === true).length;
  const thumbs = group.spots.slice(0, 6);

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupDot, { backgroundColor: accent }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={1}>
            {title}
          </ThemedText>
          {group.cn && group.cn !== title ? (
            <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
              {group.cn}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText variant="captionSmall" tone="secondary" weight="700">
          {t('pilgrimage.plan.groupProgress', { visited: visitedCount, total })}
        </ThemedText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbRail}>
        {thumbs.map((spot) => (
          <View key={spot.id} style={styles.thumbWrap}>
            <SpotImage uri={spot.image} style={styles.thumb} recyclingKey={spot.id} />
            {visited[spot.id] ? (
              <View style={[styles.thumbCheck, { backgroundColor: theme.status.success }]}>
                <Ionicons name="checkmark" size={10} color={readableTextOn(theme.status.success)} />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <ThemedButton
        label={t('pilgrimage.plan.startTrip')}
        accessibilityLabel={t('pilgrimage.plan.startTripA11y', { title })}
        onPress={onStart}
        size="md"
        fullWidth
      />
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background.primary },
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
      backgroundColor: `${theme.background.secondary}CC`,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerText: { flex: 1, minWidth: 0, alignItems: 'center' },
    scrollContent: { paddingTop: Spacing.sm, gap: Spacing.md },
    sectionLabel: {
      paddingHorizontal: Spacing.screenPadding,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    emptyCard: {
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.xl,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      alignItems: 'center',
    },
    groupCard: {
      marginHorizontal: Spacing.screenPadding,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      gap: Spacing.sm,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupDot: { width: 8, height: 8, borderRadius: 4 },
    thumbRail: { gap: 8, paddingRight: 2 },
    thumbWrap: { width: 72, height: 54, borderRadius: 10, overflow: 'hidden' },
    thumb: { width: '100%', height: '100%' },
    thumbCheck: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uncategorizedCard: {
      marginHorizontal: Spacing.screenPadding,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.tertiary,
    },
  });
}
