// Journal stamp tab: one booklet per work the user has stamped, newest
// stamping first. Everything comes from on-device stamp records, so it paints
// on frame 1; old check-ins without a snapshot are filled from Atlas once.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedSurface, ThemedText } from '@/components/themed';
import { Shadow, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { listItemEnter } from '@/libs/animations/presets';
import { useT } from '@/libs/i18n';
import { hapticsBridge } from '@/modules/haptics/hapticsBridge';
import { atlasClient } from '@/libs/services/pilgrimage/atlas/atlas-client';
import type { AtlasWork } from '@/libs/services/pilgrimage/atlas/types';
import { getPilgrimageAnimeTitles } from '@/libs/services/pilgrimage/pilgrimage-localization';
import { backfillStampMeta } from '@/libs/services/pilgrimage/stamp-backfill';
import type { Stamp } from '@/libs/services/pilgrimage/stamp-details';
import { loadStampsSync } from '@/libs/services/pilgrimage/visited-prefs';

import { LOCALITY_CARD_RADIUS } from '../common/LocalityAesthetic';
import { StampMark } from '../rally/StampMark';

const MINI = 34;
const MAX_MINI = 7;

interface WorkBook {
  workKey: string;
  stamps: Stamp[];
  onsite: number;
  latest: number;
}

function groupByWork(stamps: readonly Stamp[]): WorkBook[] {
  const books = new Map<string, WorkBook>();
  for (const stamp of stamps) {
    const workKey = stamp.meta?.workKey;
    if (!workKey) continue;
    let book = books.get(workKey);
    if (!book) {
      book = { workKey, stamps: [], onsite: 0, latest: 0 };
      books.set(workKey, book);
    }
    book.stamps.push(stamp);
    if (stamp.onsiteAt) book.onsite += 1;
    book.latest = Math.max(book.latest, stamp.onsiteAt ?? stamp.at);
  }
  for (const book of books.values()) {
    // On-site stamps lead the preview row.
    book.stamps.sort((a, b) => (b.onsiteAt ?? 0) - (a.onsiteAt ?? 0) || b.at - a.at);
  }
  return [...books.values()].sort((a, b) => b.latest - a.latest);
}

export function useWorkStampBooks(): WorkBook[] {
  const [stamps, setStamps] = useState<Stamp[]>(loadStampsSync);
  useFocusEffect(useCallback(() => setStamps(loadStampsSync()), []));
  useEffect(() => {
    let cancelled = false;
    void backfillStampMeta().then((written) => {
      if (!cancelled && written > 0) setStamps(loadStampsSync());
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(() => groupByWork(stamps), [stamps]);
}

export function WorkStampBooks({ books }: { books: readonly WorkBook[] }) {
  const t = useT();
  const { theme } = useTheme();
  const router = useRouter();
  const [works, setWorks] = useState<ReadonlyMap<string, AtlasWork>>(new Map());

  useEffect(() => {
    let cancelled = false;
    atlasClient
      .works()
      .then((index) => {
        if (!cancelled) setWorks(new Map(index.works.map((work) => [work.key, work])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (books.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText variant="titleSmall" weight="700">
        {t('pilgrimage.stamps.workBooks')}
      </ThemedText>
      {books.map((book, index) => {
        const row = works.get(book.workKey);
        const title = row ? getPilgrimageAnimeTitles(row).primary : book.workKey;
        const bgm = row?.bgm?.[0];
        const manual = book.stamps.length - book.onsite;
        const summary = [
          t('pilgrimage.stamps.onsiteCount', { count: book.onsite }),
          t('pilgrimage.stamps.manualCount', { count: manual }),
          row ? t('pilgrimage.stamps.progress', { collected: book.stamps.length, total: row.n }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Animated.View key={book.workKey} entering={listItemEnter(index)}>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                router.push({
                  pathname: '/pilgrimage/stampbook/[workKey]',
                  params: {
                    workKey: book.workKey,
                    title,
                    ...(bgm
                      ? { poster: `https://api.bgm.tv/v0/subjects/${bgm}/image?type=common` }
                      : {}),
                  },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('pilgrimage.stamps.openBookA11y', {
                progress: `${title}, ${summary}`,
              })}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <ThemedSurface padded radius={LOCALITY_CARD_RADIUS} style={styles.card}>
                <View style={styles.cardHeader}>
                  <ThemedText variant="bodyMedium" weight="800" numberOfLines={1} style={styles.flex}>
                    {title}
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
                </View>
                <ThemedText variant="captionSmall" weight="800" style={{ color: theme.accent }}>
                  {summary}
                </ThemedText>
                <View style={styles.minis} importantForAccessibility="no-hide-descendants">
                  {book.stamps.slice(0, MAX_MINI).map((stamp, i) => (
                    <StampMark
                      key={stamp.spotId}
                      number={i + 1}
                      collected
                      manual={!stamp.onsiteAt}
                      accent={theme.accent}
                      size={MINI}
                      tilt={((i % 3) - 1) * 6}
                    />
                  ))}
                  {book.stamps.length > MAX_MINI ? (
                    <ThemedText variant="captionSmall" weight="800" tone="secondary">
                      {t('explorer.stampBook.more', { count: book.stamps.length - MAX_MINI })}
                    </ThemedText>
                  ) : null}
                </View>
              </ThemedSurface>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  flex: { flex: 1 },
  pressed: { opacity: 0.9 },
  card: { gap: Spacing.sm, ...Shadow.subtle },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  minis: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});
