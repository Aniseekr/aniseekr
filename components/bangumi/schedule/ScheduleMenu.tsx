import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedBottomSheet, ThemedButton, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { Spacing } from '../../../constants/DesignSystem';

export type ScheduleTool = 'deck' | 'share' | 'notifications' | 'settings';
export function ScheduleMenu({
  onClose,
  onSelect,
  deckEnabled,
  shareEnabled,
}: {
  onClose: () => void;
  onSelect: (tool: ScheduleTool) => void;
  deckEnabled: boolean;
  shareEnabled: boolean;
}) {
  const t = useT();
  const { theme } = useTheme();
  const items = [
    ['deck', 'tabs.schedule.deck', 'style'],
    ['share', 'bangumiTab.shareSchedule', 'ios-share'],
    ['notifications', 'bangumiTab.manageReminders', 'notifications'],
    ['settings', 'common.settings', 'settings'],
  ] as const;
  return (
    <ThemedBottomSheet visible onClose={onClose}>
      <View style={styles.content}>
        <ThemedText variant="headlineSmall">{t('tabs.schedule.options')}</ThemedText>
        {items.map(([tool, label, icon]) => (
          <ThemedButton
            key={tool}
            disabled={(tool === 'deck' && !deckEnabled) || (tool === 'share' && !shareEnabled)}
            variant="ghost"
            fullWidth
            label={t(label)}
            icon={<MaterialIcons name={icon} size={22} color={theme.text.secondary} />}
            onPress={() => onSelect(tool)}
          />
        ))}
      </View>
    </ThemedBottomSheet>
  );
}
const styles = StyleSheet.create({ content: { gap: Spacing.sm, paddingBottom: Spacing.lg } });
