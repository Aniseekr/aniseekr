import {
  ComponentType,
  ReactElement,
  useEffect,
  useImperativeHandle,
  useState,
  type Ref,
} from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Radius, Size, Spacing, Typography } from '../../constants/DesignSystem';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { isAdSlotEnabled } from '../../libs/services/ads/ad-config';
import { requestNativeAd, type NativeAdLike } from '../../libs/services/ads/native-ad-request';
import { ThemedSurface } from '../themed';
import { nativeAdMediaAspectRatio } from './native-ad-media';

type NativeAdsModule = {
  NativeAdView: ComponentType<{
    nativeAd: NativeAdLike;
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

export interface InlineNativeAdRef {
  /** Start the request for a `deferred` ad. No-op once started. */
  load: () => void;
}

interface Props {
  /**
   * `card` — media on top, for the middle of a long detail page.
   * `row` — icon + text + action, sized to sit between list rows.
   */
  variant: 'card' | 'row';
  /**
   * Hold the request until `ref.load()`. For slots below the fold, so a
   * screen the user never scrolls doesn't spend a request on an unseen ad.
   */
  deferred?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<InlineNativeAdRef>;
}

/**
 * One native ad in the flow of a screen's content. Renders nothing until an
 * ad has loaded, and nothing at all for ad-free subscribers or on a failed
 * request — the slot never reserves blank space.
 */
export function InlineNativeAd({ variant, deferred = false, style, ref }: Props) {
  const t = useT();
  const { theme } = useTheme();
  const { adFree } = useSubscription();
  const enabled = !adFree && isAdSlotEnabled('rate_native');
  const [armed, setArmed] = useState(!deferred);
  const [ad, setAd] = useState<NativeAdLike | null>(null);

  useImperativeHandle(ref, () => ({ load: () => setArmed(true) }), []);

  useEffect(() => {
    if (!enabled || !armed) return;
    let alive = true;
    let loaded: NativeAdLike | null = null;
    void requestNativeAd().then((next) => {
      if (!next) return;
      if (!alive) {
        next.destroy();
        return;
      }
      loaded = next;
      setAd(next);
    });
    return () => {
      alive = false;
      loaded?.destroy();
      setAd(null);
    };
  }, [enabled, armed]);

  if (!ad || !NativeAds) return null;
  const { NativeAdView, NativeMediaView, NativeAsset, NativeAssetType } = NativeAds;

  const primaryText = { color: theme.text.primary };
  const secondaryText = { color: theme.text.secondary };
  const tertiaryFill = { backgroundColor: theme.background.tertiary };
  const badgeFrame = { borderColor: theme.text.tertiary };
  const action = { backgroundColor: theme.background.tertiary, color: theme.text.primary };

  const icon = ad.icon ? (
    <NativeAsset assetType={NativeAssetType.ICON}>
      <Image source={{ uri: ad.icon.url }} style={[styles.icon, tertiaryFill]} />
    </NativeAsset>
  ) : null;

  const headline = (
    <NativeAsset assetType={NativeAssetType.HEADLINE}>
      <Text style={[styles.headline, primaryText]} numberOfLines={variant === 'row' ? 1 : 2}>
        {ad.headline}
      </Text>
    </NativeAsset>
  );

  // "Ad" badge + who it is from. Always present: it is the disclosure.
  const attribution = (
    <View style={styles.attribution}>
      <Text style={[styles.badge, badgeFrame, secondaryText]}>{t('ads.badge')}</Text>
      {ad.advertiser ? (
        <NativeAsset assetType={NativeAssetType.ADVERTISER}>
          <Text style={[styles.attributionText, secondaryText]} numberOfLines={1}>
            {ad.advertiser}
          </Text>
        </NativeAsset>
      ) : (
        <Text style={[styles.attributionText, secondaryText]} numberOfLines={1}>
          {t('ads.sponsored')}
        </Text>
      )}
    </View>
  );

  const callToAction = ad.callToAction ? (
    <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
      <Text style={[styles.action, variant === 'row' && styles.actionRow, action]} numberOfLines={1}>
        {ad.callToAction}
      </Text>
    </NativeAsset>
  ) : null;

  return (
    <Animated.View entering={FadeIn} style={style}>
      <NativeAdView nativeAd={ad}>
        {variant === 'row' ? (
          <ThemedSurface variant="card" style={styles.row}>
            {icon}
            <View style={styles.titleColumn}>
              {headline}
              {attribution}
            </View>
            {callToAction}
          </ThemedSurface>
        ) : (
          <ThemedSurface variant="card" style={styles.card}>
            <NativeMediaView
              resizeMode="contain"
              style={[styles.media, { aspectRatio: nativeAdMediaAspectRatio(ad) }, tertiaryFill]}
            />
            <View style={styles.cardBody}>
              <View style={styles.headerRow}>
                {icon}
                <View style={styles.titleColumn}>
                  {headline}
                  {attribution}
                </View>
              </View>
              {ad.body ? (
                <NativeAsset assetType={NativeAssetType.BODY}>
                  <Text style={[styles.body, secondaryText]} numberOfLines={2}>
                    {ad.body}
                  </Text>
                </NativeAsset>
              ) : null}
              {callToAction}
            </View>
          </ThemedSurface>
        )}
      </NativeAdView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  media: {
    width: '100%',
  },
  cardBody: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.sm,
    // Keeps the action clear of the AdChoices mark the SDK draws in the
    // top-right corner.
    paddingRight: Spacing.xl,
  },
  icon: {
    width: Size.minTouchTarget,
    height: Size.minTouchTarget,
    borderRadius: Radius.card,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xxs,
  },
  headline: {
    ...Typography.titleSmall,
  },
  attribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  badge: {
    ...Typography.captionSmall,
    paddingHorizontal: Spacing.xxs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  attributionText: {
    ...Typography.caption,
    flexShrink: 1,
  },
  body: {
    ...Typography.bodySmall,
  },
  action: {
    ...Typography.titleSmall,
    minHeight: Size.minTouchTarget,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  actionRow: {
    maxWidth: 120,
  },
});
