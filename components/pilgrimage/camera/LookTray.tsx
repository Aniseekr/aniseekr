// Film-look picker over the viewfinder: a row of looks and, for Pro, a strength
// slider. The live preview is the feedback; picking a look never leaves the
// camera. Locked looks carry a PRO badge and open the paywall.
import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { ThemedText, readableTextOn } from '../../themed';
import { PaywallSheet } from '../../subscription/PaywallSheet';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { useT, type TranslationKey } from '../../../libs/i18n';
import {
  CAMERA_LOOKS,
  type CameraLook,
  type CameraLookId,
} from '../../../libs/services/pilgrimage/camera-looks';
import {
  useActiveCameraLook,
  useCameraLookSelection,
  type CameraLookStore,
} from '../../../hooks/useCameraLook';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

const LOOK_LABEL: Record<CameraLookId, TranslationKey> = {
  original: 'pilgrimageUi.cameraLook.original',
  'film-warm': 'pilgrimageUi.cameraLook.filmWarm',
  mono: 'pilgrimageUi.cameraLook.mono',
  'cool-dusk': 'pilgrimageUi.cameraLook.coolDusk',
  'faded-cel': 'pilgrimageUi.cameraLook.fadedCel',
  summer: 'pilgrimageUi.cameraLook.summer',
};

export function lookLabelKey(id: CameraLookId): TranslationKey {
  return LOOK_LABEL[id];
}

interface LookButtonProps {
  store: CameraLookStore;
  isPro: boolean;
  open: boolean;
  themeColor: string;
  onPress: () => void;
}

/** Zoom-band button: shows the look in use and opens the tray. */
function LookButtonComponent({ store, isPro, open, themeColor, onPress }: LookButtonProps) {
  const t = useT();
  const { look } = useActiveCameraLook(store, isPro);
  const tinted = look.id !== 'original';
  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${t('pilgrimageUi.cameraLook.button')}: ${t(LOOK_LABEL[look.id])}`}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [
        styles.button,
        (open || tinted) && { borderColor: themeColor },
        pressed && { backgroundColor: CameraChrome.pressedFill },
      ]}>
      <Ionicons
        name="color-filter-outline"
        size={CameraChrome.iconSize}
        color={tinted ? themeColor : CameraChrome.fg}
      />
      {tinted ? (
        <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={styles.buttonText}>
          {t(LOOK_LABEL[look.id])}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export const LookButton = memo(LookButtonComponent);

interface LookTrayProps {
  store: CameraLookStore;
  isPro: boolean;
  themeColor: string;
  /** Persist the pick (a look chosen, or a strength drag released). */
  onCommit: (look: CameraLookId, intensity: number) => void;
}

function LookTrayComponent({ store, isPro, themeColor, onCommit }: LookTrayProps) {
  const t = useT();
  const selection = useCameraLookSelection(store);
  const active = useActiveCameraLook(store, isPro);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const pick = (look: CameraLook) => {
    if (!look.free && !isPro) {
      hapticsBridge.tap();
      setPaywallOpen(true);
      return;
    }
    hapticsBridge.selection();
    store.set({ id: look.id });
    onCommit(look.id, selection.intensity);
  };

  return (
    <View style={styles.tray} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.rowScroll}>
        {CAMERA_LOOKS.map((look) => {
          const selected = active.look.id === look.id;
          const locked = !look.free && !isPro;
          const fg = selected ? readableTextOn(themeColor) : CameraChrome.fg;
          return (
            <Pressable
              key={look.id}
              onPress={() => pick(look)}
              accessibilityRole="button"
              accessibilityLabel={t(LOOK_LABEL[look.id])}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected && { backgroundColor: themeColor, borderColor: themeColor },
                pressed && !selected && { backgroundColor: CameraChrome.pressedFill },
              ]}>
              <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={{ color: fg }}>
                {t(LOOK_LABEL[look.id])}
              </ThemedText>
              {locked ? (
                <View style={[styles.proBadge, { borderColor: themeColor }]}>
                  <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                    {t('pilgrimageUi.cameraLook.pro')}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {active.look.id === 'original' ? null : isPro ? (
        <View style={styles.strength}>
          <ThemedText variant="captionSmall" weight="700" style={styles.strengthLabel}>
            {t('pilgrimageUi.cameraLook.strength')}
          </ThemedText>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={selection.intensity}
            minimumTrackTintColor={themeColor}
            maximumTrackTintColor={CameraChrome.trackInactive}
            thumbTintColor={CameraChrome.fg}
            onValueChange={(v) => store.set({ intensity: v })}
            onSlidingComplete={(v) => onCommit(store.get().id, v)}
            accessibilityLabel={t('pilgrimageUi.cameraLook.strength')}
          />
          <ThemedText variant="captionSmall" weight="700" style={styles.strengthValue}>
            {Math.round(active.intensity * 100)}%
          </ThemedText>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            hapticsBridge.tap();
            setPaywallOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimageUi.cameraLook.strengthLocked')}
          style={({ pressed }) => [styles.strength, pressed && { opacity: 0.7 }]}>
          <Ionicons name="lock-closed" size={13} color={CameraChrome.fgMuted} />
          <ThemedText variant="captionSmall" weight="700" style={styles.lockedText}>
            {t('pilgrimageUi.cameraLook.strengthLocked')}
          </ThemedText>
        </Pressable>
      )}

      <PaywallSheet visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

export const LookTray = memo(LookTrayComponent);

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: CameraChrome.controlHeight,
    minWidth: CameraChrome.controlHeight,
    maxWidth: 120,
    paddingHorizontal: 9,
    justifyContent: 'center',
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
  },
  buttonText: { color: CameraChrome.fg, flexShrink: 1 },
  tray: { alignItems: 'center', gap: 8, width: '100%' },
  rowScroll: { flexGrow: 0, alignSelf: 'stretch' },
  row: { paddingHorizontal: 14, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: CameraChrome.controlHeight,
    paddingHorizontal: 14,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  proBadge: {
    paddingHorizontal: 4,
    borderRadius: CameraChrome.chipRadius,
    borderWidth: 1,
  },
  strength: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 260,
    maxWidth: '90%',
    height: CameraChrome.controlHeight,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.groupFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
  },
  strengthLabel: { color: CameraChrome.fgMuted },
  slider: { flex: 1, height: 36 },
  strengthValue: {
    color: CameraChrome.fg,
    minWidth: 34,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  lockedText: { color: CameraChrome.fgMuted, flex: 1 },
});
