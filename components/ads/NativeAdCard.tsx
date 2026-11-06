import {
  ComponentType,
  ReactElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  getClaimedRateNativeAd,
  releaseRateNativeAd,
  type NativeAdLike,
} from '../../libs/services/ads/rate-native-ad-pool';
import { RATE_NATIVE_AD_DWELL_MS } from '../../libs/services/ads/rate-native-ad-session';
import { useTheme } from '../../context/ThemeContext';
import { readableTextOn } from '../themed';
import { Radius, Shadow, Spacing, Typography } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import {
  getStackRevealTranslation,
  runSwipeHandoff,
  SWIPE_COMMIT_THRESHOLD_PX,
  SWIPE_COMMIT_VELOCITY_PX_S,
} from '../../libs/services/rate/swipe-animation';

type NativeAdsModule = {
  NativeAdView: ComponentType<{
    nativeAd: NativeAdLike;
    style?: unknown;
    children?: ReactElement | ReactElement[];
  }>;
  NativeMediaView: ComponentType<{ resizeMode?: 'cover' | 'contain' | 'stretch'; style?: unknown }>;
  NativeAsset: ComponentType<{ assetType: string; children: ReactElement }>;
  NativeAssetType: {
    ADVERTISER: string;
    BODY: string;
    CALL_TO_ACTION: string;
    HEADLINE: string;
    ICON: string;
  };
};

