// 巡禮相簿: one trip from the journal's time flow as an album, a chapter per
// work in the order they were visited, ending with the shots that are not at a
// known spot. Share renders the album itself as one image.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewInstance,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, useImage } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ThemedButton, ThemedIconButton, ThemedText } from '../../../components/themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { usePilgrimageJournalData } from '../../../hooks/usePilgrimageJournalData';
import {
  buildTripAlbum,
  type AlbumChapter,
} from '../../../libs/services/pilgrimage/journal-timeline';
import { buildJournalPreviewParams } from '../../../libs/services/pilgrimage/preview-capture';
import type { PilgrimageAlbumEntry } from '../../../libs/services/pilgrimage/album-captures';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import { formatJournalRange } from '../../../components/pilgrimage/journal/journal-dates';
import { BrandMark } from '../../../components/pilgrimage/BrandMark';
import { ProOptionChips } from '../../../components/pilgrimage/ProOptionChips';
import { PaywallSheet } from '../../../components/subscription/PaywallSheet';
import { useSubscription } from '../../../context/SubscriptionContext';
import {
  BRAND_MARKS,
  buildDateline,
  effectiveBrandMark,
  type BrandMarkStyle,
} from '../../../libs/services/pilgrimage/share-brand-mark';
import { captureSizeForPixels } from '../../../libs/services/pilgrimage/export-capture';
import { resolveWatermarkColor } from '../../../libs/services/pilgrimage/share-composer';

type AlbumQuality = 'standard' | 'high';

/** High-res album width in pixels (standard is the screen: ~1206 on a 3x phone). */
const HIGH_RES_ALBUM_WIDTH = 2160;
/** Pixel budget for one album image, so a long trip never exhausts memory. */
const HIGH_RES_MAX_PIXELS = 40_000_000;
/** Decode size for each photo in high-res, ~its cell width at 2160 px. */
const HIGH_RES_PHOTO_MAX_PX = 1080;

/**
 * Pixel size of the high-res album: 2160 wide, shrunk for very long albums to
 * stay within the pixel budget, but never smaller than the standard capture.
 */
function highResAlbumSize(layout: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const standardWidth = layout.width * PixelRatio.get();
  const byBudget = Math.sqrt((HIGH_RES_MAX_PIXELS * layout.width) / layout.height);
  const width = Math.round(Math.max(standardWidth, Math.min(HIGH_RES_ALBUM_WIDTH, byBudget)));
  return { width, height: Math.round((width * layout.height) / layout.width) };
}

function parseTime(value: string | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) ? n : null;
}

