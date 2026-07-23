import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing } from '../../../constants/DesignSystem';

export function SheetHandle() {
  const { theme } = useTheme();
  return (
    <View
      style={[styles.handle, { backgroundColor: theme.glassBorder }]}
      accessibilityElementsHidden
    />
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
});
