import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';

import { AnitabiOriginCredit } from '../common/AnitabiOriginCredit';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT, type TranslationKey } from '../../../libs/i18n';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type {
  AnitabiSceneIdentificationResult,
  SceneIdCandidate,
} from '../../../libs/services/pilgrimage/scene-id/scene-id-service';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { ThemedButton, ThemedSurface, ThemedText, readableTextOn } from '../../themed';

interface SceneIdResultViewProps {
  imageUri: string;
  result: AnitabiSceneIdentificationResult;
  identifiedTitle: string;
  seedTitle?: string | null;
  sourcePoint?: AnitabiPoint | null;
  onChooseAnother: () => void;
  onOpenAnime: () => void;
  onOpenPilgrimage: () => void;
  onOpenSpot: (spot: AnitabiPoint) => void;
}

function SceneIdResultViewComponent({
  imageUri,
  result,
  identifiedTitle,
  seedTitle,
  sourcePoint,
  onChooseAnother,
  onOpenAnime,
  onOpenPilgrimage,
  onOpenSpot,
}: SceneIdResultViewProps) {
  const { theme } = useTheme();
  const t = useT();
  const imageSource = useMemo(
    () => (/^https?:\/\//i.test(imageUri) ? anitabiImageSource(imageUri) : { uri: imageUri }),
    [imageUri]
  );

  if (result.status === 'metadata') {
    const titles = getPilgrimageSpotTitles(result.spot);
    return (
      <View style={styles.content}>
        <Image source={imageSource} style={styles.heroImage} contentFit="cover" />
        <AnitabiOriginCredit source={sourcePoint ?? result.spot} variant="inline" />
        <ResultHeader
          eyebrow={t('pilgrimage.identify.knownMetadata')}
          title={titles.primary}
          details={[
            ...(seedTitle ? [seedTitle] : []),
            t('pilgrimage.identify.episodeLabel', { episode: result.episode }),
            t('pilgrimage.identify.timestampLabel', { time: formatTimestamp(result.at) }),
          ]}
        />
        <ThemedButton
          label={t('pilgrimage.identify.openSpot')}
          onPress={() => onOpenSpot(result.spot)}
          icon={<Ionicons name="location" size={18} color={readableTextOn(theme.accent)} />}
          shape="rounded"
          fullWidth
        />
        <ThemedButton
          label={t('pilgrimage.identify.chooseAnother')}
          onPress={onChooseAnother}
          variant="secondary"
          shape="rounded"
          fullWidth
        />
      </View>
    );
  }

  if (result.status !== 'identified') {
    const copy = failureCopy(result.status);
    return (
      <View style={styles.content}>
        <Image source={imageSource} style={styles.heroImage} contentFit="cover" />
        <AnitabiOriginCredit source={sourcePoint} variant="inline" />
        <View style={styles.emptyState}>
          <View style={[styles.statusIcon, { backgroundColor: `${theme.status.warning}20` }]}>
            <Ionicons name="search-outline" size={24} color={theme.status.warning} />
          </View>
          <ThemedText variant="titleLarge" weight="700" align="center">
            {t(copy.title)}
          </ThemedText>
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            {t(copy.body)}
          </ThemedText>
        </View>
        <ThemedButton
          label={t('pilgrimage.identify.chooseAnother')}
          onPress={onChooseAnother}
          variant="secondary"
          shape="rounded"
          fullWidth
        />
        <ProviderCredit />
      </View>
    );
  }

  const title = identifiedTitle || seedTitle || String(result.trace.anilistId);
  const details = [
    t('pilgrimage.identify.confidence', {
      percent: Math.round(result.trace.similarity * 100),
    }),
    ...(result.trace.episode !== null
      ? [t('pilgrimage.identify.episodeLabel', { episode: result.trace.episode })]
      : []),
    t('pilgrimage.identify.timestampLabel', { time: formatTimestamp(result.trace.at) }),
  ];

  return (
    <View style={styles.content}>
      <Image source={imageSource} style={styles.heroImage} contentFit="cover" />
      <AnitabiOriginCredit source={sourcePoint} variant="inline" />
      <ResultHeader eyebrow={t(levelKey(result.level))} title={title} details={details} />

      {result.candidates.length > 0 ? (
        <View style={styles.candidateList}>
          {result.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.spot.id}
              candidate={candidate}
              onPress={() => onOpenSpot(candidate.spot)}
            />
          ))}
        </View>
      ) : result.level !== 'identified' && result.bangumiId !== null ? (
        <ThemedButton
          label={t('pilgrimage.identify.openPilgrimage')}
          onPress={onOpenPilgrimage}
          icon={<Ionicons name="map-outline" size={18} color={readableTextOn(theme.accent)} />}
          shape="rounded"
          fullWidth
        />
      ) : (
        <ThemedButton
          label={t('pilgrimage.identify.openAnime')}
          onPress={onOpenAnime}
          icon={
            <Ionicons name="play-circle-outline" size={18} color={readableTextOn(theme.accent)} />
          }
          shape="rounded"
          fullWidth
        />
      )}

      {result.candidates.length > 0 ? (
        <ThemedButton
          label={t('pilgrimage.identify.openPilgrimage')}
          onPress={onOpenPilgrimage}
          variant="secondary"
          shape="rounded"
          fullWidth
        />
      ) : null}
      <ThemedButton
        label={t('pilgrimage.identify.chooseAnother')}
        onPress={onChooseAnother}
        variant="ghost"
        shape="rounded"
        fullWidth
      />
      <ProviderCredit />
    </View>
  );
}

