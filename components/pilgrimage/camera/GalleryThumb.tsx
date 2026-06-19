import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { readableTextOn } from '../../themed';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

export interface GalleryThumbModel {
  thumbUri: string | null;
  count: number;
  isEmpty: boolean;
}

/** Newest capture + count for the bottom-left thumb. Honest empty state (no fake thumbnail). */
export function resolveGalleryThumb(uris: string[]): GalleryThumbModel {
  if (!uris.length) return { thumbUri: null, count: 0, isEmpty: true };
  return { thumbUri: uris[0], count: uris.length, isEmpty: false };
}

interface GalleryThumbProps {
  /** Capture-session uris, newest first. */
  uris: string[];
  themeColor: string;
  /** Import a photo from the system library (empty-state tap + long-press). */
  onPickLibrary: () => void;
  /** Toggle the expanded capture-history strip (non-empty tap). */
  onExpand: () => void;
}

/**
 * Bottom-left gallery affordance. Merges the old floating CaptureHistoryStrip + the ShutterRow
 * library button: shows the newest capture with a count badge (tap → expand history), or an
 * import glyph when empty (tap → library import). Long-press always imports.
 */
function GalleryThumbComponent({ uris, themeColor, onPickLibrary, onExpand }: GalleryThumbProps) {
  const t = useT();
  const { thumbUri, count, isEmpty } = resolveGalleryThumb(uris);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? t('pilgrimageUi.pickPhotoFromLibrary') : t('pilgrimageUi.openRecentCapture')}
      onPress={() => {
        hapticsBridge.tap();
        if (isEmpty) onPickLibrary();
        else onExpand();
      }}
      onLongPress={() => {
        hapticsBridge.longPress();
        onPickLibrary();
      }}
      delayLongPress={250}
      style={[styles.thumb, { borderColor: themeColor }]}>
      {isEmpty || !thumbUri ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={20} color={CameraChrome.fg} />
        </View>
      ) : (
        <>
          <Image source={{ uri: thumbUri }} style={styles.image} contentFit="cover" />
          {count > 1 ? (
            <View style={[styles.badge, { backgroundColor: themeColor }]}>
              <Text style={[styles.badgeText, { color: readableTextOn(themeColor) }]}>{count}</Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: CameraChrome.circleSize,
    height: CameraChrome.circleSize,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: CameraChrome.controlFill,
    alignItems: 'center',
    justifyContent: 'center',
    ...cameraControlShadow,
  },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  image: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
});

export default memo(GalleryThumbComponent);
