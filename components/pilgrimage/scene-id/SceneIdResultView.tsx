import { memo } from 'react';
import { Image } from 'expo-image';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import type { SceneIdentificationResult } from '../../../libs/services/pilgrimage/scene-id/scene-id-service';
import { ThemedButton, ThemedSurface, ThemedText, readableTextOn } from '../../themed';

interface SceneIdResultViewProps {
  imageUri: string;
  result: SceneIdentificationResult;
  identifiedTitle: string;
  onChooseAnother: () => void;
  onOpenAnime: () => void;
  onOpenPilgrimage: () => void;
  onOpenSpot: (spot: PilgrimageSpot) => void;
}

function SceneIdResultViewComponent({
  imageUri,
  result,
  identifiedTitle,
  onChooseAnother,
  onOpenAnime,
  onOpenPilgrimage,
  onOpenSpot,
}: SceneIdResultViewProps) {
  const { theme } = useTheme();
  const t = useT();

  if (result.status !== 'identified') {
    return (
      <View style={styles.content}>
        <Image source={{ uri: imageUri }} style={styles.heroImage} contentFit="cover" />
        <Animated.View entering={FadeIn} style={styles.emptyState}>
          <Ionicons name="search-outline" size={24} color={theme.status.warning} />
          <ThemedText variant="titleLarge" weight="700" align="center">
            {t(failureTitle(result.status))}
          </ThemedText>
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            {t(failureBody(result.status))}
          </ThemedText>
        </Animated.View>
        <ThemedButton label={t('pilgrimage.identify.chooseAnother')} onPress={onChooseAnother} variant="secondary" fullWidth />
      </View>
    );
  }

  const trace = result.trace;
  const episode = trace.episode === null ? null : t('pilgrimage.identify.episodeLabel', { episode: trace.episode });
  const timestamp = t('pilgrimage.identify.timestampLabel', { time: formatTimestamp(trace.at) });
  return (
    <View style={styles.content}>
      <Image source={{ uri: imageUri }} style={styles.heroImage} contentFit="cover" />
      <View style={styles.header}>
        <ThemedText variant="captionSmall" tone="accent" weight="800">
          {t(levelKey(result.level))}
        </ThemedText>
        <ThemedText variant="titleLarge" weight="800">
          {identifiedTitle || trace.titles.native || trace.titles.english || String(trace.anilistId)}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {t('pilgrimage.identify.confidence', { percent: Math.round(trace.similarity * 100) })}
          {episode ? ` · ${episode}` : ''} · {timestamp}
        </ThemedText>
      </View>

      {result.spots.length ? (
        <View style={styles.spots}>
          {result.spots.map((spot) => (
            <ThemedSurface key={spot.id} variant="card" style={styles.spotCard}>
              <ThemedButton
                variant="ghost"
                label={spot.scenes[0]?.episode ?? t('pilgrimage.identify.episodeUnknown')}
                size="sm"
                onPress={() => onOpenSpot(spot)}
              />
              <View style={styles.spotCopy}>
                <ThemedText variant="titleSmall" weight="700">{spot.name}</ThemedText>
                {spot.address ? <ThemedText variant="caption" tone="secondary">{spot.address}</ThemedText> : null}
                <ThemedText variant="captionSmall" tone="secondary">
                  {t(`pilgrimage.confidence.${spot.confidence}`)}
                </ThemedText>
                {spot.scenes[0]?.episodeBasis === 'reference' || spot.scenes[0]?.timeBasis === 'reference' ? (
                  <ThemedText variant="captionSmall" tone="secondary">{t('pilgrimage.referenceBasis')}</ThemedText>
                ) : null}
              </View>
              <ThemedButton
                accessibilityLabel={t('pilgrimage.identify.openSpot')}
                label={t('pilgrimage.identify.openSpot')}
                onPress={() => onOpenSpot(spot)}
                icon={<Ionicons name="location-outline" size={18} color={readableTextOn(theme.accent)} />}
                size="sm"
              />
            </ThemedSurface>
          ))}
        </View>
      ) : null}

      {result.work ? (
        <ThemedButton label={t('pilgrimage.identify.openPilgrimage')} onPress={onOpenPilgrimage} fullWidth />
      ) : (
        <ThemedButton label={t('pilgrimage.identify.openAnime')} onPress={onOpenAnime} fullWidth />
      )}
      {result.work && !result.spots.length ? (
        <ThemedText variant="bodySmall" tone="secondary">{t('pilgrimage.identify.noEpisodeSpots')}</ThemedText>
      ) : null}
      <ThemedButton label={t('pilgrimage.identify.chooseAnother')} onPress={onChooseAnother} variant="ghost" fullWidth />
    </View>
  );
}

function levelKey(level: 'scene' | 'episode' | 'anime' | 'identified') {
  switch (level) {
    case 'scene': return 'pilgrimage.identify.sceneLevel';
    case 'episode': return 'pilgrimage.identify.episodeLevel';
    case 'anime': return 'pilgrimage.identify.animeLevel';
    default: return 'pilgrimage.identify.identifiedLevel';
  }
}

function failureTitle(status: Exclude<SceneIdentificationResult['status'], 'identified'>) {
  switch (status) {
    case 'no-match': return 'pilgrimage.identify.noMatchTitle';
    case 'invalid-image': return 'pilgrimage.identify.invalidImageTitle';
    case 'service-limited': return 'pilgrimage.identify.serviceLimitedTitle';
    case 'rate-limited': return 'pilgrimage.identify.rateLimitedTitle';
    case 'cancelled':
    case 'error': return 'pilgrimage.identify.errorTitle';
  }
}

function failureBody(status: Exclude<SceneIdentificationResult['status'], 'identified'>) {
  switch (status) {
    case 'no-match': return 'pilgrimage.identify.noMatchBody';
    case 'invalid-image': return 'pilgrimage.identify.invalidImageBody';
    case 'service-limited': return 'pilgrimage.identify.serviceLimitedBody';
    case 'rate-limited': return 'pilgrimage.identify.rateLimitedBody';
    case 'cancelled':
    case 'error': return 'pilgrimage.identify.errorBody';
  }
}

function formatTimestamp(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export const SceneIdResultView = memo(SceneIdResultViewComponent);

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  heroImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.sm },
  header: { gap: Spacing.xs },
  emptyState: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  spots: { gap: Spacing.sm },
  spotCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm },
  spotCopy: { flex: 1, gap: Spacing.xxs },
});
