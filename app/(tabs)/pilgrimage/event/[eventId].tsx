import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';

import { LocalityAttributionFooter } from '../../../../components/pilgrimage/common/LocalityAttributionFooter';
import {
  LOCALITY_CARD_RADIUS,
  LocalityMiniStamp,
  localityCategoryIcon,
  localityEventAccent,
  localityMarkerPalette,
} from '../../../../components/pilgrimage/common/LocalityAesthetic';
import { EventStateChip } from '../../../../components/pilgrimage/detail/IntelEventBanner';
import { LocalityMapLegend } from '../../../../components/pilgrimage/map/LocalityMapLegend';
import {
  MapSurface,
  type BBox,
  type MapMarker,
  type MapSurfaceHandle,
} from '../../../../components/pilgrimage/map';
import {
  readableTextOn,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
  TranslatedText,
} from '../../../../components/themed';
import { Radius, Shadow, Spacing } from '../../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { useMapThemePref } from '../../../../hooks/useMapThemePref';
import { useI18n, useT, type TranslationKey } from '../../../../libs/i18n';
import { getIndexedById } from '../../../../libs/services/pilgrimage/anitabi-index';
import { bannerEnter, listItemEnter } from '../../../../libs/animations/presets';
import { resolveLocalIntelText } from '../../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import {
  resolveEventDateState,
  type EventDateState,
} from '../../../../libs/services/pilgrimage/local-intel/event-schedule';
import { formatMonthLabel } from '../../../../components/pilgrimage/detail/intel-format';
import {
  getLocalityEventDetail,
  type LocalityEventDetail,
  type LocalityEventStop,
} from '../../../../libs/services/pilgrimage/locality/event-detail';
import { buildCanonicalLocalityMarkers } from '../../../../libs/services/pilgrimage/locality/map-markers';
import { localityRepository } from '../../../../libs/services/pilgrimage/locality/locality-repository';
import type {
  EventCategory,
  EventId,
  LocalityEvent,
  RoleId,
} from '../../../../libs/services/pilgrimage/locality/types';
import { resolveMapModeWithClock } from '../../../../libs/services/pilgrimage/map-theme-clock';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '../../../../libs/services/pilgrimage/map-source-prefs';
import { getPilgrimageAnimeTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildPilgrimageDetailRoute,
  getPilgrimageEventDetailId,
} from '../../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  checkInStampStop,
  checkOutStampStop,
  loadVisitedStampStopsSync,
  type StampStopVisitedMap,
} from '../../../../libs/services/pilgrimage/visited-prefs';

function subscribeLocality(listener: () => void): () => void {
  return localityRepository.subscribe(listener);
}

function getLocalitySnapshot() {
  return localityRepository.getSnapshot();
}

export default function LocalityEventDetailScreen() {
  const params = useLocalSearchParams();
  const eventIdParam = getPilgrimageEventDetailId(params);
  const snapshot = useSyncExternalStore(
    subscribeLocality,
    getLocalitySnapshot,
    getLocalitySnapshot
  );
  const detail = useMemo(() => {
    void snapshot;
    return eventIdParam
      ? getLocalityEventDetail(eventIdParam as EventId, localityRepository)
      : null;
  }, [eventIdParam, snapshot]);
  return detail ? <EventDetailContent detail={detail} /> : <EventNotFound />;
}

function EventNotFound() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.notFoundHeader}>
        <ThemedIconButton
          accessibilityLabel={t('common.back')}
          variant="ghost"
          icon={(color) => <Ionicons name="chevron-back" size={20} color={color} />}
          onPress={() => router.back()}
        />
      </View>
      <View style={styles.notFound}>
        <Animated.View entering={bannerEnter()} style={styles.notFoundCardWrap}>
          <ThemedSurface padded radius={LOCALITY_CARD_RADIUS} style={styles.notFoundCard}>
            <Ionicons name="calendar-outline" size={36} color={theme.text.tertiary} />
            <ThemedText variant="titleLarge" weight="800" align="center">
              {t('pilgrimageUi.eventDetail.notFoundTitle')}
            </ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary" align="center">
              {t('pilgrimageUi.eventDetail.notFoundBody')}
            </ThemedText>
            <ThemedButton label={t('common.back')} onPress={() => router.back()} />
          </ThemedSurface>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

