// Pilgrimage walk: start a recording, watch it, and look back at a saved one.
// One screen with three faces — idle, recording, saved (`?id=`) — over the
// same map, so finishing a walk turns into its summary without a push.
import Ionicons from '@expo/vector-icons/Ionicons';
import { File, Paths } from 'expo-file-system';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDistanceKm } from '@/components/pilgrimage/detail/_helpers';
import { LocationPermissionSheet } from '@/components/pilgrimage/LocationPermissionSheet';
import { MapSurface } from '@/components/pilgrimage/map/MapSurface';
import { PaywallSheet } from '@/components/subscription/PaywallSheet';
import { ProBadge } from '@/components/subscription/ProBadge';
import { ThemedButton, ThemedIconButton, ThemedSurface, ThemedText } from '@/components/themed';
import { bottomPad, Radius, Size, Spacing } from '@/constants/DesignSystem';
import { useSubscription } from '@/context/SubscriptionContext';
import { useTheme } from '@/context/ThemeContext';
import { useMapThemePref } from '@/hooks/useMapThemePref';
import { useAtlasWorkMap } from '@/hooks/useStamps';
import { useActiveTrack, useTrackIndex } from '@/hooks/useTrackRecording';
import { useT } from '@/libs/i18n';
import { locationService } from '@/libs/services/pilgrimage/location-service';
import type {
  MapMarker,
  MapRoute,
  MapSurfaceHandle,
} from '@/libs/services/pilgrimage/map-engine/types';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '@/libs/services/pilgrimage/map-source-prefs';
import { resolveMapModeWithClock } from '@/libs/services/pilgrimage/map-theme-clock';
import { getPilgrimageAnimeTitles } from '@/libs/services/pilgrimage/pilgrimage-localization';
import { buildGpx, gpxFileName } from '@/libs/services/pilgrimage/track/track-gpx';
import {
  finishRecording,
  pauseRecording,
  resumeRecording,
  startRecording,
} from '@/libs/services/pilgrimage/track/track-recorder';
import {
  formatTrackDuration,
  simplifyTrack,
  trackSegments,
  unpackPoint,
  TRACK_MAX_ACCURACY_METERS,
  type TrackPoint,
} from '@/libs/services/pilgrimage/track/track-math';
import {
  deleteTrack,
  loadTrackIndexSync,
  readActivePoints,
  readTrack,
  updateTrack,
  type ActiveTrack,
  type SavedTrack,
  type TrackSpotEvent,
} from '@/libs/services/pilgrimage/track/track-store';
import { checkInSpot } from '@/libs/services/pilgrimage/visited-prefs';
import { formatPackDate } from '@/libs/services/pilgrimage/offline-pack/pack-format';
import { hapticsBridge } from '@/modules/haptics/hapticsBridge';

const JAPAN = { lat: 36.5, lng: 138.0 };

/** "2026/11/13 09:15": two walks on one day need the start time to tell them apart. */
function formatWalkStart(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatPackDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const FOLLOW_ZOOM = 16;
/** Long walks are thinned for drawing only; the saved track keeps every point. */
const DRAW_TOLERANCE_METERS = 4;

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const active = useActiveTrack();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {id ? <SavedView id={id} /> : active ? <RecordingView active={active} /> : <IdleView />}
    </>
  );
}

// ── Shared shell: map behind, one panel at the bottom ───────────────────────

function useRouteLines(points: readonly TrackPoint[], color: string): MapRoute[] {
  return useMemo(
    () =>
      trackSegments(simplifyTrack(points, DRAW_TOLERANCE_METERS)).map((segment, index) => ({
        id: `walk-${index}`,
        kind: 'gpx' as const,
        color,
        coords: segment.map((p) => ({ lat: p.lat, lng: p.lon })),
      })),
    [points, color]
  );
}

function stampMarkers(events: readonly TrackSpotEvent[], color: string): MapMarker[] {
  return events.map((event) => ({
    id: `walk-stamp:${event.spotId}`,
    lat: event.lat,
    lng: event.lon,
    kind: 'spot',
    title: event.name,
    color,
    visited: true,
    markerMode: 'dot',
  }));
}

