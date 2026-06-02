// Interactive crop modal — Track B #7 of the composer pipeline plan.
//
// The image is rendered at "cover" scale inside a fixed-aspect frame. Users
// drag the image behind the frame to position what gets kept; aspect chips
// let them switch presets. On Apply the screen calls expo-image-manipulator
// with the source-pixel crop region computed by `panToCropRegion`. The crop
// math lives in libs/services/pilgrimage/share-filters.ts so it stays
// unit-tested (per CLAUDE.md rule 9, gesture values never enter React
// state — they live on Reanimated SharedValues).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image as RNImage,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import {
  panToCropRegion,
  resolveCropAspect,
  type CropAspectId,
} from '../../libs/services/pilgrimage/share-filters';

export type CropSheetProps = {
  visible: boolean;
  sourceUri: string;
  referenceUri?: string | null;
  onCancel: () => void;
  onApply: (croppedUri: string) => void;
};

const ASPECTS: { id: CropAspectId; label: string; hint: string }[] = [
  { id: 'free', label: 'Free', hint: 'No crop' },
  { id: 'square', label: '1:1', hint: 'Feed' },
  { id: 'portrait', label: '9:16', hint: 'Story' },
  { id: 'landscape', label: '16:9', hint: 'X' },
  { id: 'matchReference', label: 'Match', hint: 'Same as anime' },
];

