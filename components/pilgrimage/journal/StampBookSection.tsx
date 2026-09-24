// Journal stamp book: one booklet per rally the user has started, stamps inked
// in as they're collected (エキタグ-style). Reads sync snapshots only, so the
// Journal paints its book on frame 1 and refreshes silently on focus.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { readableTextOn, ThemedSurface, ThemedText } from '@/components/themed';
import { Radius, Shadow, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { listItemEnter } from '@/libs/animations/presets';
import { useI18n, useT } from '@/libs/i18n';
import { hapticsBridge } from '@/modules/haptics/hapticsBridge';
import { resolveLocalIntelText } from '@/libs/services/pilgrimage/local-intel/local-intel-localization';
import { getLocalityEventListRows } from '@/libs/services/pilgrimage/locality/event-detail';
import { localityRepository } from '@/libs/services/pilgrimage/locality/locality-repository';
import {
  buildStampBooks,
  countJoinableRallies,
  type StampBook,
} from '@/libs/services/pilgrimage/locality/stamp-rally';
import { buildPilgrimageEventDetailRoute } from '@/libs/services/pilgrimage/pilgrimage-navigation';

import { localityEventAccent, LOCALITY_CARD_RADIUS } from '../common/LocalityAesthetic';
import { EventStateChip } from '../detail/IntelEventBanner';
import {
  formatStampDate,
  loadStampCollectedAtSync,
  sameCollectedAt,
  type StampCollectedAtMap,
} from '../rally/rally-format';

const STAMP = 52;
const STAMPS_PER_ROW = 4;

function subscribeLocality(listener: () => void): () => void {
  return localityRepository.subscribe(listener);
}

function getLocalitySnapshot() {
  return localityRepository.getSnapshot();
}

export function StampBookSection({ onBrowseRallies }: { onBrowseRallies: () => void }) {
  const t = useT();
  const { theme } = useTheme();
  const router = useRouter();
  const snapshot = useSyncExternalStore(
    subscribeLocality,
    getLocalitySnapshot,
    getLocalitySnapshot
  );
  const [collectedAt, setCollectedAt] = useState<StampCollectedAtMap>(loadStampCollectedAtSync);

  useFocusEffect(
    useCallback(() => {
      const latest = loadStampCollectedAtSync();
      setCollectedAt((current) => (sameCollectedAt(current, latest) ? current : latest));
    }, [])
  );

  const { books, joinable } = useMemo(() => {
    void snapshot;
    const rows = getLocalityEventListRows(new Date(), localityRepository);
    return {
      books: buildStampBooks(rows, (roleId) =>
        roleId in collectedAt ? (collectedAt[roleId] ?? 0) : null
      ),
      joinable: countJoinableRallies(rows),
    };
  }, [snapshot, collectedAt]);

  const openBook = useCallback(
    (book: StampBook, name: string) => {
      hapticsBridge.tap();
      router.push(buildPilgrimageEventDetailRoute(book.eventId, { name }));
    },
    [router]
  );

  if (books.length === 0) {
    if (joinable === 0) return null;
    return (
      <Pressable
        onPress={onBrowseRallies}
        accessibilityRole="button"
        accessibilityLabel={t('explorer.stampBook.browse')}
        style={({ pressed }) => [pressed && styles.pressed]}>
        <ThemedSurface padded radius={LOCALITY_CARD_RADIUS} style={styles.emptyRow}>
          <Ionicons name="ticket-outline" size={20} color={theme.accent} />
          <ThemedText variant="bodySmall" tone="secondary" style={styles.flex}>
            {t('explorer.stampBook.emptyJoinable', { count: joinable })}
          </ThemedText>
          <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
            {t('explorer.stampBook.browse')}
          </ThemedText>
        </ThemedSurface>
      </Pressable>
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText variant="titleSmall" weight="700">
        {t('explorer.stampBook.title')}
      </ThemedText>
      {books.map((book, index) => (
        <Animated.View key={book.eventId} entering={listItemEnter(index)}>
          <StampBookCard book={book} onOpen={openBook} />
        </Animated.View>
      ))}
    </View>
  );
}

function StampBookCard({
  book,
  onOpen,
}: {
  book: StampBook;
  onOpen: (book: StampBook, name: string) => void;
}) {
  const t = useT();
  const { theme } = useTheme();
  const { language } = useI18n();
  const name = resolveLocalIntelText(book.name, language).value;
  const accent = localityEventAccent(book.state, 'stamp_rally', theme);
  const inkOn = readableTextOn(accent);

  return (
    <Pressable
      onPress={() => onOpen(book, name)}
      accessibilityRole="button"
      accessibilityLabel={t('explorer.stampBook.openA11y', { name })}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedSurface padded radius={LOCALITY_CARD_RADIUS} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={2} style={styles.flex}>
            {name}
          </ThemedText>
          {book.complete ? (
            <View style={[styles.completeBadge, { backgroundColor: accent }]}>
              <ThemedText variant="captionSmall" weight="800" style={{ color: inkOn }}>
                {t('explorer.stampBook.complete')}
              </ThemedText>
            </View>
          ) : (
            <EventStateChip state={book.state} theme={theme} />
          )}
        </View>
        <ThemedText variant="captionSmall" weight="800" style={{ color: accent }}>
          {t('pilgrimageUi.eventDetail.progressValue', {
            collected: book.collected,
            total: book.total,
          })}
        </ThemedText>
        <View style={styles.grid}>
          {book.stamps.map((stamp, index) => {
            const label = resolveLocalIntelText(stamp.label, language).value;
            const stamped = stamp.collectedAt !== null;
            // A stamped record without a time (older data) is stored as 0 → show no date.
            const date = stamped && stamp.collectedAt ? formatStampDate(stamp.collectedAt) : null;
            return (
              <View key={stamp.roleId} style={styles.cell}>
                <View
                  style={[
                    styles.stamp,
                    stamped
                      ? {
                          backgroundColor: accent,
                          borderColor: accent,
                          // Deterministic tilt so the book looks hand-stamped but never reshuffles.
                          transform: [{ rotate: `${((index % 3) - 1) * 6}deg` }],
                        }
                      : { borderColor: theme.glassBorder, borderStyle: 'dashed' },
                  ]}>
                  {stamped ? (
                    <Ionicons name="checkmark" size={20} color={inkOn} />
                  ) : (
                    <ThemedText variant="captionSmall" weight="700" tone="tertiary">
                      {index + 1}
                    </ThemedText>
                  )}
                </View>
                <ThemedText
                  variant="captionSmall"
                  tone={stamped ? 'secondary' : 'tertiary'}
                  numberOfLines={1}
                  align="center">
                  {label}
                </ThemedText>
                {date ? (
                  <ThemedText variant="captionSmall" weight="700" style={{ color: accent }}>
                    {date}
                  </ThemedText>
                ) : null}
              </View>
            );
          })}
        </View>
      </ThemedSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  flex: { flex: 1 },
  pressed: { opacity: 0.9 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  card: { gap: Spacing.sm, ...Shadow.subtle },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  completeBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.full,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.sm },
  cell: { width: `${100 / STAMPS_PER_ROW}%`, alignItems: 'center', gap: Spacing.xxs },
  stamp: {
    width: STAMP,
    height: STAMP,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
