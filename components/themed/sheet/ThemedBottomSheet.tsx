import { ReactNode, useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { sheetEnter } from '../../../libs/animations/presets';
import { ThemedSurface } from '../ThemedSurface';
import { SheetBackdrop } from './SheetBackdrop';
import { SheetHandle } from './SheetHandle';
import { useSheetDrag } from './useSheetDrag';

type ThemedBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children?: ReactNode;
  maxHeightPct?: number;
  disableDrag?: boolean;
};

export function ThemedBottomSheet({
  visible,
  onClose,
  children,
  maxHeightPct,
  disableDrag = false,
}: ThemedBottomSheetProps) {
  const { panGesture, sheetAnimatedStyle, reset } = useSheetDrag(onClose);

  useEffect(() => {
    if (visible) reset();
  }, [reset, visible]);

  const panel = (
    <Animated.View
      entering={sheetEnter()}
      style={[
        sheetAnimatedStyle,
        styles.sheetWrap,
        maxHeightPct ? { maxHeight: `${Math.round(maxHeightPct * 100)}%` } : null,
      ]}>
      <ThemedSurface variant="sheet" radius={Radius.xxl} style={styles.sheet}>
        <SheetHandle />
        {children}
      </ThemedSurface>
    </Animated.View>
  );

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.root}>
        <SheetBackdrop onPress={handleClose} />
        {disableDrag ? panel : <GestureDetector gesture={panGesture}>{panel}</GestureDetector>}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  sheet: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
});
