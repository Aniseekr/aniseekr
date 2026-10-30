import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import {
  ThemedBottomSheet,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
} from '../themed';
import { ThemedSwitch } from '../themed/ThemedSwitch';
export type BangumiViewMode = 'calendar' | 'list' | 'cards';
export type BangumiBaseViewMode = 'calendar' | 'list';
export type BangumiFilterMode = 'all' | 'tracking';
export type BangumiTypeFilter = 'all' | 'tv' | 'movie' | 'ova' | 'special';

export interface BangumiPreferences {
  viewMode: BangumiViewMode;
  /** Legacy fields remain readable in saved preference blobs. */
  baseViewMode: BangumiBaseViewMode;
  filterMode: BangumiFilterMode;
  typeFilter: BangumiTypeFilter;
  showUnknownDays: boolean;
  notificationsEnabled: boolean;
  hideSwipeHint?: boolean;
}

export const DEFAULT_BANGUMI_PREFS: BangumiPreferences = {
  viewMode: 'calendar',
  baseViewMode: 'calendar',
  filterMode: 'tracking',
  typeFilter: 'all',
  showUnknownDays: true,
  notificationsEnabled: true,
  hideSwipeHint: false,
};

interface BangumiSettingsSheetProps {
  visible: boolean;
  preferences: BangumiPreferences;
  adultContent: boolean;
  onAdultContentChange: (value: boolean) => void;
  onClose: () => void;
  onChange: (next: BangumiPreferences) => void;
  skippedCount?: number;
  onRestoreSkipped?: () => void;
}
export const BangumiSettingsSheet = memo(function BangumiSettingsSheet({
  visible,
  preferences,
  adultContent,
  onAdultContentChange,
  onClose,
  onChange,
  skippedCount = 0,
  onRestoreSkipped,
}: BangumiSettingsSheetProps) {
  const t = useT();
  const update = <K extends keyof BangumiPreferences>(key: K, value: BangumiPreferences[K]) =>
    onChange({ ...preferences, [key]: value });
  const filters = {
    all: 'search.filter.all',
    tv: 'search.filter.tv',
    movie: 'bangumiTab.movie',
    ova: 'tabs.schedule.ova',
    special: 'bangumiTab.special',
  } as const;
  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <ThemedText variant="headlineSmall" style={styles.grow}>
            {t('bangumiTab.bangumiOptions')}
          </ThemedText>
          <ThemedIconButton
            variant="ghost"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            icon={(color) => <MaterialIcons name="close" size={22} color={color} />}
          />
        </View>
        <ThemedButton
          variant="secondary"
          label={t('commonUi.dataSource')}
          onPress={() => {
            onClose();
            setTimeout(() => router.push('/(setting)/data-source'), 280);
          }}
        />
        <ThemedText variant="titleSmall" tone="secondary">
          {t('bangumiTab.type')}
        </ThemedText>
        <View style={styles.filters}>
          {(Object.keys(filters) as BangumiTypeFilter[]).map((filter) => (
            <ThemedButton
              key={filter}
              size="sm"
              label={t(filters[filter])}
              haptic="selection"
              variant={preferences.typeFilter === filter ? 'primary' : 'secondary'}
              onPress={() => update('typeFilter', filter)}
            />
          ))}
        </View>
        <ToggleRow
          label={t('bangumiTab.showUndatedEntries')}
          description={t('bangumiTab.displaySeriesWithUnknownAir')}
          value={preferences.showUnknownDays}
          onChange={(value) => update('showUnknownDays', value)}
        />
        <ToggleRow
          label={t('bangumiTab.episodeReminders')}
          description={t('bangumiTab.getNotifiedBeforeEachEpisode')}
          value={preferences.notificationsEnabled}
          onChange={(value) => update('notificationsEnabled', value)}
        />
        <ToggleRow
          label={t('bangumiTab.showAdultContent')}
          description={t('bangumiTab.revealR18SeriesInSeasonal')}
          value={adultContent}
          onChange={onAdultContentChange}
        />
        {skippedCount > 0 && onRestoreSkipped ? (
          <ThemedButton
            variant="ghost"
            label={t('bangumiTab.restoreSkipped', { count: skippedCount })}
            onPress={onRestoreSkipped}
            haptic="none"
          />
        ) : null}
      </ScrollView>
    </ThemedBottomSheet>
  );
});
function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <ThemedSurface padded radius={Radius.md} style={styles.row}>
      <View style={styles.grow}>
        <ThemedText variant="titleMedium">{label}</ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {description}
        </ThemedText>
      </View>
      <ThemedSwitch value={value} onValueChange={onChange} />
    </ThemedSurface>
  );
}
const styles = StyleSheet.create({
  content: { gap: Spacing.sm, paddingBottom: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  grow: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
