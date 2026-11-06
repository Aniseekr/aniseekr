import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { Size, Spacing } from '../../../constants/DesignSystem';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

interface ImportReferencePillProps {
  /** Episode number of the scene this spot appears in, when Atlas knows it. */
  episode?: string;
  /** Scene timestamp (mm:ss), when Atlas knows it. */
  time?: string;
  importing: boolean;
  onPress: () => void;
}

/**
 * The one affordance the camera shows before a reference exists: a light glass
 * pill that opens the photo library straight away. The episode / timestamp hint
 * tells the user which frame to screenshot — it is the only scene knowledge we
 * have, since Atlas carries no scene images. rgba / #fff values sit over the
 * live preview (camera-scrim exception).
 */
export default function ImportReferencePill({
  episode,
  time,
  importing,
  onPress,
}: ImportReferencePillProps) {
  const t = useT();
  const hint = episode
    ? time
      ? t('pilgrimage.camera.referenceHint', { episode, time })
      : t('pilgrimage.identify.episodeLabel', { episode })
    : null;

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)}>
      <Pressable
        onPress={() => {
          if (importing) return;
          hapticsBridge.tap();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          hint
            ? `${t('pilgrimage.camera.importSceneScreenshot')}, ${hint}`
            : t('pilgrimage.camera.importSceneScreenshot')
        }
        accessibilityState={{ busy: importing }}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        {importing ? (
          <ActivityIndicator size="small" color={CameraChrome.fg} />
        ) : (
          <Ionicons name="images-outline" size={CameraChrome.iconSize} color={CameraChrome.fg} />
        )}
        <View style={styles.text}>
          <ThemedText variant="titleSmall" weight="700" numberOfLines={1} style={styles.label}>
            {t('pilgrimage.camera.importSceneScreenshot')}
          </ThemedText>
          {hint ? (
            <ThemedText variant="captionSmall" numberOfLines={1} style={styles.hint}>
              {hint}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: Size.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: CameraChrome.groupRadius,
    borderWidth: 1,
    borderColor: CameraChrome.borderStrong,
    backgroundColor: CameraChrome.groupFill,
    ...cameraControlShadow,
  },
  pressed: { backgroundColor: CameraChrome.pressedFill },
  text: { flexShrink: 1 },
  label: { color: CameraChrome.fg },
  hint: { color: CameraChrome.fgMuted },
});
