// 巡禮相簿: one trip from the journal's time flow as an album, a chapter per
// work in the order they were visited, ending with the shots that are not at a
// known spot. Share renders the album itself as one image.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, type ViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
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
    if (!albumRef.current || sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(albumRef.current, {
        format: 'jpg',
        quality: 0.9,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    } catch (error) {
      console.warn('[journey] share failed', error);
      Alert.alert(t('pilgrimage.journey.shareFailed'));
    } finally {
      setSharing(false);
    }
  }, [sharing, t]);

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
            <View ref={albumRef} collapsable={false} style={styles.album}>
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
                />
              ))}
              <ThemedText variant="captionSmall" tone="tertiary" align="center">
                Aniseekr
              </ThemedText>
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
            <ThemedButton
              size="lg"
              fullWidth
              label={t('pilgrimage.journey.share')}
              loading={sharing}
              onPress={share}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function Chapter({
  chapter,
  styles,
  onOpenEntry,
}: {
  chapter: AlbumChapter;
  styles: ReturnType<typeof makeStyles>;
  onOpenEntry: (entry: PilgrimageAlbumEntry) => void;
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
}: {
  entry: PilgrimageAlbumEntry;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="imagebutton"
      onPress={onPress}
      style={({ pressed }) => [styles.photo, { opacity: pressed ? 0.85 : 1 }]}>
      <SpotImage uri={entry.capture.uri} style={styles.fill} contentFit="cover" />
    </Pressable>
  );
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
