import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bottomPad } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { CAMERA_BOTTOM_BAR_CONTENT_HEIGHT } from '../../../libs/services/pilgrimage/camera-ui';
import BurstIndicator from './BurstIndicator';

interface ShutterRowProps {
  themeColor: string;
  referenceImageUrl: string;
  capturing: boolean;
  isLandscape: boolean;
  bottomInset: number;
  /** Status-bar inset — only consumed in landscape so the column avoids the notch. */
  topInset?: number;
  /** Focal-stop pills, rendered along the top of the portrait bottom bar. */
  focalSlot?: ReactNode;
  onShutter: () => void;
  onOpenMap: () => void;
  onPickReference: () => void;
  /** Optional long-press handler. Triggers burst capture in the parent. */
  onLongPress?: () => void;
  /** When `active`, overlay a progress ring on top of the shutter button. */
  burst?: { active: boolean; captured: number; total: number };
}

/** Fixed width of the landscape control rail. Parent uses this to know how
 *  much horizontal space to reserve on the right edge of the camera preview. */
export const SHUTTER_ROW_LANDSCAPE_WIDTH = 100;

export default function ShutterRow({
  themeColor,
  referenceImageUrl,
  capturing,
  isLandscape,
  bottomInset,
  topInset = 0,
  focalSlot,
  onShutter,
  onOpenMap,
  onPickReference,
  onLongPress,
  burst,
}: ShutterRowProps) {
  const burstActive = burst?.active === true;
  const shutterDisabled = capturing || burstActive;

  const handleShutterPress = () => {
    if (shutterDisabled) return;
    hapticsBridge.success();
    onShutter();
  };

  const handleShutterLongPress = onLongPress
    ? () => {
        if (shutterDisabled) return;
        hapticsBridge.longPress();
        onLongPress();
      }
    : undefined;

  const handleMapPress = () => {
    hapticsBridge.tap();
    onOpenMap();
  };

  const handleReferencePress = () => {
    hapticsBridge.tap();
    onPickReference();
  };

  const renderShutter = (landscape: boolean) => (
    <Pressable
      onPress={handleShutterPress}
      onLongPress={handleShutterLongPress}
      delayLongPress={handleShutterLongPress ? 250 : undefined}
      disabled={shutterDisabled}
      accessibilityRole="button"
      accessibilityLabel="Take comparison photo"
      style={({ pressed }) => [
        styles.shutterOuter,
        landscape && styles.shutterOuterLandscape,
        { borderColor: themeColor },
        pressed && { opacity: 0.85 },
        shutterDisabled && { opacity: 0.6 },
      ]}>
      {capturing && !burstActive ? (
        <ActivityIndicator size="small" color={themeColor} />
      ) : (
        <View
          style={[
            styles.shutterInner,
            landscape && styles.shutterInnerLandscape,
            { backgroundColor: themeColor },
          ]}
        />
      )}
      {burstActive && burst ? (
        <BurstIndicator captured={burst.captured} total={burst.total} themeColor={themeColor} />
      ) : null}
    </Pressable>
  );

  if (isLandscape) {
    return (
      <View
        style={[
          styles.barLandscape,
          {
            width: SHUTTER_ROW_LANDSCAPE_WIDTH,
            paddingTop: topInset + 20,
            paddingBottom: bottomPad({ bottom: bottomInset }) + 20,
          },
        ]}>
        <View style={styles.columnContent}>
          <ThumbnailBtn
            kind="reference"
            themeColor={themeColor}
            imageUrl={referenceImageUrl}
            onPress={handleReferencePress}
          />
          {renderShutter(true)}
          <ThumbnailBtn kind="map" themeColor={themeColor} onPress={handleMapPress} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          height: bottomPad({ bottom: bottomInset }) + CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
          paddingBottom: bottomPad({ bottom: bottomInset }),
        },
      ]}>
      {focalSlot ? <View style={styles.focalSlot}>{focalSlot}</View> : null}
      <View style={styles.bottomRow}>
        <ThumbnailBtn kind="map" themeColor={themeColor} onPress={handleMapPress} />
        {renderShutter(false)}
        <ThumbnailBtn
          kind="reference"
          themeColor={themeColor}
          imageUrl={referenceImageUrl}
          onPress={handleReferencePress}
        />
      </View>
    </View>
  );
}

function ThumbnailBtn({
  kind,
  imageUrl,
  themeColor,
  onPress,
}: {
  kind: 'map' | 'reference';
  imageUrl?: string;
  themeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={kind === 'map' ? 'Open map' : 'Show anime reference'}
      style={({ pressed }) => [
        styles.thumbBtn,
        {
          borderColor: kind === 'map' ? themeColor : 'rgba(255,255,255,0.28)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {kind === 'reference' && imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbImage}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={styles.thumbMap}>
          <Ionicons name="map" size={18} color={themeColor} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Solid black letterbox bar — opaque, not a gradient scrim. The literal #000
  // is allowed: the bar sits over the live camera preview, not a theme surface
  // (see CLAUDE.md camera-scrim exception).
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 12,
  },
  // Landscape parks the controls in a solid black right-edge rail.
  barLandscape: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SHUTTER_ROW_LANDSCAPE_WIDTH,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focalSlot: {
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  // Distributes [reference thumb, shutter, map thumb] evenly down the rail.
  columnContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterLandscape: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  shutterInnerLandscape: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  thumbBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbMap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
