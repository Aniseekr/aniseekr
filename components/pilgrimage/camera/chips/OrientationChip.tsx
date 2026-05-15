import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { CameraOrientationMode } from '../../../../libs/services/pilgrimage/camera-ui';

interface OrientationChipProps {
  mode: CameraOrientationMode;
  onChange: (next: CameraOrientationMode) => void;
}

const LABEL: Record<CameraOrientationMode, string> = {
  auto: 'AUTO',
  landscape: 'LAND',
};

const ICON: Record<CameraOrientationMode, keyof typeof Ionicons.glyphMap> = {
  auto: 'phone-portrait-outline',
  landscape: 'phone-landscape-outline',
};

export default function OrientationChip({ mode, onChange }: OrientationChipProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    hapticsBridge.selection();
    onChange(mode === 'landscape' ? 'auto' : 'landscape');
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Orientation ${LABEL[mode]}`}
      accessibilityState={{ selected: mode === 'landscape' }}
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — no theme surface below.
        { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: theme.glassBorder },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.row}>
        <Ionicons name={ICON[mode]} size={16} color="#fff" />
        <ThemedText variant="caption" style={styles.label}>
          {LABEL[mode]}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 44,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: '#fff',
  },
});
