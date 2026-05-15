import type { ReactNode } from 'react';
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
  showActions?: boolean;
  /**
   * Extra action buttons rendered to the right of the info button. Used by the
   * landscape layout to surface camera-swap + orientation toggle in the top
   * bar instead of cramming them into the bottom tool drawer.
   */
  trailingActions?: ReactNode;
  /** Compact mode tightens horizontal padding + drops the subtitle line. */
  compact?: boolean;
  /**
   * Safe-area insets for the side edges. Critical in landscape on Android —
   * the system status bar (signal/battery/camera indicator) lives on the long
   * edge, so without `rightInset` padding the trailing actions sit directly
   * under those icons. iOS landscape notches also report non-zero values
   * here. Default 0 for portrait callers that don't care.
   */
  leftInset?: number;
  rightInset?: number;
}

export default function CameraTopBar({
  sceneName,
  subtitleText,
  themeColor,
  topInset,
  onClose,
  onOpenInfo,
  showActions = true,
  trailingActions,
  compact = false,
  leftInset = 0,
  rightInset = 0,
}: CameraTopBarProps) {
  // Compact (landscape) needs noticeably more side breathing room than portrait
  // — Android renders the system status bar (signal/battery/camera indicator)
  // on the long edge in landscape, and on many rotations `insets.right` is 0
  // even though those icons are clearly present. The min keeps the trailing
  // actions clear of those icons.
  const basePadH = compact ? 24 : 14;
  return (
    <LinearGradient
      // rgba scrim sits over the live camera preview — no theme surface below.
      colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0)']}
      style={[
        styles.topBar,
        compact && styles.topBarCompact,
        {
          paddingTop: topInset + (compact ? 4 : 8),
          paddingLeft: Math.max(basePadH, leftInset),
          paddingRight: Math.max(basePadH, rightInset),
        },
      ]}>
      {showActions ? (
        <Pressable
          onPress={onClose}
          hitSlop={14}
          style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Close camera">
          {/* White icon over dark scrim — allowed exception. */}
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      ) : (
        <View pointerEvents="none" style={styles.topBtnSpacer} />
      )}
      <View style={styles.topMid}>
        <ThemedText
          variant={compact ? 'caption' : 'titleSmall'}
          weight="700"
          align="center"
          style={{ color: '#fff' }}
          numberOfLines={1}>
          {sceneName}
        </ThemedText>
        {compact ? null : (
          <ThemedText
            variant="captionSmall"
            weight="700"
            align="center"
            style={{ color: themeColor }}
            numberOfLines={1}>
            {subtitleText}
          </ThemedText>
        )}
        {compact ? (
          <ThemedText
            variant="captionSmall"
            weight="600"
            align="center"
            style={{ color: themeColor }}
            numberOfLines={1}>
            {subtitleText}
          </ThemedText>
        ) : null}
      </View>
      {showActions ? (
        <View style={styles.trailingGroup}>
          <Pressable
            onPress={onOpenInfo}
            hitSlop={14}
            style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Open framing tips">
            <Ionicons name="information-circle-outline" size={22} color="#fff" />
          </Pressable>
          {trailingActions}
        </View>
      ) : (
        <View pointerEvents="none" style={styles.topBtnSpacer} />
      )}
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
    paddingBottom: 14,
    gap: 8,
  },
  topBarCompact: {
    paddingBottom: 8,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBtnSpacer: {
    width: 36,
    height: 36,
  },
  topMid: { flex: 1, gap: 2 },
  trailingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
