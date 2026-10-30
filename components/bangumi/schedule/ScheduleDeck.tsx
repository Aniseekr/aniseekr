import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BangumiCardDeck } from '../BangumiCardDeck';
import { ThemedIconButton, ThemedText } from '../../themed';
import type { Anime } from '../../rate/types';
import { setFloatingTabBarHidden } from '../../../libs/navigation/floating-tab-bar-visibility';
import { useT } from '../../../libs/i18n';
import { Spacing } from '../../../constants/DesignSystem';

export function ScheduleDeck({
  anime,
  deckKey,
  skippedCount,
  onSkip,
  onWant,
  onRestore,
  onClose,
}: {
  anime: Anime[];
  deckKey: string;
  skippedCount: number;
  onSkip: (anime: Anime) => void;
  onWant: (anime: Anime) => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const t = useT();
  useFocusEffect(
    useCallback(() => {
      setFloatingTabBarHidden('bangumi-cards-mode', true);
      return () => setFloatingTabBarHidden('bangumi-cards-mode', false);
    }, [])
  );
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={styles.root}>
      <View style={styles.header}>
        <ThemedText variant="headlineLarge" weight="700" style={styles.grow}>
          {t('tabs.schedule.deck')}
        </ThemedText>
        <ThemedIconButton
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          icon={(color) => <MaterialIcons name="close" size={22} color={color} />}
        />
      </View>
      <BangumiCardDeck
        key={deckKey}
        anime={anime}
        onSwipeSkip={onSkip}
        onSwipeWant={onWant}
        skippedCount={skippedCount}
        onRestoreSkipped={onRestore}
      />
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Spacing.md, paddingHorizontal: Spacing.screenPadding },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  grow: { flex: 1 },
});