function EventDetailContent({ detail }: { detail: LocalityEventDetail }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const { language } = useI18n();
  const t = useT();
  const [visitedStops, setVisitedStops] = useState<StampStopVisitedMap>(loadVisitedStampStopsSync);
  const mapRef = useRef<MapSurfaceHandle>(null);

  const { event, stops } = detail;
  const eventState = resolveEventDateState(event, new Date());
  const eventText = resolveLocalIntelText(event.name, language);
  const descriptionText = resolveLocalIntelText(event.description, language);
  const accent = localityEventAccent(eventState, event.category, theme);
  const stampStops = stops.filter((stop) => stop.role.kind === 'stamp_stop');
  const collectedCount = stampStops.filter((stop) => visitedStops[stop.id]).length;
  const visitedRoleIds = new Set(Object.keys(visitedStops));
  const markers = buildCanonicalLocalityMarkers(localityRepository, localityMarkerPalette(theme), {
    eventId: event.id,
    language,
    visitedRoleIds,
  });
  const bounds = markerBounds(markers);
  const eventLegendKinds = [
    ...(markers.some((marker) => marker.kind === 'stamp') ? (['stamp'] as const) : []),
    ...(markers.some((marker) => marker.kind === 'festival') ? (['festival'] as const) : []),
  ];
  const styleUrl = resolveMapStyleUrl(
    resolveMapModeWithClock(mapThemePref, effectiveMode, new Date().getHours()),
    loadMapStyleOverrideSync()
  );
  const primaryAnime = event.animeIds
    .map((animeId) => getIndexedById(animeId))
    .find((anime) => anime !== null);
  const animeTitle = primaryAnime ? getPilgrimageAnimeTitles(primaryAnime).primary : null;
  const scheduleLabel = formatEventSchedule(event, eventState, language, t);
  const areaFallback = detail.areas[0]
    ? resolveLocalIntelText(detail.areas[0].name, language).value
    : t('pilgrimageUi.eventDetail.locationUnavailable');

  const handleMapReady = useCallback(() => {
    if (markers.length === 1) {
      mapRef.current?.focus?.({ lat: markers[0].lat, lng: markers[0].lng, zoom: 15 });
    } else if (bounds) {
      mapRef.current?.fitBounds?.(bounds, { animate: false });
    }
  }, [bounds, markers]);

  const openStopMaps = useCallback((stop: LocalityEventStop) => {
    if (!stop.mapsUrl) return;
    Linking.openURL(stop.mapsUrl).catch(() => undefined);
  }, []);

  const handleMarkerPress = useCallback(
    (marker: MapMarker) => {
      const stop = stops.find((candidate) => candidate.id === marker.roleId);
      if (stop) openStopMaps(stop);
    },
    [openStopMaps, stops]
  );

  const toggleCollected = useCallback(
    async (stop: LocalityEventStop) => {
      if (stop.role.kind !== 'stamp_stop') return;
      const wasCollected = visitedStops[stop.id] === true;
      setVisitedStops((current) => {
        const next = { ...current };
        if (wasCollected) delete next[stop.id];
        else next[stop.id] = true;
        return next;
      });
      if (wasCollected) await checkOutStampStop(stop.id as RoleId);
      else await checkInStampStop(stop.id as RoleId);
    },
    [visitedStops]
  );

  const renderStop = ({ item, index }: ListRenderItemInfo<LocalityEventStop>) => {
    const collected = visitedStops[item.id] === true;
    const address = item.address
      ? resolveLocalIntelText(item.address, language).value
      : areaFallback;
    return (
      <StopCard
        stop={item}
        index={index}
        address={address}
        collected={collected}
        accent={accent}
        theme={theme}
        onToggleCollected={toggleCollected}
        onOpenMaps={openStopMaps}
      />
    );
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.background.primary }]}
      edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <ThemedIconButton
          accessibilityLabel={t('common.back')}
          variant="ghost"
          icon={(color) => <Ionicons name="chevron-back" size={20} color={color} />}
          onPress={() => router.back()}
        />
        <ThemedText variant="titleMedium" weight="800" style={styles.headerTitle}>
          {t('pilgrimageUi.eventDetail.screenTitle')}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={stops}
        keyExtractor={(stop) => stop.id}
        renderItem={renderStop}
        initialNumToRender={8}
        windowSize={7}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        ItemSeparatorComponent={StopSeparator}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <Animated.View entering={listItemEnter(0, 40)} style={styles.heroWrap}>
              <LinearGradient
                colors={theme.gradient}
                style={[styles.hero, { borderColor: accent }]}>
                <View style={styles.heroTopRow}>
                  <View style={[styles.categoryStamp, { borderColor: accent }]}>
                    <Ionicons
                      name={localityCategoryIcon(event.category)}
                      size={18}
                      color={accent}
                    />
                    <ThemedText variant="captionSmall" weight="800" style={{ color: accent }}>
                      {t(categoryKey(event.category))}
                    </ThemedText>
                  </View>
                  <EventStateChip
                    state={eventState}
                    theme={theme}
                    ongoing={event.schedule.kind === 'ongoing'}
                  />
                </View>
                <TranslatedText
                  original={event.name.ja}
                  translated={eventText.value}
                  source={eventText.source}
                  variant="headlineMedium"
                  weight="800"
                />
                <TranslatedText
                  original={event.description.ja}
                  translated={descriptionText.value}
                  source={descriptionText.source}
                  variant="bodyMedium"
                  tone="secondary"
                />
                <View style={styles.scheduleRow}>
                  <Ionicons name="calendar-outline" size={16} color={accent} />
                  <View style={styles.scheduleCopy}>
                    <ThemedText variant="captionSmall" tone="tertiary">
                      {t('pilgrimageUi.eventDetail.schedule')}
                    </ThemedText>
                    <ThemedText variant="bodySmall" weight="700">
                      {scheduleLabel}
                    </ThemedText>
                  </View>
                </View>
                {primaryAnime && animeTitle ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={animeTitle}
                    onPress={() =>
                      router.push(
                        buildPilgrimageDetailRoute(primaryAnime.id, {
                          title: animeTitle,
                          poster: primaryAnime.cover,
                        })
                      )
                    }
                    style={({ pressed }) => [
                      styles.animeTie,
                      { borderColor: theme.glassBorder },
                      pressed && styles.pressed,
                    ]}>
                    <LocalityMiniStamp
                      accent={accent}
                      imageUri={primaryAnime.cover}
                      icon="sparkles-outline"
                    />
                    <View style={styles.animeCopy}>
                      <ThemedText variant="captionSmall" tone="tertiary">
                        {t('pilgrimageUi.eventDetail.animeTie')}
                      </ThemedText>
                      <ThemedText variant="bodySmall" weight="800" numberOfLines={2}>
                        {animeTitle}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
                  </Pressable>
                ) : null}
                <LocalityAttributionFooter provenance={event.provenance} />
              </LinearGradient>
            </Animated.View>

            {stampStops.length > 0 ? (
              <Animated.View entering={listItemEnter(1, 40)}>
                <ThemedSurface padded radius={LOCALITY_CARD_RADIUS} style={styles.progressCard}>
                  <View style={styles.sectionTitleRow}>
                    <LocalityMiniStamp accent={accent} icon="ticket-outline" size="sm" />
                    <ThemedText variant="titleMedium" weight="800" style={styles.sectionTitle}>
                      {t('pilgrimageUi.eventDetail.progress')}
                    </ThemedText>
                    <ThemedText variant="bodySmall" weight="800" style={{ color: accent }}>
                      {t('pilgrimageUi.eventDetail.progressValue', {
                        collected: collectedCount,
                        total: stampStops.length,
                      })}
                    </ThemedText>
                  </View>
                  <View
                    style={[styles.progressTrack, { backgroundColor: theme.background.tertiary }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: accent,
                          width: `${Math.round((collectedCount / stampStops.length) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </ThemedSurface>
              </Animated.View>
            ) : null}

            {markers.length > 0 ? (
              <Animated.View entering={listItemEnter(2, 40)}>
                <ThemedSurface padded={0} radius={LOCALITY_CARD_RADIUS} style={styles.mapCard}>
                  <View style={styles.mapHeading}>
                    <Ionicons name="map-outline" size={18} color={accent} />
                    <ThemedText variant="titleMedium" weight="800">
                      {t('pilgrimageUi.eventDetail.map')}
                    </ThemedText>
                  </View>
                  <View style={styles.mapFrame}>
                    <MapSurface
                      ref={mapRef}
                      markers={markers}
                      styleUrl={styleUrl}
                      center={{ lat: markers[0].lat, lng: markers[0].lng }}
                      zoom={markers.length === 1 ? 15 : 10}
                      onMarkerPress={handleMarkerPress}
                      onLoadSuccess={handleMapReady}
                    />
                    <LocalityMapLegend kinds={eventLegendKinds} style={styles.mapLegend} />
                  </View>
                </ThemedSurface>
              </Animated.View>
            ) : null}

            <Animated.View entering={listItemEnter(3, 40)} style={styles.stopHeading}>
              <ThemedText variant="headlineSmall" weight="800">
                {t('pilgrimageUi.eventDetail.stops')}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="tertiary">
                {t('news.events.stopCount', { count: detail.stopCount })}
              </ThemedText>
            </Animated.View>
            {stops.length === 0 ? (
              <ThemedSurface padded radius={LOCALITY_CARD_RADIUS} style={styles.emptyStops}>
                <Ionicons name="location-outline" size={24} color={theme.text.tertiary} />
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {t('pilgrimageUi.eventDetail.noStops')}
                </ThemedText>
              </ThemedSurface>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

function StopCard({
  stop,
  index,
  address,
  collected,
  accent,
  theme,
  onToggleCollected,
  onOpenMaps,
}: {
  stop: LocalityEventStop;
  index: number;
  address: string;
  collected: boolean;
  accent: string;
  theme: ThemePalette;
  onToggleCollected: (stop: LocalityEventStop) => void;
  onOpenMaps: (stop: LocalityEventStop) => void;
}) {
  const { language } = useI18n();
  const t = useT();
  const stopName = resolveLocalIntelText(stop.name, language);
  const isStamp = stop.role.kind === 'stamp_stop';
  return (
    <Animated.View entering={index < 8 ? listItemEnter(index, 16) : undefined}>
      <ThemedSurface
        padded
        radius={LOCALITY_CARD_RADIUS}
        style={[styles.stopCard, { borderColor: collected ? accent : theme.glassBorder }]}>
        <View style={styles.stopTopRow}>
          <View
            style={[
              styles.stopNumber,
              {
                backgroundColor: collected ? accent : theme.background.tertiary,
                borderColor: accent,
              },
            ]}>
            {collected ? (
              <Ionicons name="checkmark" size={16} color={readableTextOn(accent)} />
            ) : (
              <ThemedText variant="captionSmall" weight="800" style={{ color: accent }}>
                {index + 1}
              </ThemedText>
            )}
          </View>
          <View style={styles.stopCopy}>
            <TranslatedText
              original={stop.name.ja}
              translated={stopName.value}
              source={stopName.source}
              variant="bodyMedium"
              weight="800"
            />
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={theme.text.tertiary} />
              <ThemedText variant="bodySmall" tone="secondary" style={styles.locationCopy}>
                {address}
              </ThemedText>
            </View>
          </View>
        </View>
        <View style={styles.stopActions}>
          {isStamp ? (
            <ThemedButton
              label={
                collected
                  ? t('pilgrimageUi.eventDetail.uncollect')
                  : t('pilgrimageUi.eventDetail.collect')
              }
              variant={collected ? 'secondary' : 'primary'}
              size="sm"
              accent={accent}
              icon={
                <Ionicons
                  name={collected ? 'checkmark-circle' : 'ticket-outline'}
                  size={16}
                  color={collected ? theme.text.primary : readableTextOn(accent)}
                />
              }
              haptic={collected ? 'selection' : 'success'}
              onPress={() => onToggleCollected(stop)}
              style={styles.stopAction}
            />
          ) : null}
          <ThemedButton
            label={t('pilgrimageUi.eventDetail.openGoogleMaps')}
            accessibilityLabel={t('pilgrimageUi.eventDetail.openGoogleMapsA11y', {
              stop: stopName.value,
            })}
            variant="outline"
            size="sm"
            accent={accent}
            disabled={!stop.mapsUrl}
            icon={<Ionicons name="navigate-outline" size={16} color={accent} />}
            onPress={() => onOpenMaps(stop)}
            style={styles.stopAction}
          />
        </View>
        <LocalityAttributionFooter provenance={stop.provenance} variant="compact" />
      </ThemedSurface>
    </Animated.View>
  );
}

function StopSeparator() {
  return <View style={styles.stopSeparator} />;
}

function formatEventSchedule(
  event: LocalityEvent,
  state: EventDateState,
  language: string,
  t: ReturnType<typeof useT>
): string {
  if (event.schedule.kind === 'ongoing') {
    return event.schedule.since
      ? t('pilgrimageUi.eventDetail.since', { date: event.schedule.since })
      : t('pilgrimageUi.eventDetail.permanent');
  }
  const occurrence =
    state.state === 'active' || state.state === 'upcoming' || state.state === 'ended'
      ? state.occurrence
      : null;
  if (occurrence) {
    return occurrence.startsAt === occurrence.endsAt
      ? occurrence.startsAt
      : t('pilgrimageUi.eventDetail.dateRange', {
          start: occurrence.startsAt,
          end: occurrence.endsAt,
        });
  }
  if (state.state === 'unannounced') {
    return t('pilgrimageUi.intel.tbaAnnual', {
      month: formatMonthLabel(state.typicalMonth, language),
    });
  }
  return t('pilgrimageUi.eventDetail.dateTba');
}

function markerBounds(markers: readonly MapMarker[]): BBox | null {
  if (markers.length < 2) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const marker of markers) {
    north = Math.max(north, marker.lat);
    south = Math.min(south, marker.lat);
    east = Math.max(east, marker.lng);
    west = Math.min(west, marker.lng);
  }
  return { north, south, east, west };
}

function categoryKey(category: EventCategory): TranslationKey {
  const keys: Record<EventCategory, TranslationKey> = {
    stamp_rally: 'news.eventCategory.stampRally',
    festival: 'news.eventCategory.festival',
    collab_cafe: 'news.eventCategory.collabCafe',
    exhibition: 'news.eventCategory.exhibition',
    other: 'news.eventCategory.other',
  };
  return keys[category];
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  content: { paddingHorizontal: Spacing.screenPadding },
  headerContent: { gap: Spacing.md, paddingBottom: Spacing.md },
  heroWrap: { borderRadius: LOCALITY_CARD_RADIUS, ...Shadow.medium },
  hero: {
    borderWidth: 1,
    borderRadius: LOCALITY_CARD_RADIUS,
    padding: Spacing.lg,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  categoryStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    transform: [{ rotate: '-1deg' }],
  },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  scheduleCopy: { flex: 1, gap: Spacing.xxs },
  animeTie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  animeCopy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
  progressCard: { gap: Spacing.sm, ...Shadow.subtle },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { flex: 1 },
  progressTrack: { height: Spacing.xs, borderRadius: Radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.full },
  mapCard: { gap: Spacing.sm, ...Shadow.subtle },
  mapHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  mapFrame: { height: 300, position: 'relative' },
  mapLegend: { position: 'absolute', left: Spacing.sm, bottom: Spacing.sm },
  stopHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  emptyStops: { alignItems: 'center', gap: Spacing.sm },
  stopCard: { gap: Spacing.md, ...Shadow.subtle },
  stopTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  stopNumber: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopCopy: { flex: 1, minWidth: 0, gap: Spacing.xs },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  locationCopy: { flex: 1 },
  stopActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  stopAction: { flexGrow: 1 },
  stopSeparator: { height: Spacing.sm },
  pressed: { opacity: 0.72 },
  notFoundHeader: { paddingHorizontal: Spacing.sm },
  notFoundCardWrap: { alignSelf: 'stretch' },
  notFoundCard: {
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.medium,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
});