function Shell({
  mapRef,
  routes,
  markers,
  user,
  center,
  zoom,
  onPanned,
  topRight,
  children,
}: {
  mapRef?: React.RefObject<MapSurfaceHandle | null>;
  routes: readonly MapRoute[];
  markers: readonly MapMarker[];
  user: { lat: number; lng: number } | null;
  center: { lat: number; lng: number };
  zoom: number;
  onPanned?: () => void;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, effectiveMode } = useTheme();
  const { pref } = useMapThemePref();
  const [styleOverride] = useState(loadMapStyleOverrideSync);
  const styleUrl = resolveMapStyleUrl(
    resolveMapModeWithClock(pref, effectiveMode, new Date().getHours()),
    styleOverride
  );
  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <MapSurface
        ref={mapRef}
        markers={markers}
        routes={routes}
        user={user}
        center={center}
        zoom={zoom}
        styleUrl={styleUrl}
        onPanned={onPanned}
      />
      <View
        style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}
        pointerEvents="box-none">
        <ThemedIconButton
          accessibilityLabel={t('common.back')}
          icon={(c) => <Ionicons name="arrow-back" size={20} color={c} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/pilgrimage'))}
        />
        <View style={styles.flex} pointerEvents="none" />
        {topRight}
      </View>
      <View style={styles.panelWrap} pointerEvents="box-none">
        <ThemedSurface
          variant="elevated"
          radius={Radius.xl}
          style={[styles.panel, { paddingBottom: bottomPad(insets) + Spacing.md }]}>
          {children}
        </ThemedSurface>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText variant="headlineSmall" weight="800" style={styles.tabular}>
        {value}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="secondary">
        {label}
      </ThemedText>
    </View>
  );
}

// ── Idle ───────────────────────────────────────────────────────────────────

