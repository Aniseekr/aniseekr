// SpotSheet — bottom sheet shown when the user taps a pilgrimage spot. Lifts
// the heavy hero/scene-rail/actions out of the route file so they don't
// re-render with the rest of the screen.
//
// Phase 3 replaces the underlying <Modal> with @gorhom/bottom-sheet for true
// drag-to-dismiss + early-close UX.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ON_DARK, ThemedIconButton, ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import type { TranslationKey } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AtlasScene } from '../../../libs/services/pilgrimage/atlas/types';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { useStreetView } from '../../../hooks/useStreetView';
import {
  bearingDegrees,
  cardinalFromBearing,
  formatDistanceKm,
  getSpotConfidenceLabel,
  getSpotGeo,
  type CardinalKey,
} from './_helpers';
import { StreetViewCard } from '../street-view/StreetViewCard';
import { BestTimeCard } from './BestTimeCard';
import { IntelEventBanner } from './IntelEventBanner';
import { IntelShopsSection } from './IntelShopsSection';
import type { SpotSheetIntel } from '../../../hooks/usePilgrimageDetailIntel';
import {
  intelLinkUrl,
  type LocalIntelEvent,
  type LocalIntelShop,
} from '../../../libs/services/pilgrimage/local-intel/types';
import { buildPilgrimageEventDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';

const BEARING_LABEL_KEY: Record<CardinalKey, TranslationKey> = {
  n: 'pilgrimage.detail.bearing.n',
  ne: 'pilgrimage.detail.bearing.ne',
  e: 'pilgrimage.detail.bearing.e',
  se: 'pilgrimage.detail.bearing.se',
  s: 'pilgrimage.detail.bearing.s',
  sw: 'pilgrimage.detail.bearing.sw',
  w: 'pilgrimage.detail.bearing.w',
  nw: 'pilgrimage.detail.bearing.nw',
};

export interface SpotSheetProps {
  /** When null the sheet is closed. Setting it open animates the sheet up. */
  spot: PilgrimageSpot | null;
  scenes: readonly AtlasScene[];
  sceneCount: number;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  /** User's current coordinates, used to draw a bearing arrow to the spot. */
  userLocation?: { latitude: number; longitude: number } | null;
  visitedTarget: PilgrimageSpot | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  /**
   * Curated local-intel for this spot (best time / shops / event). All values
   * are web-verified data or real solar math — never placeholders (Rule 8).
   */
  intel?: SpotSheetIntel | null;
  theme: ThemePalette;
  onClose: () => void;
  onToggleVisited: (spot: PilgrimageSpot) => void;
  onToggleSaved: (spot: PilgrimageSpot) => void;
  onTogglePlanned: (spot: PilgrimageSpot) => void;
  onOpenMaps: (spot: PilgrimageSpot) => void;
  onStartCamera: (spot: PilgrimageSpot) => void;
  onFrameShot: (spot: PilgrimageSpot) => void;
  onIdentifyScene: (spot: PilgrimageSpot) => void;
}

function SpotSheetImpl({
  spot,
  scenes,
  sceneCount,
  themeColor,
  themeColorFg,
  distanceKm,
  userLocation = null,
  visitedTarget,
  visited,
  saved,
  planned,
  hasCapture,
  intel = null,
  theme,
  onClose,
  onToggleVisited,
  onToggleSaved,
  onTogglePlanned,
  onOpenMaps,
  onStartCamera,
  onFrameShot,
  onIdentifyScene,
}: SpotSheetProps) {
  const router = useRouter();
  const t = useT();
  const styles = useMemo(() => makeSheetStyles(theme), [theme]);
  const sheetRef = useRef<BottomSheet>(null);
  const sheetIndexRef = useRef(-1);
  const streetViewGateKey =
    spot ? `${spot.id}:${spot.lat}:${spot.lon}` : null;
  const [streetViewEnabledKey, setStreetViewEnabledKey] = useState<string | null>(null);
  const streetViewEnabled = streetViewEnabledKey === streetViewGateKey;
  const streetView = useStreetView(spot, { enabled: streetViewEnabled });
  const snapPoints = useMemo(() => ['62%', '92%'], []);

  // Open / close the sheet imperatively when `spot` flips. The parent owns the
  // active-spot state; we mirror it into snap-point control so the sheet
  // animates instead of just popping. Calling close() while `spot` is still
  // truthy is safe — onChange to -1 fires `onClose` which then clears it.
  useEffect(() => {
    if (spot) {
      sheetRef.current?.snapToIndex(0);
      if (sheetIndexRef.current === 0 && streetViewGateKey) {
        const frame = requestAnimationFrame(() => setStreetViewEnabledKey(streetViewGateKey));
        return () => cancelAnimationFrame(frame);
      }
    } else {
      sheetRef.current?.close();
    }
  }, [spot, streetViewGateKey]);

  const handleSheetChange = useCallback(
    (index: number) => {
      sheetIndexRef.current = index;
      if (index === -1) {
        setStreetViewEnabledKey(null);
        onClose();
      } else if (streetViewGateKey) {
        setStreetViewEnabledKey(streetViewGateKey);
      }
    },
    [onClose, streetViewGateKey]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleClosePress = useCallback(() => sheetRef.current?.close(), []);
  const handleToggleVisited = useCallback(() => {
    if (!spot) return;
    onToggleVisited(visitedTarget ?? spot);
  }, [onToggleVisited, spot, visitedTarget]);
  const handleToggleSaved = useCallback(() => {
    if (spot) onToggleSaved(spot);
  }, [onToggleSaved, spot]);
  const handleTogglePlanned = useCallback(() => {
    if (spot) onTogglePlanned(spot);
  }, [onTogglePlanned, spot]);
  const handleOpenMaps = useCallback(() => {
    if (spot) onOpenMaps(spot);
  }, [onOpenMaps, spot]);
  const handleStartCamera = useCallback(() => {
    if (spot) {
      if (!visited) onToggleVisited(visitedTarget ?? spot); // check-in on the way to the camera
      onStartCamera(spot);
    }
  }, [onStartCamera, onToggleVisited, spot, visited, visitedTarget]);
  const handleFrameShot = useCallback(() => {
    if (spot) onFrameShot(spot);
  }, [onFrameShot, spot]);
  const handleIdentifyScene = useCallback(() => {
    if (spot) onIdentifyScene(spot);
  }, [onIdentifyScene, spot]);

  const handleOpenShop = useCallback((shop: LocalIntelShop) => {
    Linking.openURL(intelLinkUrl(shop)).catch(() => undefined);
  }, []);
  const handleOpenEvent = useCallback(
    (event: LocalIntelEvent) => {
      router.push(buildPilgrimageEventDetailRoute(event.id));
    },
    [router]
  );

  // The BottomSheet element is rendered EXACTLY ONCE per parent mount: swapping
  // between a "closed" and "open" instance based on whether `spot` is null was
  // an earlier shape that left @gorhom/bottom-sheet's internal reanimated
  // state dirty after a close-while-animating, so subsequent opens silently
  // failed to snap. We always render the full sheet element and gate the
  // inner content with a null check; visibility is controlled imperatively
  // via the ref + snap index in the effect above.
  const spotGeo = spot ? getSpotGeo(spot) : null;
  const hasGeo = spotGeo !== null;
  const titles = spot ? getPilgrimageSpotTitles(spot) : { primary: '', secondary: '' };
  const sceneStack = spot ? scenes : [];
  const activeSceneIndex = 0;
  const bearing = spot && userLocation && spotGeo ? bearingDegrees(userLocation, spotGeo) : null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handleIndicator}
      onChange={handleSheetChange}
      backdropComponent={spot ? renderBackdrop : undefined}>
      <BottomSheetView style={styles.sheetContent}>
        {!spot ? (
          <View />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={[styles.cover, { backgroundColor: theme.background.tertiary }]} />
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.76)']}
                style={styles.sheetHeroGradient}
              />
              <View style={styles.heroText}>
                <ThemedText
                  variant="titleLarge"
                  weight="800"
                  numberOfLines={1}
                  style={{ color: ON_DARK }}>
                  {titles.primary}
                </ThemedText>
                {titles.secondary ? (
                  <ThemedText
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: 'rgba(255,255,255,0.72)' }}>
                    {titles.secondary}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedIconButton
                icon={(color) => <Ionicons name="scan-outline" size={17} color={color} />}
                accessibilityLabel={t('pilgrimage.identify.scanSceneA11y')}
                onPress={handleIdentifyScene}
                variant="solid"
                accent={themeColor}
                style={styles.identifyBtn}
              />
              <Pressable onPress={handleClosePress} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={ON_DARK} />
              </Pressable>
            </View>

            <View style={styles.sceneRail}>
              {sceneStack.map((scene, index) => (
                <View key={`${spot.id}-${index}`}>
                  <ThemedText variant="captionSmall" tone="secondary">
                    {[scene.episode, scene.time].filter(Boolean).join(' · ')}
                  </ThemedText>
                  {scene.episodeBasis === 'reference' || scene.timeBasis === 'reference' ? (
                    <ThemedText variant="captionSmall" tone="tertiary">
                      {t('pilgrimage.identify.referenceBasis')}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
            <ThemedText variant="bodySmall" tone="secondary">
              {spot.address || t('common.unknown')} · {getSpotConfidenceLabel(t, spot.confidence)}
            </ThemedText>
            {spot.lat === null || spot.lon === null ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('pilgrimage.detail.unverified')}
              </ThemedText>
            ) : null}

            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={15} color={theme.text.tertiary} />
              <ThemedText variant="bodySmall" tone="secondary">
                {distanceKm != null
                  ? t('pilgrimage.detail.distanceAway', { distance: formatDistanceKm(distanceKm) })
                  : sceneStack.length > 1
                    ? t('pilgrimage.detail.sceneOfCount', {
                        index: activeSceneIndex + 1,
                        count: sceneStack.length,
                      })
                    : t('pilgrimage.detail.sceneLocation')}
              </ThemedText>
              {bearing != null && distanceKm != null ? (
                <>
                  <Ionicons
                    name="arrow-up"
                    size={12}
                    color={theme.text.secondary}
                    style={{ transform: [{ rotate: `${Math.round(bearing)}deg` }] }}
                  />
                  <ThemedText variant="bodySmall" tone="secondary">
                    {t(BEARING_LABEL_KEY[cardinalFromBearing(bearing)])}
                  </ThemedText>
                </>
              ) : null}
            </View>

            {intel ? (
              <BestTimeCard
                bestTime={intel.bestTime}
                hint={intel.hint}
                themeColor={themeColor}
                theme={theme}
              />
            ) : null}

            <StreetViewCard
              status={streetView.status}
              result={streetView.result}
              onLookAroundUnavailable={streetView.reportLookAroundUnavailable}
            />

            {intel?.event ? (
              <IntelEventBanner
                event={intel.event.event}
                state={intel.event.state}
                theme={theme}
                onOpenEvent={handleOpenEvent}
              />
            ) : null}

            {intel && intel.shopRows.length > 0 ? (
              <IntelShopsSection rows={intel.shopRows} theme={theme} onOpenShop={handleOpenShop} />
            ) : null}


            <View style={styles.intentActions}>
              <Pressable
                onPress={handleToggleVisited}
                style={({ pressed }) => [
                  styles.intentBtn,
                  visited
                    ? {
                        backgroundColor: `${theme.status.success}22`,
                        borderColor: theme.status.success,
                      }
                    : {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                      },
                  pressed && { opacity: 0.84 },
                ]}>
                <Ionicons
                  name={visited ? 'checkmark-circle' : 'flag-outline'}
                  size={16}
                  color={visited ? theme.status.success : theme.text.secondary}
                />
                <ThemedText
                  variant="bodySmall"
                  weight="700"
                  style={{ color: visited ? theme.status.success : theme.text.secondary }}>
                  {visited ? t('pilgrimageUi.checkedIn') : t('pilgrimageUi.checkIn')}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleToggleSaved}
                style={({ pressed }) => [
                  styles.intentBtn,
                  saved
                    ? { backgroundColor: `${theme.status.info}22`, borderColor: theme.status.info }
                    : {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                      },
                  pressed && { opacity: 0.84 },
                ]}>
                <Ionicons
                  name={saved ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={saved ? theme.status.info : theme.text.secondary}
                />
                <ThemedText
                  variant="bodySmall"
                  weight="700"
                  style={{ color: saved ? theme.status.info : theme.text.secondary }}>
                  {t('common.save')}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleTogglePlanned}
                style={({ pressed }) => [
                  styles.intentBtn,
                  planned
                    ? {
                        backgroundColor: `${theme.status.warning}22`,
                        borderColor: theme.status.warning,
                      }
                    : {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                      },
                  pressed && { opacity: 0.84 },
                ]}>
                <Ionicons
                  name={planned ? 'flag' : 'flag-outline'}
                  size={16}
                  color={planned ? theme.status.warning : theme.text.secondary}
                />
                <ThemedText
                  variant="bodySmall"
                  weight="700"
                  style={{ color: planned ? theme.status.warning : theme.text.secondary }}>
                  {t('commonUi.plan')}
                </ThemedText>
              </Pressable>
            </View>

            <Pressable
              onPress={handleStartCamera}
              style={({ pressed }) => [
                styles.startCameraBtn,
                { backgroundColor: themeColor },
                pressed && { opacity: 0.86 },
              ]}>
              <Ionicons name="camera" size={18} color={themeColorFg} />
              <ThemedText variant="bodyMedium" weight="800" style={{ color: themeColorFg }}>
                {visited ? t('pilgrimageUi.startArCamera2') : t('pilgrimageUi.checkInPhoto')}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={handleFrameShot}
              style={({ pressed }) => [
                styles.frameShotBtn,
                { borderColor: hasCapture ? themeColor : theme.glassBorder },
                pressed && { opacity: 0.82 },
              ]}>
              <Ionicons name="image-outline" size={18} color={theme.text.primary} />
              <ThemedText variant="bodyMedium" weight="700">
                {t('pilgrimageUi.photoTipsBestFrame')}
              </ThemedText>
            </Pressable>

            <View style={styles.linkRow}>
              <Pressable
                onPress={handleOpenMaps}
                disabled={!hasGeo}
                style={({ pressed }) => [
                  styles.linkBtn,
                  !hasGeo && { opacity: 0.45 },
                  pressed && hasGeo && { opacity: 0.72 },
                ]}>
                <Ionicons name="location-outline" size={15} color={theme.text.tertiary} />
                <ThemedText variant="bodySmall" weight="700" tone="secondary">
                  {t('pilgrimageUi.openInMaps')}
                </ThemedText>
              </Pressable>
            </View>
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

function intelEqual(
  a: SpotSheetIntel | null | undefined,
  b: SpotSheetIntel | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.bestTime?.range === b.bestTime?.range &&
    a.bestTime?.dayOffset === b.bestTime?.dayOffset &&
    a.hint?.id === b.hint?.id &&
    a.shopRows.length === b.shopRows.length &&
    a.shopRows.every((row, i) => row.shop.id === b.shopRows[i]?.shop.id) &&
    a.event?.event.id === b.event?.event.id &&
    a.event?.state.state === b.event?.state.state
  );
}

function areEqual(prev: SpotSheetProps, next: SpotSheetProps): boolean {
  return (
    prev.spot === next.spot &&
    intelEqual(prev.intel, next.intel) &&
    prev.scenes === next.scenes &&
    prev.sceneCount === next.sceneCount &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.distanceKm === next.distanceKm &&
    prev.userLocation?.latitude === next.userLocation?.latitude &&
    prev.userLocation?.longitude === next.userLocation?.longitude &&
    prev.visitedTarget === next.visitedTarget &&
    prev.visited === next.visited &&
    prev.saved === next.saved &&
    prev.planned === next.planned &&
    prev.hasCapture === next.hasCapture &&
    prev.theme === next.theme &&
    prev.onClose === next.onClose &&
    prev.onToggleVisited === next.onToggleVisited &&
    prev.onToggleSaved === next.onToggleSaved &&
    prev.onTogglePlanned === next.onTogglePlanned &&
    prev.onOpenMaps === next.onOpenMaps &&
    prev.onStartCamera === next.onStartCamera &&
    prev.onFrameShot === next.onFrameShot &&
    prev.onIdentifyScene === next.onIdentifyScene &&
    prev.scenes === next.scenes
  );
}

export const SpotSheet = memo(SpotSheetImpl, areEqual);

function makeSheetStyles(theme: ThemePalette) {
  return StyleSheet.create({
    bg: {
      backgroundColor: theme.background.secondary,
    },
    handleIndicator: {
      backgroundColor: theme.glassBorder,
    },
    sheetContent: {
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 4,
      paddingBottom: Spacing.lg,
    },
    hero: {
      height: 140,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      marginBottom: Spacing.md,
      backgroundColor: theme.background.tertiary,
    },
    cover: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.background.tertiary,
    },
    sheetHeroGradient: {
      ...StyleSheet.absoluteFill,
    },
    heroText: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 14,
      gap: 2,
    },
    closeBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.sm,
      backgroundColor: 'rgba(0,0,0,0.46)',
    },
    identifyBtn: {
      position: 'absolute',
      top: 8,
      left: 8,
    },
    sceneRail: {
      gap: 8,
      paddingRight: 2,
      marginTop: -4,
      marginBottom: Spacing.md,
    },
    sceneThumbBtn: {
      width: 78,
      height: 56,
      borderRadius: Radius.card,
      overflow: 'hidden',
      borderWidth: 2,
      backgroundColor: theme.background.tertiary,
    },
    sceneThumb: {
      width: '100%',
      height: '100%',
    },
    sceneThumbScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.14)',
    },
    sceneIndexPill: {
      position: 'absolute',
      left: 5,
      bottom: 5,
      maxWidth: 64,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    sceneVisitedDot: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.status.success,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    originRow: {
      marginBottom: Spacing.md,
    },
    intentActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    intentBtn: {
      flex: 1,
      height: 40,
      borderRadius: Radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    startCameraBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 56,
      borderRadius: Radius.md,
      marginBottom: 10,
    },
    frameShotBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 54,
      borderRadius: Radius.md,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: 8,
      height: 44,
    },
    linkBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    linkDivider: {
      width: StyleSheet.hairlineWidth,
      marginVertical: 8,
    },
  });
}
