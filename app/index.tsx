import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { AniseekrLogo } from '../components/brand/AniseekrLogo';
import { FocusLines, ScreentoneDisc } from '../components/brand/MangaFx';
import { ThemedText } from '../components/themed';
import { Spacing } from '../constants/DesignSystem';
import { useT } from '../libs/i18n';
import { isOnboardingCompleteSync } from '../libs/services/onboarding-service';
import { loadUserPrefsSync } from '../libs/services/user-prefs';
import { resolveExperienceLandingHref } from '../libs/navigation/experience-tabs';

// Launch: the native splash shows Seekr's head on #080808 (app.json). This
// screen keeps the head where the native splash left it, then the manga focus
// lines burst out and the ANIS◉◉KR wordmark stamps in above the tagline.
const MARK_H = 133; // native splash imageWidth 140 × 76 / 80 (mark.svg aspect)
const DISC = 300;

export default function Index() {
  const router = useRouter();
  const t = useT();
  const { theme } = useTheme();
  const reduced = useReducedMotion();

  const burst = useSharedValue(reduced ? 1 : 0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!reduced) {
      burst.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.6)) });
      spin.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1);
    }
    const timer = setTimeout(() => {
      router.replace(
        isOnboardingCompleteSync()
          ? resolveExperienceLandingHref(loadUserPrefsSync().experience)
          : '/onboarding'
      );
    }, 2600);
    return () => clearTimeout(timer);
  }, [burst, reduced, router, spin]);

  const linesStyle = useAnimatedStyle(() => ({
    opacity: burst.value,
    transform: [{ scale: 1.6 - burst.value * 0.6 }, { rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <Animated.View style={[styles.lines, linesStyle]}>
        <FocusLines color={theme.accent} opacity={0.55} count={96} inner={12} />
      </Animated.View>

      <View style={styles.center}>
        <ScreentoneDisc size={DISC} color={theme.accent} opacity={0.35} style={styles.disc} />
        <AniseekrLogo variant="mark" height={MARK_H} />
      </View>

      <View style={styles.lockup}>
        <AniseekrLogo variant="word" height={44} stampOnMount />
        <Animated.View entering={FadeIn.delay(500).duration(320)}>
          <ThemedText variant="titleMedium" tone="secondary" align="center">
            {t('brand.tagline')}
          </ThemedText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lines: {
    // Oversized so the rotation never shows a corner.
    position: 'absolute',
    top: '-25%',
    bottom: '-25%',
    left: '-60%',
    right: '-60%',
  },
  center: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    position: 'absolute',
  },
  lockup: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: MARK_H / 2 + Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
