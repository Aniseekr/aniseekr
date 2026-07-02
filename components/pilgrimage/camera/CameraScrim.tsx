import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraChrome } from './cameraChrome';

interface CameraScrimProps {
  topHeight?: number;
  bottomHeight?: number;
}

/**
 * Faint top + bottom gradient scrims that keep the always-glass chrome legible over bright
 * scenes. The live preview runs full-bleed behind them (pointerEvents none, fades to transparent).
 */
function CameraScrimComponent({ topHeight, bottomHeight }: CameraScrimProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={CameraChrome.scrimTopColors}
        style={[styles.top, { height: topHeight ?? CameraChrome.scrimTopHeight }]}
      />
      <LinearGradient
        colors={CameraChrome.scrimBottomColors}
        style={[styles.bottom, { height: bottomHeight ?? CameraChrome.scrimBottomHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});

export default memo(CameraScrimComponent);
