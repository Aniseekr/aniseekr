import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';

interface CameraTopBarProps {
  sceneName: string;
  subtitleText: string;
  themeColor: string;
  topInset: number;
  onClose: () => void;
  onOpenInfo: () => void;
}

export default function CameraTopBar({
  sceneName,
  subtitleText,
  themeColor,
  topInset,
  onClose,
  onOpenInfo,
}: CameraTopBarProps) {
  return (
    <LinearGradient
      // rgba scrim sits over the live camera preview — no theme surface below.
      colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0)']}
      style={[styles.topBar, { paddingTop: topInset + 8 }]}>
      <Pressable
        onPress={onClose}
        hitSlop={14}
        style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Close camera">
        {/* White icon over dark scrim — allowed exception. */}
        <Ionicons name="close" size={22} color="#fff" />
      </Pressable>
      <View style={styles.topMid}>
        <ThemedText
          variant="titleSmall"
          weight="700"
          align="center"
          style={{ color: '#fff' }}
          numberOfLines={1}>
          {sceneName}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          weight="700"
          align="center"
          style={{ color: themeColor }}
          numberOfLines={1}>
          {subtitleText}
        </ThemedText>
      </View>
      <Pressable
        onPress={onOpenInfo}
        hitSlop={14}
        style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Open framing tips">
        <Ionicons name="information-circle-outline" size={22} color="#fff" />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMid: { flex: 1, gap: 2 },
});