function ResultHeader({
  eyebrow,
  title,
  details,
}: {
  eyebrow: string;
  title: string;
  details: string[];
}) {
  return (
    <View style={styles.header}>
      <ThemedText variant="captionSmall" tone="accent" weight="800">
        {eyebrow}
      </ThemedText>
      <ThemedText variant="titleLarge" weight="800">
        {title}
      </ThemedText>
      <View style={styles.detailRow}>
        {details.map((detail) => (
          <ThemedText key={detail} variant="bodySmall" tone="secondary">
            {detail}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

function CandidateRow({
  candidate,
  onPress,
}: {
  candidate: SceneIdCandidate;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const titles = getPilgrimageSpotTitles(candidate.spot);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.identify.openSpot')}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedSurface variant="card" radius={Radius.sm} style={styles.candidate}>
        <Image
          source={anitabiImageSource(candidate.spot.image)}
          style={styles.candidateImage}
          contentFit="cover"
        />
        <View style={styles.candidateText}>
          <ThemedText variant="titleSmall" weight="700" numberOfLines={2}>
            {titles.primary}
          </ThemedText>
          {titles.secondary ? (
            <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
              {titles.secondary}
            </ThemedText>
          ) : null}
          {candidate.deltaSeconds !== null ? (
            <ThemedText variant="captionSmall" tone="accent">
              {t('pilgrimage.identify.timestampMatch', {
                seconds: Math.round(candidate.deltaSeconds),
              })}
            </ThemedText>
          ) : null}
          <AnitabiOriginCredit source={candidate.spot} variant="inline" />
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
      </ThemedSurface>
    </Pressable>
  );
}

function ProviderCredit() {
  const t = useT();
  return (
    <ThemedText variant="captionSmall" tone="tertiary" align="center">
      {t('pilgrimage.identify.poweredBy')}
    </ThemedText>
  );
}

function levelKey(
  level: Extract<AnitabiSceneIdentificationResult, { status: 'identified' }>['level']
): TranslationKey {
  switch (level) {
    case 'scene':
      return 'pilgrimage.identify.sceneLevel';
    case 'episode':
      return 'pilgrimage.identify.episodeLevel';
    case 'anime':
      return 'pilgrimage.identify.animeLevel';
    case 'identified':
      return 'pilgrimage.identify.identifiedLevel';
  }
}

function failureCopy(
  status: Exclude<AnitabiSceneIdentificationResult['status'], 'identified' | 'metadata'>
): { title: TranslationKey; body: TranslationKey } {
  switch (status) {
    case 'no-match':
      return {
        title: 'pilgrimage.identify.noMatchTitle',
        body: 'pilgrimage.identify.noMatchBody',
      };
    case 'invalid-image':
      return {
        title: 'pilgrimage.identify.invalidImageTitle',
        body: 'pilgrimage.identify.invalidImageBody',
      };
    case 'service-limited':
      return {
        title: 'pilgrimage.identify.serviceLimitedTitle',
        body: 'pilgrimage.identify.serviceLimitedBody',
      };
    case 'rate-limited':
      return {
        title: 'pilgrimage.identify.rateLimitedTitle',
        body: 'pilgrimage.identify.rateLimitedBody',
      };
    case 'cancelled':
    case 'error':
      return {
        title: 'pilgrimage.identify.errorTitle',
        body: 'pilgrimage.identify.errorBody',
      };
  }
}

function formatTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.md,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(128,128,128,0.16)',
  },
  header: {
    gap: Spacing.xs,
  },
  detailRow: {
    gap: Spacing.xxs,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  candidateList: {
    gap: Spacing.xs,
  },
  candidate: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xs,
  },
  candidateImage: {
    width: 96,
    height: 64,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(128,128,128,0.16)',
  },
  candidateText: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.78,
  },
});

export const SceneIdResultView = memo(SceneIdResultViewComponent);
