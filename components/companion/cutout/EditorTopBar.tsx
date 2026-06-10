// Cutout editor chrome: cancel / undo / redo / hold-to-compare / save. The
// compare button reports press-in/out so the screen can flip the canvas into
// original-only view while held.

import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedButton, ThemedIconButton } from '../../themed';
import { Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';

export interface EditorTopBarProps {
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCompareIn: () => void;
  onCompareOut: () => void;
  onSave: () => void;
}

export function EditorTopBar({
  canUndo,
  canRedo,
  saving,
  onCancel,
  onUndo,
  onRedo,
  onCompareIn,
  onCompareOut,
  onSave,
}: EditorTopBarProps) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View style={styles.row}>
      <ThemedIconButton
        accessibilityLabel={t('common.close')}
        icon={(c: string) => <Ionicons name="close" size={20} color={c} />}
        onPress={onCancel}
      />
      <View style={styles.center}>
        <ThemedIconButton
          accessibilityLabel={t('companion.cutout.undoA11y')}
          icon={(c: string) => <Ionicons name="arrow-undo" size={18} color={c} />}
          onPress={onUndo}
          disabled={!canUndo}
        />
        <ThemedIconButton
          accessibilityLabel={t('companion.cutout.redoA11y')}
          icon={(c: string) => <Ionicons name="arrow-redo" size={18} color={c} />}
          onPress={onRedo}
          disabled={!canRedo}
        />
        <Pressable
          onPressIn={onCompareIn}
          onPressOut={onCompareOut}
          accessibilityRole="button"
          accessibilityLabel={t('companion.cutout.compareA11y')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.compareBtn,
            {
              backgroundColor: pressed ? theme.background.tertiary : theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <Ionicons name="eye-outline" size={18} color={theme.text.primary} />
        </Pressable>
      </View>
      <ThemedButton
        label={saving ? t('companion.cutout.saving') : t('companion.cutout.save')}
        onPress={onSave}
        loading={saving}
        disabled={saving}
        size="sm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  center: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  compareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
