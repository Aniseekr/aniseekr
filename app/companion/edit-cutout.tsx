// Full-screen cutout (去背) editing board. Reached with a single `sessionId`
// param (see cutout-editor-session.ts). Flow: analyzing (the picked image
// stays visible under a scrim) → ready (auto mask) or manual (white mask +
// banner) → save. Rule 8: three honest states — analyzing / editable result /
// failed — never a fabricated mask.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { ThemedButton, ThemedText } from '../../components/themed';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  CutoutEditorCanvas,
  type EditorBackground,
} from '../../components/companion/cutout/CutoutEditorCanvas';
import { EditorTopBar } from '../../components/companion/cutout/EditorTopBar';
import { EditorDock } from '../../components/companion/cutout/EditorDock';
import type { CharacterEntry } from '../../libs/services/companion/character-library';
import { getCharacterLimit } from '../../libs/services/companion/character-library-store';
import { takeEditorSession } from '../../libs/services/companion/cutout-editor-session';
import { useCutoutEditor, type SaveResult } from '../../libs/services/companion/use-cutout-editor';
import type {
  BrushTool,
  MaskFilterKind,
  StrokePoint,
} from '../../libs/services/companion/cutout-ops';

/** Per-tap edge-tool radii in mask pixels — repeat taps accumulate (undoable). */
const EDGE_AMOUNTS: Record<MaskFilterKind, number> = {
  feather: 3,
  smooth: 4,
  shrink: 3,
  expand: 3,
};

const BACKGROUNDS: EditorBackground[] = ['checker', 'black', 'white'];

export default function EditCutoutScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [session] = useState(() => takeEditorSession(sessionId ?? ''));
  const editor = useCutoutEditor(session);

  const [tool, setTool] = useState<BrushTool>('erase');
  const [brushSize, setBrushSize] = useState(48);
  const [brushHardness, setBrushHardness] = useState(0.85);
  const [background, setBackground] = useState<EditorBackground>('checker');
  const [maskOverlay, setMaskOverlay] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [canvasBox, setCanvasBox] = useState({ w: 0, h: 0 });
  // Guards double-finish (e.g. save tap racing the discard alert); functional
  // setState gives an atomic read-and-set without re-rendering on the value.
  const [, setDone] = useState(false);

  // Opened without a session (deep link / hot reload) — nothing to edit.
  useEffect(() => {
    if (!session) router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (entry: CharacterEntry | null) => {
      setDone((already) => {
        if (already) return already;
        session?.onDone?.(entry);
        router.back();
        return true;
      });
    },
    [router, session]
  );

  const handleStrokeEnd = useCallback(
    (points: StrokePoint[]) => {
      editor.commitOp({ kind: 'stroke', tool, points, size: brushSize, hardness: brushHardness });
    },
    [brushHardness, brushSize, editor, tool]
  );

  const handleEdgeTool = useCallback(
    (filter: MaskFilterKind) => {
      editor.commitOp({ kind: 'filter', filter, amount: EDGE_AMOUNTS[filter] });
    },
    [editor]
  );

  const reportSave = useCallback(
    (result: SaveResult) => {
      if (result.status === 'saved') {
        hapticsBridge.success();
        finish(result.entry);
      } else if (result.status === 'full') {
        Alert.alert(t('companion.libraryFull', { limit: getCharacterLimit() }));
      } else {
        hapticsBridge.error();
        Alert.alert(t('companion.cutout.saveFailed'));
      }
    },
    [finish, t]
  );

  const handleSave = useCallback(async () => {
    reportSave(await editor.save());
  }, [editor, reportSave]);

  const handleUseOriginal = useCallback(async () => {
    reportSave(await editor.saveAsOriginal());
  }, [editor, reportSave]);

  const handleCancel = useCallback(() => {
    if (!editor.dirty) {
      finish(null);
      return;
    }
    Alert.alert(t('companion.cutout.discardTitle'), t('companion.cutout.discardBody'), [
      { text: t('companion.cutout.discardKeep'), style: 'cancel' },
      {
        text: t('companion.cutout.discardLeave'),
        style: 'destructive',
        onPress: () => finish(null),
      },
    ]);
  }, [editor.dirty, finish, t]);

  const cycleBackground = useCallback(() => {
    setBackground((prev) => BACKGROUNDS[(BACKGROUNDS.indexOf(prev) + 1) % BACKGROUNDS.length]);
  }, []);

  const analyzingSource = session?.mode === 'import' ? session.sourceUri : undefined;
  const editable = editor.phase === 'ready' || editor.phase === 'manual';

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <EditorTopBar
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          saving={editor.saving}
          onCancel={handleCancel}
          onUndo={() => {
            hapticsBridge.selectionSoft();
            editor.undo();
          }}
          onRedo={() => {
            hapticsBridge.selectionSoft();
            editor.redo();
          }}
          onCompareIn={() => setComparing(true)}
          onCompareOut={() => setComparing(false)}
          onSave={handleSave}
        />

        {editor.phase === 'manual' ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
            ]}>
            <ThemedText variant="captionSmall" tone="secondary">
              {t('companion.cutout.manualBanner')}
            </ThemedText>
          </View>
        ) : null}

        <View
          style={styles.canvasBox}
          onLayout={(e) =>
            setCanvasBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }>
          {editor.phase === 'analyzing' ? (
            <View style={styles.fill}>
              {analyzingSource ? (
                <ExpoImage
                  source={{ uri: analyzingSource }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                />
              ) : null}
              <View
                style={[
                  styles.absoluteFill,
                  { backgroundColor: theme.background.primary, opacity: 0.55 },
                ]}
              />
              <View style={[styles.absoluteFill, styles.center]}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText variant="bodySmall" tone="secondary">
                  {t('companion.cutout.analyzing')}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {editor.phase === 'failed' ? (
            <View style={[styles.absoluteFill, styles.center]}>
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('companion.cutout.loadFailed')}
              </ThemedText>
              <ThemedButton
                variant="secondary"
                label={t('companion.cancel')}
                onPress={() => finish(null)}
              />
            </View>
          ) : null}

          {editable && editor.images && canvasBox.w > 0 ? (
            <CutoutEditorCanvas
              key={`${editor.images.imgW}x${editor.images.imgH}-${canvasBox.w}x${canvasBox.h}`}
              original={editor.images.original}
              mask={editor.images.mask}
              imgW={editor.images.imgW}
              imgH={editor.images.imgH}
              canvasW={canvasBox.w}
              canvasH={canvasBox.h}
              tool={tool}
              brushSize={brushSize}
              brushHardness={brushHardness}
              background={background}
              maskOverlay={maskOverlay}
              comparing={comparing}
              onStrokeEnd={handleStrokeEnd}
            />
          ) : null}
        </View>

        {editable ? (
          <EditorDock
            tool={tool}
            brushSize={brushSize}
            brushHardness={brushHardness}
            maskOverlay={maskOverlay}
            onToolChange={setTool}
            onBrushSizeChange={setBrushSize}
            onBrushHardnessChange={setBrushHardness}
            onEdgeTool={handleEdgeTool}
            onBackgroundCycle={cycleBackground}
            onMaskOverlayToggle={() => setMaskOverlay((v) => !v)}
            onReset={() => {
              hapticsBridge.warning();
              editor.reset();
            }}
            onUseOriginal={handleUseOriginal}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  canvasBox: { flex: 1, overflow: 'hidden' },
  banner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
