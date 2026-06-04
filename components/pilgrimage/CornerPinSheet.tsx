// Manual 4-corner perspective editor (Track C #8 Phase 2).
//
// Renders the user shot in a fixed-size viewport with four draggable corner
// handles. Each handle has its own SharedValue pair (x, y); the worklet
// composes the matrix on the fly so the warp updates without ever touching
// React state. On Apply we read the final corner positions back to JS,
// build the homography, and return a 16-element `matrix` token compatible
// with RN's `transform: [{ matrix: ... }]`.

import { useEffect, useMemo, useState, useCallback } from 'react';
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
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import {
  cornerPinHomography,
  homographyToMatrix4,
  type Pt,
} from '../../libs/services/pilgrimage/share-perspective';

export type CornerPinSheetProps = {
  visible: boolean;
  sourceUri: string;
  onCancel: () => void;
  /**
   * Resolution-independent corner fractions ([0..1] of the frame, order
   * tl, tr, br, bl), or null for "no warp". The consumer rebuilds the matrix at
   * its own cell size so the warp matches this editor regardless of pixel size.
   */
  onApply: (corners: Pt[] | null) => void;
};

const HANDLE_RADIUS = 16;

export function CornerPinSheet({ visible, sourceUri, onCancel, onApply }: CornerPinSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

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

  const padding = Spacing.md;
  const availW = winW - padding * 2;
  const availH = winH - insets.top - insets.bottom - 200;
  const frame = useMemo(() => {
    if (!imageSize) return { w: availW, h: availW };
    const srcAspect = imageSize.w / imageSize.h;
    if (srcAspect > availW / availH) return { w: availW, h: availW / srcAspect };
    return { w: availH * srcAspect, h: availH };
  }, [imageSize, availW, availH]);

  // Corner positions in frame-local coords. The image sits at (0,0)→(W,H);
  // the handles can drift outside that rect so the user can apply true
  // keystone (top-narrow, bottom-wide) effects.
  const tlx = useSharedValue(0);
  const tly = useSharedValue(0);
  const trx = useSharedValue(frame.w);
  const try_ = useSharedValue(0);
  const brx = useSharedValue(frame.w);
  const bry = useSharedValue(frame.h);
  const blx = useSharedValue(0);
  const bly = useSharedValue(frame.h);

  // Reset corners whenever the frame size or visibility flips.
  useEffect(() => {
    if (!visible) return;
    tlx.value = 0;
    tly.value = 0;
    trx.value = frame.w;
    try_.value = 0;
    brx.value = frame.w;
    bry.value = frame.h;
    blx.value = 0;
    bly.value = frame.h;
  }, [visible, frame.w, frame.h, tlx, tly, trx, try_, brx, bry, blx, bly]);

  // Per-corner "saved" pair lets each handle resume its prior position when
  // the user lifts and replaces their finger. SharedValues are declared at
  // top level to satisfy the rules-of-hooks (no hooks inside callbacks).
  const tlSavedX = useSharedValue(0);
  const tlSavedY = useSharedValue(0);
  const trSavedX = useSharedValue(0);
  const trSavedY = useSharedValue(0);
  const brSavedX = useSharedValue(0);
  const brSavedY = useSharedValue(0);
  const blSavedX = useSharedValue(0);
  const blSavedY = useSharedValue(0);

  const tlGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          'worklet';
          tlSavedX.value = tlx.value;
          tlSavedY.value = tly.value;
        })
        .onUpdate((e) => {
          'worklet';
          tlx.value = tlSavedX.value + e.translationX;
          tly.value = tlSavedY.value + e.translationY;
        }),
    [tlx, tly, tlSavedX, tlSavedY]
  );
  const trGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          'worklet';
          trSavedX.value = trx.value;
          trSavedY.value = try_.value;
        })
        .onUpdate((e) => {
          'worklet';
          trx.value = trSavedX.value + e.translationX;
          try_.value = trSavedY.value + e.translationY;
        }),
    [trx, try_, trSavedX, trSavedY]
  );
  const brGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          'worklet';
          brSavedX.value = brx.value;
          brSavedY.value = bry.value;
        })
        .onUpdate((e) => {
          'worklet';
          brx.value = brSavedX.value + e.translationX;
          bry.value = brSavedY.value + e.translationY;
        }),
    [brx, bry, brSavedX, brSavedY]
  );
  const blGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          'worklet';
          blSavedX.value = blx.value;
          blSavedY.value = bly.value;
        })
        .onUpdate((e) => {
          'worklet';
          blx.value = blSavedX.value + e.translationX;
          bly.value = blSavedY.value + e.translationY;
        }),
    [blx, bly, blSavedX, blSavedY]
  );

  // Animated style on the warped image — recomputes whenever any corner moves.
  const warpedStyle = useAnimatedStyle(() => {
    const m = cornerPinHomography(frame.w, frame.h, [
      { x: tlx.value, y: tly.value },
      { x: trx.value, y: try_.value },
      { x: brx.value, y: bry.value },
      { x: blx.value, y: bly.value },
    ]);
    if (!m) return {};
    return { transform: [{ matrix: homographyToMatrix4(m) }] };
  });

  // Mirror the live corner FRACTIONS back into JS state so Apply() returns a
  // resolution-independent warp (the consumer rebuilds the matrix at its size).
  // Still solve the homography here only to reject a degenerate drag.
  const [liveCorners, setLiveCorners] = useState<Pt[] | null>(null);
  useAnimatedReaction(
    () => ({
      tl: { x: tlx.value, y: tly.value },
      tr: { x: trx.value, y: try_.value },
      br: { x: brx.value, y: bry.value },
      bl: { x: blx.value, y: bly.value },
    }),
    (cur) => {
      const corners = [cur.tl, cur.tr, cur.br, cur.bl];
      const h = cornerPinHomography(frame.w, frame.h, corners);
      if (h && frame.w > 0 && frame.h > 0) {
        const fractions = corners.map((c) => ({ x: c.x / frame.w, y: c.y / frame.h }));
        runOnJS(setLiveCorners)(fractions);
      } else {
        runOnJS(setLiveCorners)(null);
      }
    },
    [frame.w, frame.h]
  );

  const handleReset = useCallback(() => {
    hapticsBridge.tap();
    tlx.value = 0;
    tly.value = 0;
    trx.value = frame.w;
    try_.value = 0;
    brx.value = frame.w;
    bry.value = frame.h;
    blx.value = 0;
    bly.value = frame.h;
  }, [frame.w, frame.h, tlx, tly, trx, try_, brx, bry, blx, bly]);

  const handleApply = useCallback(() => {
    hapticsBridge.success();
    onApply(liveCorners);
  }, [liveCorners, onApply]);

  const handles = [
    { id: 'tl', xv: tlx, yv: tly, gesture: tlGesture },
    { id: 'tr', xv: trx, yv: try_, gesture: trGesture },
    { id: 'br', xv: brx, yv: bry, gesture: brGesture },
    { id: 'bl', xv: blx, yv: bly, gesture: blGesture },
  ] as const;

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
        <Header
          theme={theme}
          accent={accent}
          accentFg={accentFg}
          onCancel={onCancel}
          onApply={handleApply}
          onReset={handleReset}
        />

        <View style={styles.viewport}>
          <View style={[styles.frame, { width: frame.w, height: frame.h, borderColor: accent }]}>
            <Animated.View style={[StyleSheet.absoluteFill, warpedStyle]}>
              {sourceUri ? (
                <ExpoImage
                  source={{ uri: sourceUri }}
                  style={{ width: frame.w, height: frame.h }}
                  contentFit="cover"
                />
              ) : null}
            </Animated.View>
            {handles.map((h) => (
              <CornerHandle key={h.id} xv={h.xv} yv={h.yv} gesture={h.gesture} accent={accent} />
            ))}
          </View>
        </View>

        <View style={styles.hintBar}>
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            Drag the four corners to warp the user shot
          </ThemedText>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CornerHandle({
  xv,
  yv,
  gesture,
  accent,
}: {
  xv: { value: number };
  yv: { value: number };
  gesture: ReturnType<typeof Gesture.Pan>;
  accent: string;
}) {
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: xv.value - HANDLE_RADIUS }, { translateY: yv.value - HANDLE_RADIUS }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.handle,
          {
            width: HANDLE_RADIUS * 2,
            height: HANDLE_RADIUS * 2,
            borderRadius: HANDLE_RADIUS,
            borderColor: accent,
          },
          animated,
        ]}
      />
    </GestureDetector>
  );
}

function Header({
  theme,
  accent,
  accentFg,
  onCancel,
  onApply,
  onReset,
}: {
  theme: ThemePalette;
  accent: string;
  accentFg: string;
  onCancel: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onCancel}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Cancel perspective warp"
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
        Warp
      </ThemedText>
      <View style={styles.headerRight}>
        <Pressable
          onPress={onReset}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Reset corners"
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              opacity: pressed ? 0.6 : 1,
            },
          ]}>
          <Ionicons name="refresh" size={18} color={theme.text.primary} />
        </Pressable>
        <Pressable
          onPress={onApply}
          accessibilityRole="button"
          accessibilityLabel="Apply warp"
          style={({ pressed }) => [
            styles.applyBtn,
            { backgroundColor: accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Ionicons name="checkmark" size={18} color={accentFg} />
          <ThemedText variant="bodySmall" weight="700" style={{ color: accentFg }}>
            Apply
          </ThemedText>
        </Pressable>
      </View>
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
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
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
    overflow: 'visible',
    backgroundColor: '#000',
    borderRadius: Radius.sm,
    borderWidth: 1,
    position: 'relative',
  },
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
  },
  hintBar: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
});
