import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Radius, Shadow, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { readableTextOn, ThemedButton, ThemedBottomSheet, ThemedText } from '../themed';
import { PersonalizedPickState } from './types';

type Props = {
  visible: boolean;
  data: PersonalizedPickState;
  onClose: () => void;
  onSelect?: () => void;
  onRefresh?: () => void;
};

function PersonalizedPickSheetComponent({ visible, data, onClose, onSelect, onRefresh }: Props) {
  const { theme } = useTheme();
  const t = useT();

  const handleClose = () => {
    onClose();
  };

  const accentTextColor = readableTextOn(theme.accent);

  const renderBody = () => {
    switch (data.status) {
      case 'loading':
      case 'idle':
        return <LoadingState accent={theme.accent} />;
      case 'cold-start':
        return (
          <ColdStartState
            accent={theme.accent}
            accentTextColor={accentTextColor}
            onClose={handleClose}
          />
        );
      case 'ready':
        return (
          <PickContent
            data={data}
            accent={theme.accent}
            accentTextColor={accentTextColor}
            onSelect={onSelect}
            onRefresh={onRefresh}
          />
        );
      case 'no-match':
        return <NoMatchState onRefresh={onRefresh} />;
      case 'error':
        return <ErrorState onRefresh={onRefresh} />;
    }
  };

  return (
    <ThemedBottomSheet visible={visible} onClose={handleClose}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconBubble,
              { backgroundColor: theme.accent + '22', borderColor: theme.accent + '55' },
            ]}>
            <Ionicons name="sparkles" size={14} color={theme.accent} />
          </View>
          <View>
            <ThemedText variant="titleLarge" weight="700">
              {t('rate.forYou')}
            </ThemedText>
            <ThemedText variant="caption" tone="tertiary">
              {t('rate.pickedFromYourTaste')}
            </ThemedText>
          </View>
        </View>
        <Pressable
          onPress={handleClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [
            styles.closeBtn,
            {
              backgroundColor: theme.background.tertiary,
              borderColor: theme.glassBorder,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Ionicons name="close" size={16} color={theme.text.secondary} />
        </Pressable>
      </View>

      {renderBody()}
    </ThemedBottomSheet>
  );
}

function PickContent({
  data,
  accent,
  accentTextColor,
  onSelect,
  onRefresh,
}: {
  data: PersonalizedPickState;
  accent: string;
  accentTextColor: string;
  onSelect?: () => void;
  onRefresh?: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const anime = data.anime;
  if (!anime) return null;

  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Pressable onPress={onSelect} accessibilityRole="button">
        <Animated.View
          entering={FadeInUp.delay(60).duration(280)}
          style={[
            styles.heroCard,
            Shadow.medium,
            Shadow.glow(accent),
            { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
          ]}>
          <LinearGradient
            colors={[accent + '33', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroGlow}
            pointerEvents="none"
          />
          <View style={styles.heroRow}>
            <View style={[styles.posterShadow, Shadow.heavy]}>
              <Image
                source={{ uri: anime.image }}
                style={styles.poster}
                contentFit="cover"
                transition={150}
              />
            </View>
            <View style={styles.heroMeta}>
              {typeof anime.score === 'number' && anime.score > 0 ? (
                <Animated.View entering={FadeInDown.delay(120).duration(220)}>
                  <View
                    style={[
                      styles.scoreChip,
                      { backgroundColor: accent, shadowColor: accent },
                      Shadow.subtle,
                    ]}>
                    <Ionicons name="star" size={11} color={accentTextColor} />
                    <ThemedText
                      variant="captionSmall"
                      weight="700"
                      style={{ color: accentTextColor }}>
                      {formatScore(anime.score)}
                    </ThemedText>
                  </View>
                </Animated.View>
              ) : null}
              <ThemedText variant="titleLarge" weight="700" numberOfLines={3}>
                {anime.title}
              </ThemedText>
              {anime.titleEnglish && anime.titleEnglish !== anime.title ? (
                <ThemedText variant="caption" tone="tertiary" numberOfLines={1}>
                  {anime.titleEnglish}
                </ThemedText>
              ) : null}
              <View style={styles.chipsRow}>
                {data.matchedTags.slice(0, 3).map((tag, i) => (
                  <Animated.View key={tag} entering={FadeInDown.delay(140 + i * 50).duration(220)}>
                    <View
                      style={[
                        styles.tagChip,
                        { backgroundColor: accent + '1F', borderColor: accent + '40' },
                      ]}>
                      <ThemedText variant="captionSmall" weight="600" style={{ color: accent }}>
                        {tag}
                      </ThemedText>
                    </View>
                  </Animated.View>
                ))}
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>

      {data.reason ? (
        <Animated.View
          entering={FadeInUp.delay(180).duration(240)}
          style={[
            styles.reasonPill,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          <Ionicons name="heart" size={12} color={accent} />
          <ThemedText
            variant="caption"
            tone="secondary"
            numberOfLines={2}
            style={styles.reasonText}>
            {data.reason}
          </ThemedText>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInUp.delay(220).duration(240)} style={styles.actionsRow}>
        <ThemedButton
          label={t('rate.openDetails')}
          onPress={onSelect}
          size="lg"
          fullWidth
          icon={<Ionicons name="arrow-forward" size={16} color={accentTextColor} />}
        />
        {onRefresh ? (
          <ThemedButton
            label={t('rate.showAnother')}
            onPress={onRefresh}
            variant="ghost"
            size="md"
            fullWidth
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

function LoadingState({ accent }: { accent: string }) {
  const t = useT();
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.stateContainer}>
      <View
        style={[
          styles.orb,
          { borderColor: accent + '55', backgroundColor: accent + '11' },
          Shadow.glow(accent),
        ]}>
        <Ionicons name="sparkles" size={28} color={accent} />
      </View>
      <ThemedText variant="titleMedium" align="center">
        Finding your next favorite…
      </ThemedText>
      <ThemedText variant="caption" tone="tertiary" align="center" style={{ marginTop: 4 }}>
        {t('rate.crossReferencingGenresYouVe')}
      </ThemedText>
    </Animated.View>
  );
}

function ColdStartState({
  accent,
  accentTextColor,
  onClose,
}: {
  accent: string;
  accentTextColor: string;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.stateContainer}>
      <View
        style={[
          styles.orb,
          { borderColor: theme.glassBorder, backgroundColor: theme.background.tertiary },
        ]}>
        <Ionicons name="heart-outline" size={28} color={accent} />
      </View>
      <ThemedText variant="titleMedium" align="center">
        {t('rate.rateAFewFirst')}
      </ThemedText>
      <ThemedText
        variant="caption"
        tone="tertiary"
        align="center"
        style={{ marginTop: 6, paddingHorizontal: Spacing.lg }}>
        Like or save a couple of anime and personalized picks will appear here — no guesswork.
      </ThemedText>
      <View style={{ marginTop: Spacing.lg }}>
        <ThemedButton
          label={t('rate.startDiscovering')}
          onPress={onClose}
          size="md"
          accent={accent}
          textStyle={{ color: accentTextColor }}
        />
      </View>
    </Animated.View>
  );
}

function NoMatchState({ onRefresh }: { onRefresh?: () => void }) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.stateContainer}>
      <View
        style={[
          styles.orb,
          { borderColor: theme.glassBorder, backgroundColor: theme.background.tertiary },
        ]}>
        <Ionicons name="shuffle" size={26} color={theme.text.secondary} />
      </View>
      <ThemedText variant="titleMedium" align="center">
        {t('rate.nothingFreshThatMatchesToday')}
      </ThemedText>
      <ThemedText
        variant="caption"
        tone="tertiary"
        align="center"
        style={{ marginTop: 6, paddingHorizontal: Spacing.lg }}>
        We didn’t find an unseen anime that fits your current taste. Try again later or rate a
        couple more to widen the net.
      </ThemedText>
      {onRefresh ? (
        <View style={{ marginTop: Spacing.lg }}>
          <ThemedButton
            label={t('rate.tryAgain')}
            onPress={onRefresh}
            variant="secondary"
            size="md"
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

function ErrorState({ onRefresh }: { onRefresh?: () => void }) {
  const t = useT();
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.stateContainer}>
      <ThemedText variant="titleMedium" align="center">
        {t('rate.couldnTBuildAPick')}
      </ThemedText>
      <ThemedText variant="caption" tone="tertiary" align="center" style={{ marginTop: 6 }}>
        {t('rate.tryAgainInAMoment')}
      </ThemedText>
      {onRefresh ? (
        <View style={{ marginTop: Spacing.lg }}>
          <ThemedButton
            label={t('rate.tryAgain')}
            onPress={onRefresh}
            variant="secondary"
            size="md"
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

function formatScore(raw: number): string {
  const n = raw > 10 ? raw / 10 : raw;
  return n.toFixed(1);
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroCard: {
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.md,
  },
  heroGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  heroRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  posterShadow: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  poster: {
    width: 110,
    height: 158,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  heroMeta: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: Spacing.xs,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    gap: 4,
    marginBottom: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.xxs,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
  reasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  reasonText: {
    flex: 1,
  },
  actionsRow: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  stateContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
});

export const PersonalizedPickSheet = memo(PersonalizedPickSheetComponent);
