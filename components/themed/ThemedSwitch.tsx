import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export interface ThemedSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Overrides the "on" track colour (defaults to the resolved theme accent). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

// Native switch footprint. iOS 26 draws a wider/shorter glass switch than the
// size React Native lays it out with, and the native view hugs the top of its
// Yoga frame — so a bare <Switch> in an `alignItems: 'center'` row renders
// visibly above its label. A fixed box that centres the switch keeps it on the
// row's centre line on every OS version.
const SWITCH_BOX_HEIGHT = 32;
const SWITCH_BOX_WIDTH = 64;

export function ThemedSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  accent,
  style,
}: ThemedSwitchProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.box, style]}>
      <Switch
        value={value}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        onValueChange={(next) => {
          hapticsBridge.selection();
          onValueChange(next);
        }}
        trackColor={{ false: theme.background.tertiary, true: accent ?? theme.accent }}
        ios_backgroundColor={theme.background.tertiary}
        thumbColor={theme.text.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SWITCH_BOX_WIDTH,
    height: SWITCH_BOX_HEIGHT,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