let NativeAds: NativeAdsModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-google-mobile-ads');
  if (mod.NativeAdView && mod.NativeMediaView && mod.NativeAsset) {
    NativeAds = mod as NativeAdsModule;
  }
} catch {
  NativeAds = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AD_MEDIA_HEIGHT = 260;
// Drag follow factor while the dwell window is still running — the card
// gives under the finger instead of feeling dead, then springs back.
const LOCKED_DRAG_RESISTANCE = 0.2;

const RESET_SPRING_CONFIG = {
  damping: 18,
  stiffness: 180,
  mass: 1,
  overshootClamping: true,
};

const EXIT_SPRING_CONFIG = {
  damping: 20,
  stiffness: 120,
  overshootClamping: true,
};

export interface NativeAdCardRef {
  swipe: (direction: 'left' | 'right') => void;
}

interface Props {
  /** Deck item id the ad was claimed under in rate-native-ad-pool. */
  adId: string;
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  activeTranslation?: SharedValue<number>;
  ref?: Ref<NativeAdCardRef>;
}

export function NativeAdCard({ adId, isTop, onSwipe, activeTranslation, ref }: Props) {
  const t = useT();
  const { theme } = useTheme();
  // The deck only inserts an ad item after its ad loaded, so this is set on
  // frame 1. Null only if the item outlived its ad (screen-level release).
  const [nativeAd] = useState<NativeAdLike | null>(() => getClaimedRateNativeAd(adId));

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const progress = useSharedValue(0);
  const unlocked = useSharedValue(false);
  const unlockedRef = useRef(false);
  const pendingDirectionRef = useRef<'left' | 'right' | null>(null);
  const handedOffRef = useRef(false);

  useEffect(() => () => releaseRateNativeAd(adId), [adId]);

  const flingOut = useCallback(
    (direction: 'left' | 'right', velocityX: number) => {
      if (handedOffRef.current) return;
      handedOffRef.current = true;
      translateX.value = withSpring(
        direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5,
        {
          ...EXIT_SPRING_CONFIG,
          velocity: velocityX,
        }
      );
      if (activeTranslation) {
        activeTranslation.value = withSpring(
          getStackRevealTranslation(direction),
          EXIT_SPRING_CONFIG
        );
      }
      rotate.value = withSpring(direction === 'right' ? 25 : -25, {
        velocity: velocityX / 10,
        damping: 20,
        stiffness: 120,
      });
      translateY.value = withSpring(-50, { damping: 20, stiffness: 120 });
      runSwipeHandoff(direction, onSwipe);
    },
    [activeTranslation, onSwipe, rotate, translateX, translateY]
  );

  const unlock = useCallback(() => {
    unlockedRef.current = true;
    const pending = pendingDirectionRef.current;
    pendingDirectionRef.current = null;
    if (pending) flingOut(pending, pending === 'right' ? 2000 : -2000);
  }, [flingOut]);

  useImperativeHandle(
    ref,
    () => ({
      swipe: (direction: 'left' | 'right') => {
        // A button tap during the dwell window is queued, not dropped.
        if (!unlockedRef.current) {
          pendingDirectionRef.current = direction;
          return;
        }
        flingOut(direction, direction === 'right' ? 2000 : -2000);
      },
    }),
    [flingOut]
  );

  // Edge case: the ad was released before this card reached the top. Pass
  // straight through rather than showing an empty card.
  useEffect(() => {
    if (!isTop || nativeAd) return;
    if (handedOffRef.current) return;
    handedOffRef.current = true;
    runSwipeHandoff('left', onSwipe);
  }, [isTop, nativeAd, onSwipe]);

  useEffect(() => {
    if (!isTop || !nativeAd) return;
    progress.value = withTiming(1, { duration: RATE_NATIVE_AD_DWELL_MS }, (finished) => {
      if (!finished) return;
      unlocked.value = true;
      scheduleOnRN(unlock);
    });
  }, [isTop, nativeAd, progress, unlock, unlocked]);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, RESET_SPRING_CONFIG);
    translateY.value = withSpring(0, RESET_SPRING_CONFIG);
    rotate.value = withSpring(0, RESET_SPRING_CONFIG);
    if (activeTranslation) {
      activeTranslation.value = withSpring(0, RESET_SPRING_CONFIG);
    }
  }, [activeTranslation, rotate, translateX, translateY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isTop && !!nativeAd)
        .onChange((event) => {
          const follow = unlocked.value ? 1 : LOCKED_DRAG_RESISTANCE;
          const x = event.translationX * follow;
          translateX.value = x;
          translateY.value = event.translationY * 0.5 * follow;
          if (activeTranslation) {
            activeTranslation.value = unlocked.value ? x : 0;
          }
          rotate.value = (x / SCREEN_WIDTH) * 15;
        })
        .onEnd((event) => {
          const distance = event.translationX;
          const velocity = event.velocityX;
          const committed =
            Math.abs(distance) > SWIPE_COMMIT_THRESHOLD_PX ||
            Math.abs(velocity) > SWIPE_COMMIT_VELOCITY_PX_S;
          if (unlocked.value && committed) {
            scheduleOnRN(flingOut, distance > 0 ? 'right' : 'left', velocity);
          } else {
            scheduleOnRN(resetPosition);
          }
        }),
    [
      isTop,
      nativeAd,
      activeTranslation,
      flingOut,
      resetPosition,
      rotate,
      translateX,
      translateY,
      unlocked,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotate.value}deg` },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(progress.value, 1) * 100}%`,
    opacity: withTiming(unlocked.value ? 0 : 1, { duration: 160 }),
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: withTiming(unlocked.value ? 1 : 0, { duration: 200 }),
  }));

  const ctaBackground = theme.accent;
  const ctaForeground = readableTextOn(ctaBackground);
  const colors = {
    card: { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
    tertiary: { backgroundColor: theme.background.tertiary },
    primaryText: { color: theme.text.primary },
    secondaryText: { color: theme.text.secondary },
    tertiaryText: { color: theme.text.tertiary },
    cta: { backgroundColor: ctaBackground, color: ctaForeground },
    progress: { backgroundColor: theme.accent },
  };

  const renderLive = isTop && nativeAd && NativeAds;
  const previewImage = nativeAd?.images?.[0]?.url ?? null;
  const sponsored = (
    <Text style={[styles.advertiser, colors.secondaryText]}>{t('ads.sponsored')}</Text>
  );

  const renderContent = () => {
    if (!nativeAd) return null;
    if (renderLive) {
      const { NativeAdView, NativeMediaView, NativeAsset, NativeAssetType } = NativeAds!;
      return (
        <NativeAdView nativeAd={nativeAd} style={styles.adBody}>
          <NativeMediaView resizeMode="cover" style={[styles.media, colors.tertiary]} />
          <View style={styles.content}>
            <View style={styles.headerRow}>
              {nativeAd.icon ? (
                <NativeAsset assetType={NativeAssetType.ICON}>
                  <Image
                    source={{ uri: nativeAd.icon.url }}
                    style={[styles.icon, colors.tertiary]}
                  />
                </NativeAsset>
              ) : null}
              <View style={styles.titleColumn}>
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                  <Text style={[styles.headline, colors.primaryText]} numberOfLines={2}>
                    {nativeAd.headline}
                  </Text>
                </NativeAsset>
                {nativeAd.advertiser ? (
                  <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                    <Text style={[styles.advertiser, colors.secondaryText]} numberOfLines={1}>
                      {nativeAd.advertiser}
                    </Text>
                  </NativeAsset>
                ) : (
                  sponsored
                )}
              </View>
            </View>
            {nativeAd.body ? (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text style={[styles.bodyText, colors.secondaryText]} numberOfLines={3}>
                  {nativeAd.body}
                </Text>
              </NativeAsset>
            ) : null}
            {nativeAd.callToAction ? (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text style={[styles.ctaText, colors.cta]} numberOfLines={1}>
                  {nativeAd.callToAction}
                </Text>
              </NativeAsset>
            ) : null}
          </View>
        </NativeAdView>
      );
    }

    // Behind the top card: same layout, plain views. The NativeAdView (and its
    // impression) only mounts once the ad is actually the top card.
    return (
      <View style={styles.adBody}>
        {previewImage ? (
          <Image source={{ uri: previewImage }} style={[styles.media, colors.tertiary]} />
        ) : (
          <View style={[styles.media, colors.tertiary]} />
        )}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            {nativeAd.icon ? (
              <Image source={{ uri: nativeAd.icon.url }} style={[styles.icon, colors.tertiary]} />
            ) : null}
            <View style={styles.titleColumn}>
              <Text style={[styles.headline, colors.primaryText]} numberOfLines={2}>
                {nativeAd.headline}
              </Text>
              {nativeAd.advertiser ? (
                <Text style={[styles.advertiser, colors.secondaryText]} numberOfLines={1}>
                  {nativeAd.advertiser}
                </Text>
              ) : (
                sponsored
              )}
            </View>
          </View>
          {nativeAd.body ? (
            <Text style={[styles.bodyText, colors.secondaryText]} numberOfLines={3}>
              {nativeAd.body}
            </Text>
          ) : null}
          {nativeAd.callToAction ? (
            <Text style={[styles.ctaText, colors.cta]} numberOfLines={1}>
              {nativeAd.callToAction}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container} pointerEvents={isTop ? 'auto' : 'none'}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, colors.card, animatedStyle]}>
          <View style={[styles.label, colors.card]}>
            <Text style={[styles.labelText, colors.tertiaryText]}>{t('ads.badge')}</Text>
          </View>
          {renderContent()}
          {isTop && nativeAd ? (
            <View style={styles.dismissControls} pointerEvents="none">
              <View style={styles.footerSlot}>
                <Animated.View style={[styles.progressBar, colors.progress, progressStyle]} />
                <Animated.Text style={[styles.hintText, colors.tertiaryText, hintStyle]}>
                  {t('ads.swipeToContinue')}
                </Animated.Text>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...Shadow.heavy,
  },
  label: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  labelText: {
    ...Typography.captionSmall,
    letterSpacing: 0.5,
  },
  adBody: {
    flex: 1,
    width: '100%',
  },
  media: {
    width: '100%',
    height: AD_MEDIA_HEIGHT,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headline: {
    ...Typography.titleLarge,
  },
  advertiser: {
    ...Typography.caption,
  },
  bodyText: {
    ...Typography.bodyMedium,
  },
  ctaText: {
    ...Typography.titleMedium,
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  dismissControls: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.md,
  },
  footerSlot: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: Radius.sm,
  },
  hintText: {
    ...Typography.caption,
  },
});
