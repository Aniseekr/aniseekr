import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText, readableTextOn } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { FocalStop } from './types';

const DEFAULT_STOPS: FocalStop[] = [0.5, 1, 2, 3];
const FRONT_FACING_STOPS: FocalStop[] = [1];

interface FocalPillsProps {
  activeStop: FocalStop | null;
  onPick: (stop: FocalStop) => void;
  themeColor: string;
  availableStops?: FocalStop[];
  isFrontFacing?: boolean;
}

function formatStop(stop: FocalStop): string {
  // Drop trailing zeros: 0.5x, 1x, 2x, 3x.
  return `${stop}x`;
}

export default function FocalPills({
  activeStop,
  onPick,
  themeColor,
  availableStops,
  isFrontFacing = false,
}: FocalPillsProps) {
  const { theme } = useTheme();
  const stops =
    availableStops ?? (isFrontFacing ? FRONT_FACING_STOPS : DEFAULT_STOPS);
  const activeFg = readableTextOn(themeColor);

  return (
    <View style={styles.row}>
      {stops.map((stop) => {
        // activeStop === null means user is between stops — highlight nothing
        // rather than lie about which stop is "selected".
        const isActive = activeStop !== null && stop === activeStop;
        return (
          <Pressable
            key={stop}
            onPress={() => {
              hapticsBridge.selection();
              onPick(stop);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${formatStop(stop)} zoom`}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.pill,
              {
                // rgba scrim — pill sits over the live camera preview, no theme
                // surface beneath. Allowed per CLAUDE.md.
                backgroundColor: isActive ? themeColor : 'rgba(0,0,0,0.45)',
                borderColor: theme.glassBorder,
              },
              pressed && { opacity: 0.7 },
            ]}>
            <ThemedText
              variant="caption"
              weight="700"
              align="center"
              style={{ color: isActive ? activeFg : '#fff' }}>
              {formatStop(stop)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
