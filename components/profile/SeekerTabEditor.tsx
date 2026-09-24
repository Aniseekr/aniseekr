import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedSurface, ThemedSwitch, ThemedText } from '../themed';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Size, Spacing } from '../../constants/DesignSystem';
import { bannerEnter, bannerExit } from '../../libs/animations/presets';
import { useT } from '../../libs/i18n';
import {
  MAX_SEEKER_CONTENT_TABS,
  SEEKER_TAB_CATALOG,
  type SeekerTabId,
} from '../../libs/navigation/experience-tabs';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { EXPERIENCE_TAB_META } from '../navigation/experience-tab-meta';

interface SeekerTabEditorProps {
  tabs: readonly SeekerTabId[];
  onToggle: (tab: SeekerTabId) => void;
}

/**
 * Seeker tab picker on the Profile screen. Collapsed by default to a single
 * row summarising the chosen tabs; the full toggle list only opens on demand.
 */
export function SeekerTabEditor({ tabs, onToggle }: SeekerTabEditorProps) {
  const { theme } = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const atCapacity = tabs.length >= MAX_SEEKER_CONTENT_TABS;
  const summary = tabs
    .map((tab) => t(EXPERIENCE_TAB_META[tab].labelKey))
    .join(t('tabs.profileScreen.experienceMode.tabsSeparator'));

  return (
    <ThemedSurface variant="card" radius={Radius.card} style={styles.card}>
      <Pressable
        onPress={() => {
          hapticsBridge.selection();
          setExpanded((open) => !open);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.profileScreen.experienceMode.tabsTitle')}
        accessibilityHint={summary}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <View style={styles.headerCopy}>
          <ThemedText variant="titleMedium" weight="700">
            {t('tabs.profileScreen.experienceMode.tabsTitle')}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
            {summary}
          </ThemedText>
        </View>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color={theme.text.tertiary}
        />
      </Pressable>

      {expanded ? (
        <Animated.View entering={bannerEnter()} exiting={bannerExit()} style={styles.body}>
          <ThemedText variant="caption" tone="tertiary">
            {t('tabs.profileScreen.experienceMode.tabsLimit')}
          </ThemedText>
          <View>
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
                  <MaterialIcons
                    name={meta.icon}
                    size={20}
                    color={enabled ? theme.accent : theme.text.tertiary}
                  />
                  <ThemedText
                    variant="bodyMedium"
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
        </Animated.View>
      ) : null}
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  header: {
    minHeight: Size.minTouchTarget + Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  row: {
    minHeight: Size.minTouchTarget + Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    flex: 1,
  },
});