export function CropSheet({ visible, sourceUri, referenceUri, onCancel, onApply }: CropSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);

  const [aspect, setAspect] = useState<CropAspectId>('square');
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [refSize, setRefSize] = useState<{ w: number; h: number } | null>(null);
  const [applying, setApplying] = useState(false);

  // Reanimated state — never touches React (Rule 9).
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const zoom = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const savedZoom = useSharedValue(1);

  useEffect(() => {
    if (!visible || !sourceUri) return;
    let mounted = true;
    RNImage.getSize(
      sourceUri,
      (w, h) => {
        if (mounted) setImageSize({ w, h });
      },
      () => {
        if (mounted) setImageSize(null);
      }
    );
    return () => {
      mounted = false;
    };
  }, [visible, sourceUri]);

  useEffect(() => {
    if (!visible || !referenceUri) {
      setRefSize(null);
      return;
    }
    let mounted = true;
    RNImage.getSize(
      referenceUri,
      (w, h) => {
        if (mounted) setRefSize({ w, h });
      },
      () => {
        if (mounted) setRefSize(null);
      }
    );
    return () => {
      mounted = false;
    };
  }, [visible, referenceUri]);

  const targetAspect = useMemo(
    () => resolveCropAspect(aspect, refSize?.w ?? 0, refSize?.h ?? 0),
    [aspect, refSize]
  );

  const viewportPadding = Spacing.md;
  const availW = winW - viewportPadding * 2;
  const availH = winH - insets.top - insets.bottom - 220;
  const frame = useMemo(() => {
    if (targetAspect == null) {
      // "Free" — frame matches the source aspect (no crop), max size.
      if (!imageSize) return { w: availW, h: availW };
      const srcAspect = imageSize.w / imageSize.h;
      if (srcAspect > availW / availH) {
        return { w: availW, h: availW / srcAspect };
      }
      return { w: availH * srcAspect, h: availH };
    }
    if (targetAspect > availW / availH) {
      return { w: availW, h: availW / targetAspect };
    }
    return { w: availH * targetAspect, h: availH };
  }, [targetAspect, imageSize, availW, availH]);

  // Cover-scale display dimensions for the source image inside the frame.
  const display = useMemo(() => {
    if (!imageSize) return null;
    const scale = Math.max(frame.w / imageSize.w, frame.h / imageSize.h);
    return {
      scale,
      width: imageSize.w * scale,
      height: imageSize.h * scale,
    };
  }, [imageSize, frame]);

  // Reset pan + zoom whenever the frame or image changes so the user never
  // sees a stale offset that would clip outside bounds.
  useEffect(() => {
    tx.value = 0;
    ty.value = 0;
    zoom.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
    savedZoom.value = 1;
  }, [aspect, imageSize, tx, ty, zoom, savedTx, savedTy, savedZoom]);

  // Plain-number geometry captured for the worklets. The pan limit is the
  // overflow of the *zoomed* image past the fixed frame each side:
  //   (displayW * zoom - frame.w) / 2
  // NOT panMax_base * zoom — the frame size is constant across zoom, so scaling
  // the base limit collapses pan to 0 on the cover-limiting axis once zoomed.
  const displayW = display?.width ?? 0;
  const displayH = display?.height ?? 0;
  const frameW = frame.w;
  const frameH = frame.h;

  const composedGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onUpdate((e) => {
        'worklet';
        const maxX = Math.max(0, (displayW * zoom.value - frameW) / 2);
        const maxY = Math.max(0, (displayH * zoom.value - frameH) / 2);
        tx.value = clampWorklet(savedTx.value + e.translationX, -maxX, maxX);
        ty.value = clampWorklet(savedTy.value + e.translationY, -maxY, maxY);
      })
      .onEnd(() => {
        'worklet';
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        tx.value = withTiming(savedTx.value, { duration: 80 });
        ty.value = withTiming(savedTy.value, { duration: 80 });
      });

    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        'worklet';
        const next = savedZoom.value * e.scale;
        zoom.value = clampWorklet(next, 1, 4);
      })
      .onEnd(() => {
        'worklet';
        savedZoom.value = zoom.value;
        // Re-clamp pan after zoom changes so we don't show transparent edges.
        const maxX = Math.max(0, (displayW * zoom.value - frameW) / 2);
        const maxY = Math.max(0, (displayH * zoom.value - frameH) / 2);
        tx.value = withTiming(clampWorklet(tx.value, -maxX, maxX), { duration: 80 });
        ty.value = withTiming(clampWorklet(ty.value, -maxY, maxY), { duration: 80 });
        savedTx.value = clampWorklet(tx.value, -maxX, maxX);
        savedTy.value = clampWorklet(ty.value, -maxY, maxY);
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [displayW, displayH, frameW, frameH, tx, ty, zoom, savedTx, savedTy, savedZoom]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }],
  }));

  const handleApply = useCallback(async () => {
    if (!imageSize || !display || applying) return;
    setApplying(true);
    hapticsBridge.success();
    try {
      // `free` (no aspect) and source-matching aspects can just return the
      // original uri — image-manipulator is a no-op in that case.
      if (targetAspect == null) {
        onApply(sourceUri);
        return;
      }
      const region = panToCropRegion(
        { w: imageSize.w, h: imageSize.h },
        { w: frame.w, h: frame.h },
        { x: tx.value, y: ty.value },
        zoom.value
      );
      const result = await ImageManipulator.manipulateAsync(sourceUri, [{ crop: region }], {
        format: ImageManipulator.SaveFormat.PNG,
        compress: 0.95,
      });
      onApply(result.uri);
    } catch (err) {
      console.warn('crop apply failed', err);
    } finally {
      setApplying(false);
    }
  }, [imageSize, display, applying, targetAspect, frame, tx, ty, zoom, sourceUri, onApply]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
      statusBarTranslucent>
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <CropHeader
          theme={theme}
          accent={accent}
          accentFg={accentFg}
          applying={applying}
          onCancel={onCancel}
          onApply={handleApply}
        />

        <View style={styles.viewport}>
          <View style={[styles.frame, { width: frame.w, height: frame.h }]}>
            {imageSize ? (
              <GestureDetector gesture={composedGesture}>
                <Animated.View style={[styles.imageWrap, animatedStyle]}>
                  <ExpoImage
                    source={{ uri: sourceUri }}
                    style={{
                      width: display ? display.width : frame.w,
                      height: display ? display.height : frame.h,
                    }}
                    contentFit="cover"
                  />
                </Animated.View>
              </GestureDetector>
            ) : (
              <View style={styles.imagePlaceholder} />
            )}
            <CropGrid color={theme.text.primary} />
          </View>
        </View>

        <View style={styles.aspectRow}>
          {ASPECTS.map((a) => {
            const active = a.id === aspect;
            const disabled = a.id === 'matchReference' && !refSize;
            return (
              <Pressable
                key={a.id}
                onPress={() => {
                  if (disabled) return;
                  hapticsBridge.selection();
                  setAspect(a.id);
                }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Crop aspect ${a.label}`}
                accessibilityState={{ selected: active, disabled }}
                style={({ pressed }) => [
                  styles.aspectChip,
                  {
                    backgroundColor: active ? accent : theme.background.secondary,
                    borderColor: active ? accent : theme.glassBorder,
                    opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: active ? accentFg : theme.text.primary }}>
                  {a.label}
                </ThemedText>
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  style={{ color: active ? accentFg : theme.text.secondary, opacity: 0.7 }}>
                  {a.hint}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function clampWorklet(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

function CropHeader({
  theme,
  accent,
  accentFg,
  applying,
  onCancel,
  onApply,
}: {
  theme: ThemePalette;
  accent: string;
  accentFg: string;
  applying: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onCancel}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Cancel crop"
        style={({ pressed }) => [
          styles.headerBtn,
          {
            backgroundColor: theme.background.secondary,
            borderColor: theme.glassBorder,
            opacity: pressed ? 0.6 : 1,
          },
        ]}>
        <Ionicons name="close" size={20} color={theme.text.primary} />
      </Pressable>
      <ThemedText variant="titleLarge" weight="700">
        Crop
      </ThemedText>
      <Pressable
        onPress={onApply}
        disabled={applying}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Apply crop"
        style={({ pressed }) => [
          styles.applyBtn,
          {
            backgroundColor: accent,
            opacity: applying ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}>
        <Ionicons name="checkmark" size={18} color={accentFg} />
        <ThemedText variant="bodySmall" weight="700" style={{ color: accentFg }}>
          Apply
        </ThemedText>
      </Pressable>
    </View>
  );
}

function CropGrid({ color }: { color: string }) {
  // Rule-of-thirds overlay — fixed inside the frame.
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={[styles.gridLineV, { left: '33.333%', backgroundColor: `${color}55` }]} />
      <View style={[styles.gridLineV, { left: '66.666%', backgroundColor: `${color}55` }]} />
      <View style={[styles.gridLineH, { top: '33.333%', backgroundColor: `${color}55` }]} />
      <View style={[styles.gridLineH, { top: '66.666%', backgroundColor: `${color}55` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  viewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  frame: {
    overflow: 'hidden',
    backgroundColor: '#000',
    borderRadius: Radius.sm,
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: { flex: 1 },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  aspectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  aspectChip: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.chip,
    borderWidth: 1,
    minWidth: 64,
  },
});
