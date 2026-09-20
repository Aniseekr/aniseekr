import type { ComponentProps } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedSurface, ThemedText } from '../themed';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import { SEEKER_TAB_CATALOG, type SeekerTabId } from '../../libs/navigation/experience-tabs';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface SeekerTabEditorProps {
  tabs: readonly SeekerTabId[];
  onToggle: (tab: SeekerTabId) => void;
}

const TAB_META: Record<
  SeekerTabId,
  { labelKey: string; icon: ComponentProps<typeof MaterialIcons>['name'] }
> = {
  discover: { labelKey: 'tabs.rate', icon: 'home-filled' },
  bangumi: { labelKey: 'tabs.bangumi', icon: 'date-range' },
  collection: { labelKey: 'tabs.collection', icon: 'bookmark' },
  pilgrimage: { labelKey: 'tabs.pilgrimage', icon: 'place' },
};

export function SeekerTabEditor({ tabs, onToggle }: SeekerTabEditorProps) {
  const { theme } = useTheme();
  const t = useT();

  return (
    <ThemedSurface
      variant="card"
      radius={Radius.card}
      style={[styles.card, { borderColor: theme.glassBorder }]}>
      <View style={styles.heading}>
        <ThemedText variant="titleMedium" weight="700">
          {t('tabs.profileScreen.experienceMode.tabsTitle')}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {t('tabs.profileScreen.experienceMode.tabsSubtitle')}
        </ThemedText>
      </View>

      <View style={styles.rows}>
        {SEEKER_TAB_CATALOG.map((tab, index) => {
          const meta = TAB_META[tab];
          const enabled = tabs.includes(tab);
          return (
            <View
              key={tab}
              style={[
                styles.row,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.glassBorder,
                },
              ]}>
              <View style={[styles.icon, { backgroundColor: theme.background.tertiary }]}>
                <MaterialIcons
                  name={meta.icon}
                  size={20}
                  color={enabled ? theme.accent : theme.text.secondary}
                />
              </View>
              <ThemedText variant="bodyLarge" weight="600" style={styles.label}>
                {t(meta.labelKey)}
              </ThemedText>
              <Switch
                accessibilityLabel={t(meta.labelKey)}
                value={enabled}
                onValueChange={() => {
                  hapticsBridge.selection();
                  onToggle(tab);
                }}
                trackColor={{ false: theme.background.tertiary, true: `${theme.accent}80` }}
                thumbColor={enabled ? theme.accent : theme.text.secondary}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.fixedNote}>
        <MaterialIcons name="lock-outline" size={14} color={theme.text.tertiary} />
        <ThemedText variant="captionSmall" tone="tertiary">
          {t('tabs.profileScreen.experienceMode.profileFixed')}
        </ThemedText>
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  heading: {
    gap: Spacing.xxs,
  },
  rows: {
    gap: 0,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
  fixedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