function IdleView() {
  const t = useT();
  const router = useRouter();
  const walks = useTrackIndex();
  const mapRef = useRef<MapSurfaceHandle>(null);
  const [here, setHere] = useState(() => locationService.getCached());
  useEffect(() => {
    if (here) return;
    let cancelled = false;
    // Already-granted permission only; this never prompts.
    void locationService.getLastKnown().then((known) => {
      if (cancelled || !known) return;
      setHere(known);
      mapRef.current?.recenter(known.latitude, known.longitude, FOLLOW_ZOOM, { animate: false });
    });
    return () => {
      cancelled = true;
    };
    // Runs once: a later fix belongs to the recording, not this idle map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [starting, setStarting] = useState(false);
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setMessage(null);
    const result = await startRecording();
    setStarting(false);
    if (result === 'denied') setDenied(true);
    else if (result === 'failed') setMessage(t('pilgrimage.track.startFailed'));
  };

  return (
    <Shell
      mapRef={mapRef}
      routes={[]}
      markers={[]}
      user={here ? { lat: here.latitude, lng: here.longitude } : null}
      center={here ? { lat: here.latitude, lng: here.longitude } : JAPAN}
      zoom={here ? FOLLOW_ZOOM : 4.2}>
      <ThemedText variant="titleLarge" weight="800">
        {t('pilgrimage.track.title')}
      </ThemedText>
      <ThemedText variant="bodySmall" tone="secondary">
        {t('pilgrimage.track.disclosure')}
      </ThemedText>
      {message ? (
        <ThemedText variant="caption" tone="error">
          {message}
        </ThemedText>
      ) : null}
      <ThemedButton
        label={t('pilgrimage.track.start')}
        size="lg"
        fullWidth
        loading={starting}
        haptic="success"
        onPress={() => void start()}
      />
      {walks.length > 0 ? (
        <View>
          <ThemedText variant="caption" weight="700" tone="secondary">
            {t('pilgrimage.track.pastWalks')}
          </ThemedText>
          {walks.slice(0, 3).map((walk) => (
            <Pressable
              key={walk.id}
              onPress={() => {
                hapticsBridge.tap();
                router.push({ pathname: '/pilgrimage/track', params: { id: walk.id } });
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <ThemedText variant="bodyMedium" weight="700" style={styles.flex}>
                {formatWalkStart(walk.startedAt)}
              </ThemedText>
              <ThemedText variant="caption" tone="secondary" style={styles.tabular}>
                {`${formatDistanceKm(walk.meters / 1000)} · ${formatTrackDuration(walk.movingMs)}`}
              </ThemedText>
              <WalkChevron />
            </Pressable>
          ))}
        </View>
      ) : null}
      <LocationPermissionSheet
        visible={denied}
        onDismiss={() => setDenied(false)}
        title={t('pilgrimage.track.deniedTitle')}
        body={t('pilgrimage.track.deniedBody')}
        primaryLabel={t('tabs.pilgrimageHome.openSettings')}
      />
    </Shell>
  );
}

function WalkChevron() {
  const { theme } = useTheme();
  return <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />;
}

// ── Recording ──────────────────────────────────────────────────────────────

/** Ticks once a second on its own so the rest of the panel does not re-render. */
function Elapsed({ since, frozenAt }: { since: number; frozenAt: number | null }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (frozenAt !== null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [frozenAt]);
  return (
    <Stat
      value={formatTrackDuration((frozenAt ?? now) - since)}
      label={t('pilgrimage.track.time')}
    />
  );
}

function RecordingView({ active }: { active: ActiveTrack }) {
  const t = useT();
  const router = useRouter();
  const { theme } = useTheme();
  const mapRef = useRef<MapSurfaceHandle>(null);
  const following = useRef(true);
  const [busy, setBusy] = useState(false);
  // Each batch reads only the points it added; the earlier ones are already here.
  const held = useRef<{ id: string; points: TrackPoint[] }>({ id: '', points: [] });
  const points = useMemo(() => {
    const prev = held.current.id === active.id ? held.current.points : [];
    const next =
      active.count > prev.length ? [...prev, ...readActivePoints(active, prev.length)] : prev;
    held.current = { id: active.id, points: next };
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, active.count]);
  const routes = useRouteLines(points, theme.accent);
  const markers = useMemo(
    () => stampMarkers(active.stamped, theme.accent),
    [active.stamped, theme.accent]
  );
  const last = active.last;
  const [startCenter] = useState(() => {
    const cached = locationService.getCached();
    return last
      ? { lat: last.lat, lng: last.lon }
      : cached
        ? { lat: cached.latitude, lng: cached.longitude }
        : null;
  });

  useEffect(() => {
    if (last && following.current) {
      mapRef.current?.recenter(last.lat, last.lon, FOLLOW_ZOOM, { animate: true });
    }
  }, [last]);

  const paused = active.status === 'paused';
  const lowAccuracy = active.lastRawAcc !== null && active.lastRawAcc > TRACK_MAX_ACCURACY_METERS;
  const status = paused
    ? t('pilgrimage.track.paused')
    : lowAccuracy
      ? t('pilgrimage.track.lowAccuracy')
      : active.count === 0
        ? t('pilgrimage.track.locating')
        : t('pilgrimage.track.recording');

  const finish = async () => {
    setBusy(true);
    const saved = await finishRecording();
    setBusy(false);
    if (saved) router.setParams({ id: saved.id });
    else Alert.alert(t('pilgrimage.track.noRoute'), undefined, [{ text: t('common.ok') }]);
  };

  const togglePause = async () => {
    setBusy(true);
    if (paused) await resumeRecording();
    else await pauseRecording();
    setBusy(false);
  };

  return (
    <Shell
      mapRef={mapRef}
      routes={routes}
      markers={markers}
      user={last ? { lat: last.lat, lng: last.lon } : null}
      center={startCenter ?? JAPAN}
      zoom={startCenter ? FOLLOW_ZOOM : 4.2}
      onPanned={() => {
        following.current = false;
      }}
      topRight={
        <ThemedIconButton
          accessibilityLabel={t('pilgrimage.track.locate')}
          icon={(c) => <Ionicons name="navigate" size={18} color={c} />}
          onPress={() => {
            following.current = true;
            if (last) mapRef.current?.recenter(last.lat, last.lon, FOLLOW_ZOOM, { animate: true });
          }}
        />
      }>
      <View style={styles.statusRow}>
        <View
          style={[
            styles.dot,
            { backgroundColor: paused || lowAccuracy ? theme.text.tertiary : theme.accent },
          ]}
        />
        <ThemedText variant="titleSmall" weight="800">
          {status}
        </ThemedText>
      </View>
      <View style={styles.stats}>
        <Stat
          value={formatDistanceKm(active.meters / 1000)}
          label={t('pilgrimage.track.distance')}
        />
        <Elapsed since={active.startedAt} frozenAt={paused ? (active.pausedAt ?? null) : null} />
        <Stat value={String(active.stamped.length)} label={t('pilgrimage.stamps.onsite')} />
      </View>
      {!active.canStamp ? (
        <ThemedText variant="caption" tone="tertiary">
          {t('pilgrimage.track.noAutoStamp')}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <ThemedButton
            variant="secondary"
            label={t(paused ? 'pilgrimage.track.resume' : 'pilgrimage.track.pause')}
            fullWidth
            disabled={busy}
            onPress={() => void togglePause()}
          />
        </View>
        <View style={styles.flex}>
          <ThemedButton
            label={t('pilgrimage.track.finish')}
            fullWidth
            loading={busy}
            haptic="success"
            onPress={() => void finish()}
          />
        </View>
      </View>
    </Shell>
  );
}

// ── Saved walk ─────────────────────────────────────────────────────────────

function SavedView({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const { theme } = useTheme();
  const works = useAtlasWorkMap();
  const mapRef = useRef<MapSurfaceHandle>(null);
  const [summary] = useState(() => loadTrackIndexSync().find((row) => row.id === id) ?? null);
  const [track, setTrack] = useState<SavedTrack | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readTrack(id).then((loaded) => {
      if (cancelled) return;
      if (loaded) setTrack(loaded);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const { isPro } = useSubscription();
  const [paywall, setPaywall] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportGpx = async () => {
    if (!track) return;
    if (!isPro) {
      setPaywall(true);
      return;
    }
    setExporting(true);
    try {
      const file = new File(Paths.cache, gpxFileName(track.startedAt));
      if (!file.exists) file.create({ intermediates: true });
      await file.write(buildGpx(track, formatPackDate(track.startedAt)));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/gpx+xml',
        UTI: 'com.topografix.gpx',
      });
    } catch (error) {
      console.warn('[track] gpx export failed', error);
      Alert.alert(t('pilgrimage.track.exportFailed'), undefined, [{ text: t('common.ok') }]);
    } finally {
      setExporting(false);
    }
  };

  const points = useMemo(() => (track ? track.points.map(unpackPoint) : []), [track]);
  const routes = useRouteLines(points, theme.accent);
  const markers = useMemo(
    () => stampMarkers(track?.stampedSpots ?? [], theme.accent),
    [track, theme.accent]
  );
  const bounds = track?.bounds ?? summary?.bounds ?? null;

  // Fit once per walk, after the map has mounted. The panel covers the lower
  // half of the map, so the box is stretched south to lift the route above it.
  const fittedId = useRef<string | null>(null);
  useEffect(() => {
    const box = track?.bounds;
    if (!box || fittedId.current === track.id) return undefined;
    const timer = setTimeout(() => {
      fittedId.current = track.id;
      const latSpan = Math.max(box.maxLat - box.minLat, 0.0015);
      const lonSpan = Math.max(box.maxLon - box.minLon, 0.0015);
      mapRef.current?.fitBounds?.(
        {
          north: box.maxLat + latSpan * 0.45,
          south: box.minLat - latSpan * 2,
          east: box.maxLon + lonSpan * 0.2,
          west: box.minLon - lonSpan * 0.2,
        },
        { animate: false }
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [track]);

  const stampPassed = useCallback(
    async (event: TrackSpotEvent) => {
      if (!track) return;
      hapticsBridge.success();
      // The walk itself proves the visit, dated when the user passed.
      await checkInSpot(event.spotId, event.at, {
        onsiteVia: 'track',
        meta: { workKey: event.workKey, name: event.name, lat: event.lat, lon: event.lon },
      });
      const next: SavedTrack = {
        ...track,
        stampedSpots: [...track.stampedSpots, event],
        passed: track.passed.filter((row) => row.spotId !== event.spotId),
      };
      setTrack(next);
      await updateTrack(next);
    },
    [track]
  );

  const confirmDelete = () => {
    hapticsBridge.warning();
    Alert.alert(t('pilgrimage.track.deleteTitle'), t('pilgrimage.track.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteTrack(id).then(() =>
            router.canGoBack() ? router.back() : router.replace('/pilgrimage')
          );
        },
      },
    ]);
  };

  const shown = track ?? summary;
  const titleOf = (workKey: string) => {
    const work = works.get(workKey);
    return work ? getPilgrimageAnimeTitles(work).primary : workKey;
  };

  return (
    <Shell
      mapRef={mapRef}
      routes={routes}
      markers={markers}
      user={null}
      center={
        bounds
          ? { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLon + bounds.maxLon) / 2 }
          : JAPAN
      }
      zoom={bounds ? 14 : 4.2}
      topRight={
        shown ? (
          <ThemedIconButton
            accessibilityLabel={t('pilgrimage.track.delete')}
            icon={(c) => <Ionicons name="trash-outline" size={18} color={c} />}
            onPress={confirmDelete}
          />
        ) : null
      }>
      {shown ? (
        <ScrollView style={styles.savedScroll} contentContainerStyle={styles.savedBody}>
          <ThemedText variant="titleLarge" weight="800">
            {formatWalkStart(shown.startedAt)}
          </ThemedText>
          <View style={styles.stats}>
            <Stat
              value={formatDistanceKm(shown.meters / 1000)}
              label={t('pilgrimage.track.distance')}
            />
            <Stat
              value={formatTrackDuration(shown.movingMs)}
              label={t('pilgrimage.track.movingTime')}
            />
            <Stat
              value={String(track ? track.stampedSpots.length : shown.stamped)}
              label={t('pilgrimage.stamps.onsite')}
            />
          </View>
          {track?.stampedSpots.map((event) => (
            <View key={event.spotId} style={[styles.row, { borderBottomColor: theme.glassBorder }]}>
              <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
              <View style={styles.flex}>
                <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
                  {event.name}
                </ThemedText>
                <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                  {titleOf(event.workKey)}
                </ThemedText>
              </View>
            </View>
          ))}
          {track && track.passed.length > 0 ? (
            <View>
              <ThemedText variant="caption" weight="700" tone="secondary">
                {t('pilgrimage.track.passed')}
              </ThemedText>
              {track.passed.map((event) => (
                <View
                  key={event.spotId}
                  style={[styles.row, { borderBottomColor: theme.glassBorder }]}>
                  <View style={styles.flex}>
                    <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
                      {event.name}
                    </ThemedText>
                    <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                      {titleOf(event.workKey)}
                    </ThemedText>
                  </View>
                  <ThemedButton
                    size="sm"
                    variant="secondary"
                    label={t('pilgrimage.track.stampIt')}
                    accessibilityLabel={`${t('pilgrimage.track.stampIt')}, ${event.name}`}
                    haptic="none"
                    onPress={() => void stampPassed(event)}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {track ? (
            <ThemedButton
              variant="secondary"
              label={t('pilgrimage.track.exportGpx')}
              fullWidth
              loading={exporting}
              iconRight={<ProBadge locked={!isPro} />}
              onPress={() => void exportGpx()}
            />
          ) : null}
        </ScrollView>
      ) : (
        <ThemedText variant="bodyMedium" tone="secondary">
          {missing ? t('pilgrimage.track.notFound') : ''}
        </ThemedText>
      )}
      <PaywallSheet visible={paywall} onClose={() => setPaywall(false)} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  tabular: { fontVariant: ['tabular-nums'] },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenPadding,
  },
  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, gap: Spacing.xxs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.minTouchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  savedScroll: { maxHeight: 360 },
  savedBody: { gap: Spacing.md },
});
