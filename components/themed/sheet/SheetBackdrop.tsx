import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useT } from '../../../libs/i18n';

type SheetBackdropProps = {
  onPress: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SheetBackdrop({ onPress }: SheetBackdropProps) {
  const t = useT();
  return (
    <AnimatedPressable
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(140)}
      style={[StyleSheet.absoluteFill, styles.backdrop]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('commonUi.dismiss')}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
