import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { IconSize, Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import type { StreetViewResult } from '../../../libs/services/pilgrimage/street-view/street-view-service';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../themed';
import { resolveMapillaryKenBurnsMotion } from './ken-burns';

type MapillaryStreetViewResult = Extract<StreetViewResult, { kind: 'mapillary' }>;

const AnimatedView = Animated.View;

export interface MapillaryKenBurnsCardProps {
  result: MapillaryStreetViewResult;
  onUnavailable?: () => void;
  style?: StyleProp<ViewStyle>;
}

function MapillaryKenBurnsCardComponent({
  result,
  onUnavailable,
  style,
}: MapillaryKenBurnsCardProps) {
  const { theme } = useTheme();
  const t = useT();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const image = result.images[0] ?? null;
  const motion = useMemo(
    () =>
      resolveMapillaryKenBurnsMotion({
        isPano: image?.isPano === true,
        width,
        reducedMotion,
      }),
    [image?.isPano, reducedMotion, width]
  );

  useEffect(() => {
    progress.value = 0;
    if (motion.shouldAnimate) {
      progress.value = withRepeat(
        withTiming(1, { duration: motion.durationMs, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [motion.durationMs, motion.shouldAnimate, progress]);

  const imageMotionStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [motion.fromScale, motion.toScale]),
      },
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [motion.fromTranslateX, motion.toTranslateX]
        ),
      },
    ],
  }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const handlePress = useCallback(() => {
    hapticsBridge.tap();
    Linking.openURL(result.googleMapsPanoUrl).catch(() => undefined);
  }, [result.googleMapsPanoUrl]);

  if (!image) return null;

  const imageWidth = width > 0 ? width * motion.imageWidthMultiplier : '100%';

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.streetView.openInGoogleMaps')}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.background.tertiary,
          borderColor: theme.glassBorder,
        },
        pressed && styles.pressed,
        style,
      ]}>
      <View style={styles.media} onLayout={handleLayout}>
        <AnimatedView
          style={[
            styles.imageMotion,
            { width: imageWidth, backgroundColor: theme.background.tertiary },
            imageMotionStyle,
          ]}>
          <Image
            source={{ uri: image.thumb1024Url }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={180}
            onError={onUnavailable}
          />
        </AnimatedView>
        <View
          style={[
            styles.attributionPill,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <ThemedText variant="captionSmall" weight="700" numberOfLines={1}>
            {result.attribution}
          </ThemedText>
        </View>
        <View
          style={[
            styles.actionPill,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <ThemedText variant="captionSmall" tone="secondary" weight="700" numberOfLines={1}>
            {t('pilgrimage.streetView.openInGoogleMaps')}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export const MapillaryKenBurnsCard = memo(MapillaryKenBurnsCardComponent);

const styles = StyleSheet.create({
  card: {
    minHeight: 148,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  media: {
    height: 148,
    overflow: 'hidden',
  },
  imageMotion: {
    height: '100%',
    alignSelf: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  attributionPill: {
    position: 'absolute',
    right: Spacing.xs,
    bottom: Spacing.xs,
    minHeight: IconSize.md,
    maxWidth: '72%',
    borderRadius: Radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  actionPill: {
    position: 'absolute',
    left: Spacing.xs,
    bottom: Spacing.xs,
    minHeight: IconSize.md,
    maxWidth: '52%',
    borderRadius: Radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  pressed: {
    opacity: 0.86,
  },
});
