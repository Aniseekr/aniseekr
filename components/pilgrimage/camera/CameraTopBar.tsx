import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../themed';
import {
  CAMERA_SIDE_RAIL_WIDTH,
  CAMERA_TOP_BAR_CONTENT_HEIGHT,
  resolveCameraPlaceBadgeLayout,
} from '../../../libs/services/pilgrimage/camera-ui';

// The chrome strip is translucent so the live camera still breathes behind the
// controls. The place name now lives in its own badge so it can sit at the top
// of the landscape camera window and just below the portrait function strip.
// rgba over the preview is allowed (CLAUDE.md camera-scrim exception).
const CHROME_SCRIM = 'rgba(0,0,0,0.5)';
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

interface CameraTopBarProps {
  /** Real spot / location name shown in a translucent floating badge. */
  placeName: string;
  themeColor: string;
  topInset: number;
  /** Side + bottom safe-area insets — non-zero on notched devices. */
  leftInset?: number;
  rightInset?: number;
  bottomInset?: number;
  /** Width reserved by the landscape shutter rail on the opposite side. */
  rightRailWidth?: number;
  /**
   * Landscape collapses the bar into a LEFT vertical rail so the camera is
   * framed left + right (a pillarbox) instead of top + right.
   */
  isLandscape: boolean;
  onClose: () => void;
  /** Header icon buttons (flip / overlay-edit / flash / more). */
  trailingActions?: ReactNode;
}

/**
 * Translucent letterbox chrome for the camera. Portrait → a top strip;
 * landscape → a left rail mirroring the right shutter rail. The location label
 * is rendered as a separate floating translucent badge.
 */
export default function CameraTopBar({
  placeName,
  themeColor,
  topInset,
  leftInset = 0,
  rightInset = 0,
  bottomInset = 0,
  rightRailWidth = 0,
  isLandscape,
  onClose,
  trailingActions,
}: CameraTopBarProps) {
  const placeBadgeLayout = resolveCameraPlaceBadgeLayout({
    isLandscape,
    topInset,
    leftInset,
    rightInset,
    rightRailWidth,
  });

  if (isLandscape) {
    return (
      <>
        <View
          style={[
            styles.rail,
            {
              width: CAMERA_SIDE_RAIL_WIDTH + leftInset,
              paddingTop: topInset + 14,
              paddingBottom: bottomInset + 14,
              paddingLeft: leftInset,
            },
          ]}>
          <CameraHeaderButton
            icon="close"
            accessibilityLabel="Close camera"
            themeColor={themeColor}
            onPress={onClose}
          />
          <View style={styles.railMid} pointerEvents="none" />
          <View style={styles.railTrailing}>{trailingActions}</View>
        </View>
        <PlaceNameBadge placeName={placeName} layout={placeBadgeLayout} />
      </>
    );
  }

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            height: topInset + CAMERA_TOP_BAR_CONTENT_HEIGHT,
            paddingTop: topInset,
            paddingLeft: Math.max(12, leftInset),
            paddingRight: Math.max(12, rightInset),
          },
        ]}>
        <CameraHeaderButton
          icon="close"
          accessibilityLabel="Close camera"
          themeColor={themeColor}
          onPress={onClose}
        />
        <View style={styles.mid} pointerEvents="none" />
        <View style={styles.trailing}>{trailingActions}</View>
      </View>
      <PlaceNameBadge placeName={placeName} layout={placeBadgeLayout} />
    </>
  );
}

interface PlaceNameBadgeProps {
  placeName: string;
  layout: { top: number; left: number; right: number };
}

function PlaceNameBadge({ placeName, layout }: PlaceNameBadgeProps) {
  return (
    <View pointerEvents="none" style={[styles.placeBadgeWrap, layout]}>
      <View style={styles.placeBadge}>
        <ThemedText
          variant="titleSmall"
          weight="700"
          align="center"
          numberOfLines={1}
          style={styles.placeBadgeText}>
          {placeName}
        </ThemedText>
      </View>
    </View>
  );
}

interface CameraHeaderButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  themeColor: string;
  onPress: () => void;
  /** Toggled state — paints a filled themeColor disc behind the icon. */
  active?: boolean;
  accessibilityState?: { selected?: boolean; expanded?: boolean };
}

/**
 * The single camera-chrome icon button. Bare (no background) when idle so the
 * translucent strip stays clean; a filled themeColor disc marks the toggled
 * state. Every top-bar action routes through this so they never drift apart.
 */
export function CameraHeaderButton({
  icon,
  accessibilityLabel,
  themeColor,
  onPress,
  active = false,
  accessibilityState,
}: CameraHeaderButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.55 }]}>
      <View style={[styles.btnInner, active && { backgroundColor: themeColor }]}>
        {/* White icon over the strip; dark icon over the themeColor disc. The
            shadow keeps the bare white icon legible on bright scenes. */}
        <Ionicons
          name={icon}
          size={19}
          color={active ? readableTextOn(themeColor) : '#fff'}
          style={active ? undefined : TEXT_SHADOW}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Translucent strip — the live camera shows through it.
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: CHROME_SCRIM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Landscape: a translucent left rail mirroring the right shutter rail.
  rail: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: CHROME_SCRIM,
    alignItems: 'center',
  },
  mid: { flex: 1, gap: 1 },
  railMid: { flex: 1, justifyContent: 'center', paddingHorizontal: 6 },
  placeBadgeWrap: {
    position: 'absolute',
    zIndex: 70,
    alignItems: 'center',
  },
  placeBadge: {
    maxWidth: '100%',
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  placeBadgeText: { color: '#fff', ...TEXT_SHADOW },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  // The portrait bar fits its trailing actions in one row; the landscape rail
  // is only ~100px wide, so 7 actions wrap into two columns to stay clear of
  // the close button and the bottom inset on short landscape windows.
  railTrailing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 76,
    justifyContent: 'center',
    gap: 6,
  },
  btn: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
