// 集章帳: one work's stamps. Stamped spots paint on frame 1 from the on-device
// stamp records; the empty slots fill in once the work's spot list resolves.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { readableTextOn, ScreenHeader, ThemedButton, ThemedText } from '@/components/themed';
import { Radius, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { useT } from '@/libs/i18n';
import { hapticsBridge } from '@/modules/haptics/hapticsBridge';
import { StampMark } from '@/components/pilgrimage/rally/StampMark';
import { formatStampDate } from '@/components/pilgrimage/rally/rally-format';
import { buildPilgrimageDetailRoute } from '@/libs/services/pilgrimage/pilgrimage-navigation';
import { pilgrimageRepository } from '@/libs/services/pilgrimage/pilgrimage-repository';
import { getPilgrimageSpotTitles } from '@/libs/services/pilgrimage/pilgrimage-localization';
import { loadStampsSync } from '@/libs/services/pilgrimage/visited-prefs';
import type { Stamp } from '@/libs/services/pilgrimage/stamp-details';
import type { PilgrimageSpot, PilgrimageWork } from '@/libs/services/pilgrimage/types';
import { getStringParam } from '@/libs/utils/route-params';

const COLUMNS = 4;
const STAMP = 64;

interface Cell {
  spotId: string;
  name: string;
  /** Episode number when the spot has one, else its place in the spot list. */
  mark: number | string;
  stamp: Stamp | null;
}

function episodeMark(spot: PilgrimageSpot, index: number): number | string {
  for (const scene of spot.scenes) {
    const match = scene.episode.match(/\d+/);
    if (match) return `EP${match[0]}`;
  }
  return index + 1;
}

/** On-site stamps first (newest first), then manual notes, then empty slots in list order. */
function buildCells(work: PilgrimageWork | null, stamps: readonly Stamp[], workKey: string): Cell[] {
  const byId = new Map(stamps.map((stamp) => [stamp.spotId, stamp]));
  const cells: Cell[] = work
    ? work.spots.map((spot, index) => ({
        spotId: spot.id,
        name: getPilgrimageSpotTitles(spot).primary,
        mark: episodeMark(spot, index),
        stamp: byId.get(spot.id) ?? null,
      }))
    : stamps
        .filter((stamp) => stamp.meta?.workKey === workKey)
        .map((stamp, index) => ({
          spotId: stamp.spotId,
          name: stamp.meta?.name ?? '',
          mark: index + 1,
          stamp,
        }));
  const rank = (cell: Cell) => (cell.stamp?.onsiteAt ? 0 : cell.stamp ? 1 : 2);
  return cells
    .map((cell, index) => ({ cell, index }))
    .sort(
      (a, b) =>
        rank(a.cell) - rank(b.cell) ||
        (b.cell.stamp?.onsiteAt ?? b.cell.stamp?.at ?? 0) -
          (a.cell.stamp?.onsiteAt ?? a.cell.stamp?.at ?? 0) ||
        a.index - b.index
    )
    .map(({ cell }) => cell);
}

export default function WorkStampBookScreen() {
  const params = useLocalSearchParams();
  const workKey = getStringParam(params, 'workKey') ?? '';
  const titleParam = getStringParam(params, 'title');
  const posterParam = getStringParam(params, 'poster');
  const themeColorParam = getStringParam(params, 'themeColor');
  const router = useRouter();
  const t = useT();
  const { theme } = useTheme();
  const accent = themeColorParam || theme.accent;

  const [stamps, setStamps] = useState<Stamp[]>(loadStampsSync);
  const [work, setWork] = useState<PilgrimageWork | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setFailed(false);
    pilgrimageRepository
      .getSpotsByKey(workKey)
      .then((next) => {
        if (cancelled) return;
        if (next) setWork(next);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workKey]);
  useEffect(() => load(), [load]);
  // Stamps made on the work page show up when the user comes back here.
  useFocusEffect(useCallback(() => setStamps(loadStampsSync()), []));

  // Opened without chrome params (deep link): the cover follows once the work resolves.
  const bgmId = work?.bgm?.[0];
  const poster =
    posterParam ?? (bgmId ? `https://api.bgm.tv/v0/subjects/${bgmId}/image?type=common` : null);
  const cells = useMemo(() => buildCells(work, stamps, workKey), [work, stamps, workKey]);
  const onsite = cells.filter((cell) => cell.stamp?.onsiteAt).length;
  const manual = cells.filter((cell) => cell.stamp && !cell.stamp.onsiteAt).length;
  const complete = work !== null && cells.length > 0 && onsite + manual === cells.length;

  const openSpot = useCallback(
    (cell: Cell) => {
      hapticsBridge.tap();
      router.push(
        buildPilgrimageDetailRoute(workKey, {
          focusSpotId: cell.spotId,
          title: titleParam,
          poster,
          themeColor: themeColorParam,
        })
      );
    },
    [poster, router, themeColorParam, titleParam, workKey]
  );

  const renderCell = useCallback(
    ({ item, index }: { item: Cell; index: number }) => {
      const stamped = item.stamp !== null;
      const onsiteAt = item.stamp?.onsiteAt ?? null;
      const date = onsiteAt ?? (item.stamp && item.stamp.at > 0 ? item.stamp.at : null);
      return (
        <Pressable
          onPress={() => openSpot(item)}
          accessibilityRole="button"
          accessibilityLabel={[
            item.name,
            stamped ? t(onsiteAt ? 'pilgrimage.stamps.onsite' : 'pilgrimage.stamps.manual') : null,
          ]
            .filter(Boolean)
            .join(', ')}
          style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
          <StampMark
            number={item.mark}
            collected={stamped}
            manual={stamped && !onsiteAt}
            accent={accent}
            size={STAMP}
            tilt={((index % 3) - 1) * 6}
          />
          <ThemedText
            variant="captionSmall"
            tone={stamped ? 'secondary' : 'tertiary'}
            numberOfLines={1}
            align="center">
            {item.name}
          </ThemedText>
          {date ? (
            <ThemedText
              variant="captionSmall"
              weight="700"
              tone={onsiteAt ? undefined : 'tertiary'}
              style={onsiteAt ? { color: accent } : undefined}>
              {formatStampDate(date)}
            </ThemedText>
          ) : null}
        </Pressable>
      );
    },
    [accent, openSpot, t]
  );

  const header = (
    <View style={styles.head}>
      <View style={[styles.poster, { backgroundColor: theme.background.secondary }]}>
        {poster ? <Image source={{ uri: poster }} style={styles.posterImage} contentFit="cover" /> : null}
      </View>
      <View style={styles.headText}>
        <ThemedText variant="titleMedium" weight="800" numberOfLines={2}>
          {titleParam ?? work?.titleJa ?? ''}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {[
            t('pilgrimage.stamps.onsiteCount', { count: onsite }),
            t('pilgrimage.stamps.manualCount', { count: manual }),
            work ? t('pilgrimage.stamps.progress', { collected: onsite + manual, total: cells.length }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>
      {complete ? (
        <View style={[styles.complete, { backgroundColor: accent }]}>
          <ThemedText variant="captionSmall" weight="800" style={{ color: readableTextOn(accent) }}>
            {t('pilgrimage.stamps.complete')}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background.primary }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('pilgrimage.stamps.book')} />
      <FlatList
        data={cells}
        keyExtractor={(cell) => cell.spotId}
        numColumns={COLUMNS}
        renderItem={renderCell}
        ListHeaderComponent={header}
        ListEmptyComponent={
          failed ? (
            <View style={styles.empty}>
              <ThemedText variant="bodyMedium" tone="secondary" align="center">
                {t('pilgrimage.stamps.loadFailed')}
              </ThemedText>
              <ThemedButton variant="secondary" label={t('common.retry')} onPress={load} />
            </View>
          ) : undefined
        }
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
  row: { gap: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  poster: { width: 48, height: 64, borderRadius: Radius.card, overflow: 'hidden' },
  posterImage: { width: '100%', height: '100%' },
  headText: { flex: 1, minWidth: 0, gap: Spacing.xxs },
  complete: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs, borderRadius: Radius.sm },
  cell: { width: `${100 / COLUMNS}%`, alignItems: 'center', gap: Spacing.xxs, minHeight: 96 },
  pressed: { opacity: 0.7 },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
});
