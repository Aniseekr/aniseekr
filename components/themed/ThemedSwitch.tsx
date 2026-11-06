import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ON_DARK } from './contrast';

export interface ThemedSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Overrides the "on" track colour (defaults to the resolved theme accent). */
  accent?: string;
  /** Fire the selection haptic on toggle. Off when the handler already does. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Switch colours: accent "on" track, tertiary "off" track, and the native white
 * thumb in every mode — a text-primary thumb would turn near-black in light mode.
 */
export function themedSwitchColors(theme: ThemePalette, accent?: string) {
  return {
    trackColor: { false: theme.background.tertiary, true: accent ?? theme.accent },
    iosBackground: theme.background.tertiary,
    thumbColor: ON_DARK,
  };
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
  haptic = true,
  style,
}: ThemedSwitchProps) {
  const { theme } = useTheme();
  const colors = themedSwitchColors(theme, accent);
  return (
    <View style={[styles.box, style]}>
      <Switch
        value={value}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        onValueChange={(next) => {
          if (haptic) hapticsBridge.selection();
          onValueChange(next);
        }}
        trackColor={colors.trackColor}
        ios_backgroundColor={colors.iosBackground}
        thumbColor={colors.thumbColor}
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
