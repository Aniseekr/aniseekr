import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  icon: IconName;
  label: string;
  color: string;
  onPress: () => void;
};

/**
 * Compact pill rendered in the top bar showing the active swipe mode.
 * Pressing it opens the mode switcher sheet.
 */
function ModePillComponent({ icon, label, color, onPress }: Props) {
  const fg = readableTextOn(color);
  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: color, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label} mode — tap to change`}>
      <Ionicons name={icon} size={15} color={fg} />
      <Text style={[styles.label, { color: fg }]} allowFontScaling={false}>
        {label}
      </Text>
      <View style={styles.caretWrap}>
        <Ionicons name="chevron-down" size={13} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 999,
    minHeight: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  caretWrap: {
    marginLeft: 1,
    opacity: 0.85,
  },
});

export const ModePill = memo(ModePillComponent);
