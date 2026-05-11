import { Fragment } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface QuickAction {
  key: string;
  label: string;
  description?: string;
  icon?: IoniconName;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}

export interface QuickActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  actions: QuickAction[];
  style?: StyleProp<ViewStyle>;
}

export function QuickActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
  style,
}: QuickActionSheetProps) {
  const { theme } = useTheme();
  const { bottom } = useSafeAreaInsets();

  const handlePick = (action: QuickAction) => {
    hapticsBridge.selection();
    action.onPress();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              paddingBottom: Math.max(bottom, Spacing.lg) + Spacing.sm,
            },
            style,
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.text.tertiary, opacity: 0.4 }]} />
          <View style={styles.header}>
            <ThemedText variant="titleMedium" weight="700">
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="bodySmall" tone="secondary">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.actionList}>
            {actions.map((action, idx) => {
              const labelColor = action.destructive ? '#FF453A' : theme.text.primary;
              const iconColor = action.destructive
                ? '#FF453A'
                : action.selected
                ? theme.accent
                : theme.text.secondary;
              return (
                <Fragment key={action.key}>
                  <Pressable
                    onPress={() => handlePick(action)}
                    style={({ pressed }) => [
                      styles.actionRow,
                      pressed && { backgroundColor: theme.background.tertiary, opacity: 0.95 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}>
                    {action.icon ? (
                      <Ionicons name={action.icon} size={20} color={iconColor} />
                    ) : (
                      <View style={styles.iconPlaceholder} />
                    )}
                    <View style={styles.actionText}>
                      <ThemedText
                        variant="titleSmall"
                        weight={action.selected ? '700' : '500'}
                        style={{ color: labelColor }}>
                        {action.label}
                      </ThemedText>
                      {action.description ? (
                        <ThemedText variant="caption" tone="secondary">
                          {action.description}
                        </ThemedText>
                      ) : null}
                    </View>
                    {action.selected ? (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    ) : null}
                  </Pressable>
                  {idx < actions.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
                  ) : null}
                </Fragment>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    gap: 2,
  },
  actionList: {
    marginTop: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  iconPlaceholder: {
    width: 20,
    height: 20,
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.sm + 20 + Spacing.sm + 2,
  },
});
