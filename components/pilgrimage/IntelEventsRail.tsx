// 近期活動 hub rail (spec §13). Curated collab events/festivals ordered by the
// repository's rail rules: active → dated upcoming → unannounced-in-horizon.
// Self-contained: sync bundled reads, subscribes to runtime hydration, and
// renders nothing when no event is relevant.

import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { listItemEnter } from '../../libs/animations/presets';
import { ThemedText, readableTextOn } from '../themed';
import { useI18n, useT } from '../../libs/i18n';
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
import { deriveEventDateBlock, type EventDateBlock } from './event-date-block';

interface RailRow extends HubRailEvent {
  cover: string | null;
  animeTitle: string | null;
  bangumiId: number | null;
}

interface IntelEventsRailProps {
  theme: ThemePalette;
  collectionBangumiIds?: ReadonlySet<number>;
}

export function IntelEventsRail({ theme, collectionBangumiIds }: IntelEventsRailProps) {
  const t = useT();
  const { language } = useI18n();
  const router = useRouter();
  const version = useSyncExternalStore(
    subscribeLocalIntel,
    getLocalIntelVersion,
    getLocalIntelVersion
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
        })
      );
    },
    [router]
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
        {rows.map((row, index) => {
          const dateBlock = deriveEventDateBlock(row.state, language);
          const inCollection =
            row.bangumiId !== null && (collectionBangumiIds?.has(row.bangumiId) ?? false);
          return (
            <Animated.View
              key={row.event.id}
              entering={index < 8 ? listItemEnter(index) : undefined}>
              <Pressable
                onPress={() => handlePress(row)}
                accessibilityRole="button"
                accessibilityLabel={resolveLocalIntelText(row.event.name).value}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
                  pressed && { opacity: 0.84 },
                ]}>
                <DateBlock block={dateBlock} theme={theme} />
                <View style={styles.mediaWrap}>
                  {row.cover ? (
                    <Image
                      source={anitabiImageSource(row.cover)}
                      style={styles.cover}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.cover, { backgroundColor: theme.background.tertiary }]} />
                  )}
                  {inCollection ? (
                    <View
                      style={[
                        styles.collectedBadge,
                        {
                          backgroundColor: theme.status.success,
                          borderColor: theme.background.primary,
                        },
                      ]}>
                      <Ionicons
                        name="checkmark"
                        size={10}
                        color={readableTextOn(theme.status.success)}
                      />
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardBody}>
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
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DateBlock({ block, theme }: { block: EventDateBlock; theme: ThemePalette }) {
  const active = block.emphasis === 'active';
  const upcoming = block.emphasis === 'upcoming';
  const foreground = active ? readableTextOn(theme.accent) : theme.text.primary;
  const backgroundColor = active ? theme.accent : theme.background.tertiary;
  return (
    <View
      style={[
        styles.dateBlock,
        {
          backgroundColor,
          borderColor: active ? theme.accent : theme.glassBorder,
        },
      ]}>
      <ThemedText
        variant="captionSmall"
        weight="800"
        align="center"
        style={{ color: active ? foreground : theme.text.tertiary }}>
        {block.top}
      </ThemedText>
      {block.main ? (
        <ThemedText
          variant="titleLarge"
          weight="800"
          align="center"
          style={{ color: upcoming ? theme.accent : foreground }}>
          {block.main}
        </ThemedText>
      ) : null}
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
    width: 246,
    // Definite height (not minHeight): the media column's `height: '100%'`
    // needs a resolvable parent height, otherwise the remote image's intrinsic
    // size leaks through and the whole rail explodes vertically.
    height: 112,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dateBlock: {
    width: 64,
    borderRightWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: Spacing.xs,
  },
  mediaWrap: {
    width: 72,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  collectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  cardBody: {
    flex: 1,
    padding: Spacing.sm,
    gap: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 0,
  },
});
