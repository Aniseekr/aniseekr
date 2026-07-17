// 近期活動 hub rail (spec §13). Curated collab events/festivals ordered by the
// repository's rail rules: active → dated upcoming → unannounced-in-horizon.
// Self-contained: sync bundled reads, subscribes to runtime hydration, and
// renders nothing when no event is relevant.

import React, { useCallback, useMemo, useState , useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { ThemedText } from '../themed';
import { useT } from '../../libs/i18n';
import type { ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { anitabiImageSource } from '../../libs/services/pilgrimage/anitabi-image';
import { getIndexedById } from '../../libs/services/pilgrimage/anitabi-index';
import {
  getHubRailEvents,
  getLocalIntelVersion,
  subscribeLocalIntel,
  type HubRailEvent,
} from '../../libs/services/pilgrimage/local-intel/local-intel-repository';
import { resolveLocalIntelText } from '../../libs/services/pilgrimage/local-intel/local-intel-localization';
import { buildPilgrimageDetailRoute } from '../../libs/services/pilgrimage/pilgrimage-navigation';
import { getPilgrimageAnimeTitles } from '../../libs/services/pilgrimage/pilgrimage-localization';
import { EventStateChip } from './detail/IntelEventBanner';

interface RailRow extends HubRailEvent {
  cover: string | null;
  animeTitle: string | null;
  bangumiId: number | null;
}

export function IntelEventsRail({ theme }: { theme: ThemePalette }) {
  const t = useT();
  const router = useRouter();
  const version = useSyncExternalStore(
    subscribeLocalIntel,
    getLocalIntelVersion,
    getLocalIntelVersion,
  );
  // Captured on mount: the rail's now. Fresh enough for day-granular states.
  const [now] = useState(() => new Date());

  const rows = useMemo<RailRow[]>(() => {
    return getHubRailEvents(now).map((item) => {
      const bangumiId = item.event.bangumiIds.find((id) => getIndexedById(id) !== null) ?? null;
      const indexed = bangumiId !== null ? getIndexedById(bangumiId) : null;
      return {
        ...item,
        bangumiId,
        cover: indexed?.cover ?? null,
        animeTitle: indexed ? getPilgrimageAnimeTitles(indexed).primary : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version invalidates repository reads
  }, [now, version]);

  const handlePress = useCallback(
    (row: RailRow) => {
      if (row.bangumiId === null) return;
      hapticsBridge.tap();
      router.push(
        buildPilgrimageDetailRoute(row.bangumiId, {
          title: row.animeTitle ?? undefined,
          poster: row.cover ?? undefined,
        }),
      );
    },
    [router],
  );

  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText variant="titleMedium" weight="800" style={styles.header}>
        {t('pilgrimageUi.intel.upcomingEvents')}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {rows.map((row) => (
          <Pressable
            key={row.event.id}
            onPress={() => handlePress(row)}
            accessibilityRole="button"
            accessibilityLabel={resolveLocalIntelText(row.event.name).value}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
              pressed && { opacity: 0.84 },
            ]}>
            {row.cover ? (
              <Image
                source={anitabiImageSource(row.cover)}
                style={styles.cover}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.cover, { backgroundColor: theme.background.tertiary }]} />
            )}
            <View style={styles.cardBody}>
              <EventStateChip state={row.state} theme={theme} />
              <ThemedText variant="bodySmall" weight="700" numberOfLines={2}>
                {resolveLocalIntelText(row.event.name).value}
              </ThemedText>
              {row.animeTitle ? (
                <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                  {row.animeTitle}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  row: {
    gap: Spacing.sm,
    paddingRight: Spacing.screenPadding,
  },
  card: {
    width: 168,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: 84,
  },
  cardBody: {
    padding: Spacing.sm,
    gap: 6,
    alignItems: 'flex-start',
  },
});
