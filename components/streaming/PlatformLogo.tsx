/**
 * Render a streaming platform's brand mark in a perfectly round disc.
 *
 * Tiered fallback. Every tier upgrades the previous on error, then we land
 * on the monogram so the disc is never blank.
 *
 *   0. iconUrl (optional)     — pinned square asset (e.g. Play Store / App
 *      Store icon) for platforms where favicon/clearbit don't carry the right
 *      mark. Used by 動漫瘋 (gamer.com.tw favicon is the Bahamut dragon, not
 *      the dedicated 動漫瘋 logo).
 *   1. Google S2 favicons     — cover fit, fills the disc, cropped to circle
 *      (covers 木棉花, ANIPLUS, and every other site since they all ship some
 *      favicon — quality may vary but the shape is always round.)
 *   2. clearbit logo CDN      — contain fit with subtle inset for wordmark logos
 *   3. Monogram letters       — offline-safe identity (brand-color text)
 *
 * The disc itself is round (borderRadius = size/2). When the source image
 * is square (favicons / Play Store icons), `contentFit="cover"` plus
 * `overflow:'hidden'` makes the result a perfect circle. When the source
 * is wider (clearbit wordmark), `contentFit="contain"` keeps the wordmark
 * readable inside the disc.
 *
 * The disc background colour is configurable so this component works on
 * the dark anime-detail/settings screens (white disc to make brand marks
 * pop) and on the white CTA pill (transparent disc so the mark sits on
 * the pill directly).
 */

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

export interface PlatformLogoProps {
  size: number;
  /** Domain used to look up the logo. Null skips remote sources entirely. */
  logoDomain: string | null;
  /**
   * Optional direct URL to a square brand icon. Tried before favicon/clearbit
   * so individual platforms can pin a known-good asset (Play Store / App
   * Store icons render well at any size).
   */
  iconUrl?: string;
  /** 1–2 character fallback monogram. Required so every platform has identity offline. */
  monogram: string;
  /** Brand color used for the monogram text and (when no override) ring/border. */
  brandColor: string;
  /** Disc background color. Defaults to white so brand logos pop on dark screens. */
  background?: string;
  /** Monogram text color. Defaults to `brandColor`. */
  monogramColor?: string;
  /** Optional outer container style override (e.g. border for primary highlight). */
  containerStyle?: StyleProp<ViewStyle>;
}

interface SourceTier {
  uri: string;
  fit: 'cover' | 'contain';
  inset: number;
}

export function PlatformLogo({
  size,
  logoDomain,
  iconUrl,
  monogram,
  brandColor,
  background = '#FFFFFF',
  monogramColor,
  containerStyle,
}: PlatformLogoProps) {
  const [tierIndex, setTierIndex] = useState(0);
  const radius = size / 2;
  const monoColor = monogramColor ?? brandColor;

  // Clearbit takes a size hint in px; request ~2× the rendered size for
  // crisp retina output. Cap at 256.
  const fetchSize = Math.min(256, Math.max(32, Math.round(size * 2)));
  // 8% inset for clearbit wordmarks — tighter than before so the mark looks
  // more confident inside the disc.
  const clearbitInset = Math.round(size * 0.08);

  const tiers = useMemo<SourceTier[]>(() => {
    const list: SourceTier[] = [];
    if (iconUrl) {
      // Pinned square asset — fills the disc and crops to a clean circle.
      list.push({ uri: iconUrl, fit: 'cover', inset: 0 });
    }
    if (logoDomain) {
      list.push({
        uri: `https://www.google.com/s2/favicons?domain=${logoDomain}&sz=128`,
        fit: 'cover',
        inset: 0,
      });
      list.push({
        uri: `https://logo.clearbit.com/${logoDomain}?size=${fetchSize}`,
        fit: 'contain',
        inset: clearbitInset,
      });
    }
    return list;
  }, [iconUrl, logoDomain, fetchSize, clearbitInset]);

  // Reset to the first tier whenever the source list changes — otherwise the
  // CTA's PlatformLogo (single instance, primary platform swapped in/out)
  // would keep a stale post-error index when the user picks a new primary.
  const tiersKey = tiers.map((t) => t.uri).join('|');
  const [prevTiersKey, setPrevTiersKey] = useState(tiersKey);
  if (prevTiersKey !== tiersKey) {
    setPrevTiersKey(tiersKey);
    setTierIndex(0);
  }

  const tier = tiers[tierIndex] ?? null;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        containerStyle,
      ]}>
      {tier ? (
        <Image
          key={tier.uri}
          source={{ uri: tier.uri }}
          style={[
            StyleSheet.absoluteFillObject,
            tier.inset > 0
              ? {
                  top: tier.inset,
                  left: tier.inset,
                  right: tier.inset,
                  bottom: tier.inset,
                }
              : null,
          ]}
          contentFit={tier.fit}
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setTierIndex((idx) => idx + 1)}
        />
      ) : (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            color: monoColor,
            fontSize: size * 0.42,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}>
          {monogram}
        </Text>
      )}
    </View>
  );
}
