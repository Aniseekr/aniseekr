import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedSurface, ThemedSwitch, ThemedText } from '../themed';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import {
  MAX_SEEKER_CONTENT_TABS,
  SEEKER_TAB_CATALOG,
  type SeekerTabId,
} from '../../libs/navigation/experience-tabs';
import { EXPERIENCE_TAB_META } from '../navigation/experience-tab-meta';

interface SeekerTabEditorProps {
  tabs: readonly SeekerTabId[];
  onToggle: (tab: SeekerTabId) => void;
}

export function SeekerTabEditor({ tabs, onToggle }: SeekerTabEditorProps) {
  const { theme } = useTheme();
  const t = useT();
  const atCapacity = tabs.length >= MAX_SEEKER_CONTENT_TABS;

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
          {t('tabs.profileScreen.experienceMode.tabsLimit')}
        </ThemedText>
      </View>

      <View style={styles.rows}>
        {SEEKER_TAB_CATALOG.map((tab, index) => {
          const meta = EXPERIENCE_TAB_META[tab];
          const enabled = tabs.includes(tab);
          const disabled = !enabled && atCapacity;
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
                  color={enabled ? theme.accent : theme.text.tertiary}
                />
              </View>
              <ThemedText
                variant="bodyLarge"
                weight="600"
                tone={disabled ? 'tertiary' : 'primary'}
                numberOfLines={1}
                style={styles.label}>
                {t(meta.labelKey)}
              </ThemedText>
              <ThemedSwitch
                accessibilityLabel={t(meta.labelKey)}
                value={enabled}
                disabled={disabled}
                onValueChange={() => onToggle(tab)}
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
