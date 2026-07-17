import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ON_DARK, readableTextOn, ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import { CameraChrome } from './cameraChrome';
import { toastEnter, toastExit } from '../../../libs/animations/presets';

/**
 * A fresh object identity each time auto-capture fires re-triggers the toast —
 * `null` until the first auto-shot so nothing shows on mount.
 */
export interface AutoCaptureToastValue {
  /** Running count of shots in the capture session AFTER this auto-shot landed. */
  sessionCount: number;
}

const VISIBLE_MS = 1500;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 280;

interface AutoCaptureToastProps {
  /** `null` until the first auto-shot; a fresh object each fire re-triggers. */
  toast: AutoCaptureToastValue | null;
  themeColor: string;
}

/**
 * Brief, non-interactive toast confirming an auto-capture shot. Auto-capture
 * keeps the user on the camera (no navigation), so this is the only feedback
 * that tells them a shot was banked — the count is the real session length.
 */
export default function AutoCaptureToast({ toast, themeColor }: AutoCaptureToastProps) {
  const t = useT();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    if (!toast) return;
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS }),
      withDelay(VISIBLE_MS, withTiming(0, { duration: FADE_OUT_MS }))
    );
    translateY.value = withSequence(
      withTiming(0, { duration: FADE_IN_MS }),
      withDelay(VISIBLE_MS, withTiming(8, { duration: FADE_OUT_MS }))
    );
  }, [toast, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;

  return (
    <Animated.View
      entering={toastEnter()}
      exiting={toastExit()}
      pointerEvents="none"
      style={[styles.toast, animatedStyle]}>
      <View style={[styles.iconBadge, { backgroundColor: themeColor }]}>
        <Ionicons name="sparkles-outline" size={15} color={readableTextOn(themeColor)} />
      </View>
      <ThemedText variant="caption" weight="700" style={styles.label}>
        {t('pilgrimageUi.autoCaptured', { count: toast.sessionCount })}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // rgba scrim over the live camera preview — no theme surface below it
  // (CLAUDE.md camera-scrim exception).
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: CameraChrome.chipRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: ON_DARK },
});
