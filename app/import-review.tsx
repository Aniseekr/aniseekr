// Review a batch photo import before anything is saved: each photo with the
// spot its own GPS landed on (or why it didn't), ticked to keep or skip.
// Leaving without saving drops the app's copies.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../context/ThemeContext';
import { ScreenHeader, ThemedButton, ThemedText } from '../components/themed';
import { Radius, Spacing } from '../constants/DesignSystem';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { useT, type TranslationKey } from '../libs/i18n';
import { formatJournalDay } from '../components/pilgrimage/journal/journal-dates';
import {
  commitPhotoImport,
  discardImportPlan,
  type ImportPlanItem,
} from '../libs/services/pilgrimage/photo-import';
import {
  finishPendingImport,
  peekPendingImport,
} from '../libs/services/pilgrimage/import-review-store';

type Group = 'matched' | 'unmatched' | 'noPlace' | 'duplicate';

const GROUP_ORDER: readonly Group[] = ['matched', 'unmatched', 'noPlace', 'duplicate'];
const GROUP_TITLE: Record<Group, TranslationKey> = {
  matched: 'pilgrimage.album.reviewMatched',
  unmatched: 'pilgrimage.album.reviewUnmatched',
  noPlace: 'pilgrimage.album.reviewNoPlace',
  duplicate: 'pilgrimage.album.reviewDuplicate',
};

function groupOf(item: ImportPlanItem): Group {
  if (item.duplicate) return 'duplicate';
  if (item.match) return 'matched';
  return item.location ? 'unmatched' : 'noPlace';
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default function ImportReviewScreen() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [plan] = useState(() => peekPendingImport() ?? []);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const settledRef = useRef(false);

  // Back gesture, hardware back or the header back: nothing was saved, drop the
  // copies. (The route-removed event, not an effect cleanup, so a dev remount
  // can't delete photos still under review.)
  useEffect(() => {
    const unsubscribe = navigation.addListener('removed', () => {
      if (settledRef.current) return;
      settledRef.current = true;
      discardImportPlan(plan);
      finishPendingImport(null);
    });
    return () => queueMicrotask(unsubscribe);
  }, [navigation, plan]);

  const sections = useMemo(() => {
    const byGroup = new Map<Group, ImportPlanItem[]>();
    for (const item of plan) {
      const group = groupOf(item);
      byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
    }
    return GROUP_ORDER.flatMap((group) => {
      const data = (byGroup.get(group) ?? []).sort((a, b) => a.capturedAt - b.capturedAt);
      return data.length ? [{ group, data }] : [];
    });
  }, [plan]);

  const keepCount = plan.filter((item) => !item.duplicate && !skipped.has(item.uri)).length;

  const toggle = useCallback((uri: string) => {
    hapticsBridge.selection();
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const summary = await commitPhotoImport(plan, (item) => !skipped.has(item.uri));
      settledRef.current = true;
      finishPendingImport(summary);
      hapticsBridge.success();
      router.back();
    } catch (error) {
      console.warn('[import-review] save failed', error);
      hapticsBridge.error();
      setSaving(false);
    }
  }, [plan, router, saving, skipped]);

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${formatJournalDay(ms, t)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScreenHeader
          title={t('pilgrimage.album.reviewTitle', { count: plan.length })}
          subtitle={t('pilgrimage.album.reviewHint')}
        />
        {plan.length === 0 ? (
          <ThemedText variant="bodyMedium" tone="secondary" align="center" style={styles.empty}>
            {t('pilgrimage.album.reviewEmpty')}
          </ThemedText>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.uri}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <ThemedText variant="caption" weight="700" tone="secondary" style={styles.sectionHead}>
                {t(GROUP_TITLE[section.group], { count: section.data.length })}
              </ThemedText>
            )}
            renderItem={({ item }) => {
              const duplicate = item.duplicate;
              const kept = !duplicate && !skipped.has(item.uri);
              const time = formatTime(item.capturedAt);
              return (
                <Pressable
                  disabled={duplicate}
                  onPress={() => toggle(item.uri)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: kept, disabled: duplicate }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
                    (duplicate || !kept) && styles.rowMuted,
                    pressed && { opacity: 0.8 },
                  ]}>
                  <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
                  <View style={styles.rowText}>
                    {item.match ? (
                      <>
                        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
                          {item.match.workTitle}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                          {item.match.spotName}
                        </ThemedText>
                      </>
                    ) : (
                      <ThemedText variant="bodySmall" weight="700" tone="secondary" numberOfLines={1}>
                        {t(
                          duplicate
                            ? 'pilgrimage.album.reviewRowDuplicate'
                            : item.location
                              ? 'pilgrimage.album.reviewRowUnmatched'
                              : 'pilgrimage.album.reviewRowNoPlace'
                        )}
                      </ThemedText>
                    )}
                    <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                      {item.timeFromPhoto ? time : t('pilgrimage.album.reviewFileTime', { time })}
                    </ThemedText>
                  </View>
                  {duplicate ? null : (
                    <Ionicons
                      name={kept ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={kept ? theme.accent : theme.text.tertiary}
                    />
                  )}
                </Pressable>
              );
            }}
          />
        )}
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + Spacing.md,
              borderTopColor: theme.glassBorder,
              backgroundColor: theme.background.primary,
            },
          ]}>
          <ThemedButton
            label={t('pilgrimage.album.reviewSave', { count: keepCount })}
            size="lg"
            fullWidth
            loading={saving}
            disabled={keepCount === 0}
            haptic="none"
            onPress={() => void save()}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  empty: { padding: Spacing.xl },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm },
  sectionHead: { marginTop: Spacing.md, marginBottom: Spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.card,
    borderWidth: 1,
    minHeight: 64,
  },
  rowMuted: { opacity: 0.55 },
  thumb: { width: 56, height: 56, borderRadius: Radius.sm },
  rowText: { flex: 1, gap: 2 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
