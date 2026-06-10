// The cutout editor's drawing board. Layers: checker/black/white backdrop →
// ghost of the original (low opacity, shows removed regions) → original
// clipped by a luminance Mask (committed mask image + the live in-progress
// stroke path) → optional accent mask overlay → brush cursor ring.
//
// Gestures (all on the UI thread; no React state per CLAUDE.md rule 9):
//   1 finger   — paint (fails over to pinch when a 2nd finger lands)
//   2 fingers  — pinch zoom (focal-anchored) + pan
//   double tap — reset view to fit
// The live stroke is an SkPath in a SharedValue mutated in worklets via
// notifyChange; React only hears about the stroke once, on commit.

import { useCallback, useEffect, useMemo } from 'react';
import {
  Canvas,
  Circle,
  Fill,
  Group,
  Image as SkiaImage,
  ImageShader,
  Mask,
  Path,
  Rect,
  Skia,
  notifyChange,
} from '@shopify/react-native-skia';
import type { SkImage, SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../../../context/ThemeContext';
import {
  fitContain,
  type BrushTool,
  type StrokePoint,
} from '../../../libs/services/companion/cutout-ops';
import { makeCheckerImage } from '../../../libs/services/companion/cutout-mask';

export type EditorBackground = 'checker' | 'black' | 'white';

// Luminance values for the live mask stroke — data, not UI colors.
const STROKE_RESTORE = '#FFFFFF';
const STROKE_ERASE = '#000000';
// "Preview on white" backdrop — represents the sticker on a white surface,
// intentionally absolute (like the checker), not themed chrome.
const PREVIEW_WHITE = '#FFFFFF';
const GHOST_OPACITY = 0.25;
const MIN_ZOOM_FACTOR = 0.8; // × fit
const MAX_ZOOM_FACTOR = 10; // × fit

export interface CutoutEditorCanvasProps {
  original: SkImage;
  mask: SkImage;
  imgW: number;
  imgH: number;
  canvasW: number;
  canvasH: number;
  tool: BrushTool;
  /** Brush diameter in mask pixels. */
  brushSize: number;
  /** 0..1 — soft edges are applied at commit; the live stroke stays hard. */
  brushHardness: number;
  background: EditorBackground;
  maskOverlay: boolean;
  comparing: boolean;
  onStrokeEnd: (points: StrokePoint[]) => void;
}

export function CutoutEditorCanvas({
  original,
  mask,
  imgW,
  imgH,
  canvasW,
  canvasH,
  tool,
  brushSize,
  background,
  maskOverlay,
  comparing,
  onStrokeEnd,
}: CutoutEditorCanvasProps) {
  const { theme } = useTheme();

  const scale = useSharedValue(1);
  const offX = useSharedValue(0);
  const offY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startOffX = useSharedValue(0);
  const startOffY = useSharedValue(0);
  const fitScale = useSharedValue(1);

  const livePath = useSharedValue<SkPath>(Skia.Path.Make());
  const livePoints = useSharedValue<StrokePoint[]>([]);
  const cursorX = useSharedValue(-1000);
  const cursorY = useSharedValue(-1000);

  // Re-fit whenever geometry changes.
  useEffect(() => {
    const v = fitContain(imgW, imgH, canvasW, canvasH);
    fitScale.value = v.scale;
    scale.value = v.scale;
    offX.value = v.offX;
    offY.value = v.offY;
    // SharedValues are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgW, imgH, canvasW, canvasH]);

  const checker = useMemo(
    () => makeCheckerImage(8, theme.background.secondary, theme.background.tertiary),
    [theme.background.secondary, theme.background.tertiary]
  );

  const commitStroke = useCallback(
    (points: StrokePoint[]) => {
      if (points.length > 0) onStrokeEnd(points);
    },
    [onStrokeEnd]
  );

  const paint = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onTouchesDown((e, mgr) => {
          if (e.numberOfTouches > 1) mgr.fail();
        })
        .onStart((e) => {
          'worklet';
          const ix = (e.x - offX.value) / scale.value;
          const iy = (e.y - offY.value) / scale.value;
          const p = Skia.Path.Make();
          p.moveTo(ix, iy);
          p.lineTo(ix + 0.01, iy);
          livePath.value = p;
          livePoints.value = [{ x: ix, y: iy }];
          cursorX.value = e.x;
          cursorY.value = e.y;
        })
        .onUpdate((e) => {
          'worklet';
          const ix = (e.x - offX.value) / scale.value;
          const iy = (e.y - offY.value) / scale.value;
          livePath.value.lineTo(ix, iy);
          notifyChange(livePath);
          livePoints.value.push({ x: ix, y: iy });
          cursorX.value = e.x;
          cursorY.value = e.y;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitStroke)(livePoints.value.slice());
        })
        .onFinalize(() => {
          'worklet';
          livePath.value = Skia.Path.Make();
          livePoints.value = [];
          cursorX.value = -1000;
          cursorY.value = -1000;
        }),
    // SharedValues are stable; only the JS commit callback varies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitStroke]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          startScale.value = scale.value;
          startOffX.value = offX.value;
          startOffY.value = offY.value;
        })
        .onUpdate((e) => {
          'worklet';
          const minS = fitScale.value * MIN_ZOOM_FACTOR;
          const maxS = fitScale.value * MAX_ZOOM_FACTOR;
          const next = Math.min(maxS, Math.max(minS, startScale.value * e.scale));
          const k = next / startScale.value;
          scale.value = next;
          offX.value = e.focalX - (e.focalX - startOffX.value) * k;
          offY.value = e.focalY - (e.focalY - startOffY.value) * k;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const panTwo = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .maxPointers(2)
        .onChange((e) => {
          'worklet';
          offX.value += e.changeX;
          offY.value += e.changeY;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          'worklet';
          const f = fitScale.value;
          scale.value = f;
          offX.value = (canvasW - imgW * f) / 2;
          offY.value = (canvasH - imgH * f) / 2;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasW, canvasH, imgW, imgH]
  );

  const gesture = useMemo(
    () => Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, panTwo), paint),
    [doubleTap, pinch, panTwo, paint]
  );

  const groupTransform = useDerivedValue(() => [
    { translateX: offX.value },
    { translateY: offY.value },
    { scale: scale.value },
  ]);

  const cursorR = useDerivedValue(() => (brushSize / 2) * scale.value, [brushSize]);

  const liveColor = tool === 'restore' ? STROKE_RESTORE : STROKE_ERASE;

  const maskLayer = (
    <Group>
      <SkiaImage image={mask} x={0} y={0} width={imgW} height={imgH} fit="fill" />
      <Path
        path={livePath}
        style="stroke"
        strokeWidth={brushSize}
        strokeCap="round"
        strokeJoin="round"
        color={liveColor}
      />
    </Group>
  );

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width: canvasW, height: canvasH }}>
        {background === 'checker' ? (
          <Rect x={0} y={0} width={canvasW} height={canvasH}>
            <ImageShader image={checker} tx="repeat" ty="repeat" />
          </Rect>
        ) : (
          <Fill color={background === 'black' ? theme.background.primary : PREVIEW_WHITE} />
        )}
        <Group transform={groupTransform}>
          <SkiaImage
            image={original}
            x={0}
            y={0}
            width={imgW}
            height={imgH}
            fit="fill"
            opacity={comparing ? 1 : GHOST_OPACITY}
          />
          {!comparing ? (
            <Mask mode="luminance" mask={maskLayer}>
              <SkiaImage image={original} x={0} y={0} width={imgW} height={imgH} fit="fill" />
            </Mask>
          ) : null}
          {!comparing && maskOverlay ? (
            <Mask mode="luminance" mask={maskLayer}>
              <Rect x={0} y={0} width={imgW} height={imgH} color={theme.accent} opacity={0.4} />
            </Mask>
          ) : null}
        </Group>
        <Circle
          cx={cursorX}
          cy={cursorY}
          r={cursorR}
          style="stroke"
          strokeWidth={1.5}
          color={theme.text.primary}
          opacity={0.9}
        />
      </Canvas>
    </GestureDetector>
  );
}