export default function PilgrimageJourneyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const from = parseTime(params.from);
  const to = parseTime(params.to);
  const { entries } = usePilgrimageJournalData();
  const album = useMemo(
    () => (from !== null && to !== null ? buildTripAlbum(entries, from, to) : null),
    [entries, from, to]
  );
  const albumRef = useRef<ViewInstance>(null);
  const [sharing, setSharing] = useState(false);
  const { isPro } = useSubscription();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [markChoice, setMarkChoice] = useState<BrandMarkStyle>(BRAND_MARKS[0].id);
  const [qualityChoice, setQualityChoice] = useState<AlbumQuality>('standard');
  // Rendered / exported values: Pro choices fall back once Pro is gone.
  const markStyle = effectiveBrandMark(BRAND_MARKS, markChoice, isPro);
  const quality: AlbumQuality = qualityChoice === 'high' && isPro ? 'high' : 'standard';
  const albumLayout = useRef<{ width: number; height: number } | null>(null);
  const onAlbumLayout = useCallback((e: LayoutChangeEvent) => {
    albumLayout.current = e.nativeEvent.layout;
  }, []);
  // High-res decodes every photo again at export size; share waits for them.
  const [highResReady, setHighResReady] = useState<ReadonlySet<string>>(() => new Set());
  const onHighResReady = useCallback((key: string) => {
    setHighResReady((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  const onQualityChange = useCallback((next: AlbumQuality) => {
    setHighResReady(new Set());
    setQualityChoice(next);
  }, []);
  const photoCount = album?.photos ?? 0;
  const preparingHighRes = quality === 'high' && highResReady.size < photoCount;

  const dateline = useMemo(() => {
    if (!album || from === null || to === null) return '';
    const spots = album.chapters.flatMap((c) => c.spots.map((s) => s.name));
    const place = spots.length > 1 ? `${spots[0]} +${spots.length - 1}` : (spots[0] ?? null);
    return buildDateline([formatJournalRange(from, to, t), place]);
  }, [album, from, to, t]);
  const markOptions = useMemo(
    () => BRAND_MARKS.map((o) => ({ ...o, label: t(`pilgrimage.brandMark.${o.id}`) })),
    [t]
  );
  const qualityOptions = useMemo(
    () => [
      { id: 'standard' as const, label: t('pilgrimage.journey.standard'), pro: false },
      { id: 'high' as const, label: t('pilgrimage.journey.high'), pro: true },
    ],
    [t]
  );

  const openEntry = useCallback(
    (entry: PilgrimageAlbumEntry) => {
      hapticsBridge.selection();
      router.push({
        pathname: '/compare/preview',
        params: buildJournalPreviewParams(entry, {
          importedLabel: t('pilgrimageUi.referencePicker.importedLabel'),
          fallbackColor: theme.accent,
        }),
      });
    },
    [router, t, theme.accent]
  );

  const share = useCallback(async () => {
    if (!albumRef.current || sharing || preparingHighRes) return;
    setSharing(true);
    try {
      const layout = albumLayout.current;
      const size =
        quality === 'high' && layout ? captureSizeForPixels(highResAlbumSize(layout)) : null;
      const uri = await captureRef(albumRef.current, {
        format: 'jpg',
        quality: 0.9,
        result: 'tmpfile',
        ...size,
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    } catch (error) {
      console.warn('[journey] share failed', error);
      Alert.alert(t('pilgrimage.journey.shareFailed'));
    } finally {
      setSharing(false);
    }
  }, [sharing, preparingHighRes, quality, t]);

  const hasPhotos = album !== null && album.photos > 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedIconButton
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            icon={(color) => <Ionicons name="arrow-back" size={20} color={color} />}
          />
          <ThemedText variant="titleLarge" weight="700" numberOfLines={1} style={styles.title}>
            {t('pilgrimage.journey.title')}
          </ThemedText>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          showsVerticalScrollIndicator={false}>
          {hasPhotos && from !== null && to !== null ? (
            <View
              ref={albumRef}
              collapsable={false}
              onLayout={onAlbumLayout}
              style={styles.album}>
              <View style={styles.cover}>
                <ThemedText variant="headlineLarge" weight="700">
                  {formatJournalRange(from, to, t)}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  {t('pilgrimage.journey.summary', {
                    works: album.works,
                    spots: album.spots,
                    photos: album.photos,
                  })}
                </ThemedText>
              </View>
              {album.chapters.map((chapter) => (
                <Chapter
                  key={chapter.work?.key ?? 'casual'}
                  chapter={chapter}
                  styles={styles}
                  onOpenEntry={openEntry}
                  highRes={quality === 'high'}
                  onHighResReady={onHighResReady}
                />
              ))}
              {markStyle !== 'none' ? (
                <View style={styles.mark}>
                  <BrandMark
                    style={markStyle}
                    dateline={dateline}
                    accent={theme.accent}
                    surface="page"
                    pageInk={resolveWatermarkColor(null, theme.background.primary)}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.empty}>
              <ThemedText variant="bodyMedium" tone="secondary" align="center">
                {t('pilgrimage.journey.empty')}
              </ThemedText>
            </View>
          )}
        </ScrollView>
        {hasPhotos ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <View style={styles.option}>
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                {t('pilgrimage.brandMark.title')}
              </ThemedText>
              <ProOptionChips
                options={markOptions}
                value={markStyle}
                isPro={isPro}
                accent={theme.accent}
                onChange={setMarkChoice}
                onLocked={() => setPaywallVisible(true)}
                accessibilityLabel={(o) => t('pilgrimage.brandMark.a11y', { label: o.label })}
              />
            </View>
            <View style={styles.option}>
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                {t('pilgrimage.journey.imageSize')}
              </ThemedText>
              <ProOptionChips
                options={qualityOptions}
                value={quality}
                isPro={isPro}
                accent={theme.accent}
                onChange={onQualityChange}
                onLocked={() => setPaywallVisible(true)}
                accessibilityLabel={(o) => o.label}
              />
            </View>
            <ThemedButton
              size="lg"
              fullWidth
              label={
                preparingHighRes ? t('pilgrimage.journey.preparing') : t('pilgrimage.journey.share')
              }
              loading={sharing || preparingHighRes}
              onPress={share}
            />
          </View>
        ) : null}
      </SafeAreaView>
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

function Chapter({
  chapter,
  styles,
  onOpenEntry,
  highRes,
  onHighResReady,
}: {
  chapter: AlbumChapter;
  styles: ReturnType<typeof makeStyles>;
  onOpenEntry: (entry: PilgrimageAlbumEntry) => void;
  highRes: boolean;
  onHighResReady: (key: string) => void;
}) {
  const t = useT();
  return (
    <View style={styles.chapter}>
      <View style={styles.chapterHeader}>
        <ThemedText variant="titleLarge" weight="700" numberOfLines={2}>
          {chapter.title ?? t('pilgrimage.journey.casual')}
        </ThemedText>
        {chapter.spots.map((spot) => (
          <ThemedText key={spot.name} variant="captionSmall" tone="secondary" numberOfLines={1}>
            {t('pilgrimage.journey.spotPhotos', { name: spot.name, count: spot.photos })}
          </ThemedText>
        ))}
      </View>
      <View style={styles.grid}>
        {chapter.entries.map((entry) => (
          <AlbumPhoto
            key={`${entry.capture.spotId}:${entry.capture.uri}`}
            entry={entry}
            styles={styles}
            onPress={() => onOpenEntry(entry)}
            highRes={highRes}
            onHighResReady={onHighResReady}
          />
        ))}
      </View>
    </View>
  );
}

function AlbumPhoto({
  entry,
  styles,
  onPress,
  highRes,
  onHighResReady,
}: {
  entry: PilgrimageAlbumEntry;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  highRes: boolean;
  onHighResReady: (key: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="imagebutton"
      onPress={onPress}
      style={({ pressed }) => [styles.photo, { opacity: pressed ? 0.85 : 1 }]}>
      {highRes ? (
        <HighResPhoto
          uri={entry.capture.uri}
          readyKey={`${entry.capture.spotId}:${entry.capture.uri}`}
          onReady={onHighResReady}
          style={styles.fill}
        />
      ) : (
        <SpotImage uri={entry.capture.uri} style={styles.fill} contentFit="cover" />
      )}
    </Pressable>
  );
}

/**
 * The photo decoded at export size (expo-image would otherwise decode at the
 * on-screen cell size, and a high-res capture would just upscale it). A photo
 * that fails to load reports ready too and keeps the honest error tile.
 */
function HighResPhoto({
  uri,
  readyKey,
  onReady,
  style,
}: {
  uri: string;
  readyKey: string;
  onReady: (key: string) => void;
  style: ReturnType<typeof makeStyles>['fill'];
}) {
  const [failed, setFailed] = useState(false);
  const image = useImage(
    uri,
    {
      maxWidth: HIGH_RES_PHOTO_MAX_PX,
      onError: () => setFailed(true),
    },
    [uri]
  );
  useEffect(() => {
    if (image || failed) onReady(readyKey);
  }, [image, failed, onReady, readyKey]);
  if (!image) return <SpotImage uri={failed ? null : uri} style={style} contentFit="cover" />;
  return <Image source={image} style={style} contentFit="cover" allowDownscaling={false} />;
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    safeArea: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    title: { flex: 1 },
    scrollView: { flex: 1 },
    album: {
      backgroundColor: theme.background.primary,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.lg,
      gap: Spacing.xl,
    },
    cover: { gap: Spacing.xs },
    mark: { alignItems: 'center' },
    option: { gap: Spacing.xxs, marginBottom: Spacing.sm },
    chapter: { gap: Spacing.sm },
    chapterHeader: { gap: Spacing.xxs },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    photo: {
      width: '48.5%',
      aspectRatio: 4 / 3,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
    },
    fill: { width: '100%', height: '100%' },
    empty: { paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.md },
    footer: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.glassBorder,
      backgroundColor: theme.background.primary,
    },
  });
}
