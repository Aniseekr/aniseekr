import { memo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import {
  loadNotificationPrefsSync,
  refreshNotificationPrefs,
  saveNotificationPrefs,
} from '../../libs/services/notifications/notification-service';
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
  /** Legacy: reminders now live in notification prefs (`episodeReminders`). */
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
  onClose: () => void;
  onChange: (next: BangumiPreferences) => void;
  skippedCount?: number;
  onRestoreSkipped?: () => void;
}
export const BangumiSettingsSheet = memo(function BangumiSettingsSheet({
  visible,
  preferences,
  onClose,
  onChange,
  skippedCount = 0,
  onRestoreSkipped,
}: BangumiSettingsSheetProps) {
  const t = useT();
  const { theme } = useTheme();
  // Single source of truth shared with Settings → Notifications.
  const [notificationPrefs, setNotificationPrefs] = useState(loadNotificationPrefsSync);
  const setEpisodeReminders = (episodeReminders: boolean) => {
    const next = { ...notificationPrefs, episodeReminders };
    setNotificationPrefs(next);
    saveNotificationPrefs(next);
    void refreshNotificationPrefs();
  };
  const openSetting = (pathname: '/(setting)/data-source' | '/(setting)/notifications') => {
    onClose();
    setTimeout(() => router.push(pathname), 280);
  };
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
          value={notificationPrefs.episodeReminders}
          onChange={setEpisodeReminders}
        />
        <ThemedButton
          variant="secondary"
          fullWidth
          label={t('bangumiTab.notificationSettings')}
          iconRight={<MaterialIcons name="chevron-right" size={18} color={theme.text.secondary} />}
          onPress={() => openSetting('/(setting)/notifications')}
        />
        <ThemedButton
          variant="secondary"
          fullWidth
          label={t('commonUi.dataSource')}
          iconRight={<MaterialIcons name="chevron-right" size={18} color={theme.text.secondary} />}
          onPress={() => openSetting('/(setting)/data-source')}
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
