import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Spacing, bottomPad } from '../../../constants/DesignSystem';
import { AnitabiOriginCredit } from '../../../components/pilgrimage/common/AnitabiOriginCredit';
import { SceneIdDisclosureSheet } from '../../../components/pilgrimage/scene-id/SceneIdDisclosureSheet';
import { SceneIdResultView } from '../../../components/pilgrimage/scene-id/SceneIdResultView';
import {
  Skeleton,
  ThemedButton,
  ThemedIconButton,
  ThemedText,
  readableTextOn,
} from '../../../components/themed';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { useAnimeDisplayTitle } from '../../../libs/i18n/use-display-title';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildPilgrimageDetailRoute,
  getPilgrimageSceneIdSeed,
} from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  acceptSceneIdDisclosure,
  hasAcceptedSceneIdDisclosure,
} from '../../../libs/services/pilgrimage/scene-id/disclosure';
import {
  getKnownAnitabiScene,
  sceneIdService,
  type AnitabiSceneIdentificationResult,
} from '../../../libs/services/pilgrimage/scene-id/scene-id-service';
import {
  pickSceneImage,
  prepareSceneImage,
} from '../../../libs/services/pilgrimage/scene-id/scene-image';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';

type RequestSource = 'standalone' | 'anitabi';
type ScreenPhase = 'idle' | 'processing' | 'result' | 'photo-denied';

export default function PilgrimageSceneIdScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const seed = useMemo(() => getPilgrimageSceneIdSeed(params), [params]);
  const knownResult = useMemo(
    () => (seed ? getKnownAnitabiScene(seed.bangumiId, seed.point) : null),
    [seed]
  );
  const [imageUri, setImageUri] = useState<string | null>(seed?.point.image ?? null);
  const [phase, setPhase] = useState<ScreenPhase>(knownResult ? 'result' : 'idle');
  const [result, setResult] = useState<AnitabiSceneIdentificationResult | null>(knownResult);
  const [activeRequestSource, setActiveRequestSource] = useState<RequestSource>(
    seed ? 'anitabi' : 'standalone'
  );
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const pendingRequestRef = useRef<{ uri: string; source: RequestSource } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    },
    []
  );

  const runIdentification = useCallback(
    async (uri: string, source: RequestSource) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      setImageUri(uri);
      setActiveRequestSource(source);
      setResult(null);
      setPhase('processing');

      let prepared: Awaited<ReturnType<typeof prepareSceneImage>> | null = null;
      try {
        prepared = await prepareSceneImage(uri);
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;

        const searchInput = { ...prepared.searchInput, signal: controller.signal };
        const nextResult =
          source === 'anitabi' && seed
            ? await sceneIdService.identifyAnitabiScene({
                image: searchInput,
                point: seed.point,
                knownBangumiId: seed.bangumiId,
              })
            : await sceneIdService.identify(searchInput);
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setResult(nextResult);
        setPhase('result');
      } catch {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setResult({ status: 'error' });
        setPhase('result');
      } finally {
        prepared?.dispose();
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [seed]
  );

  const requestIdentification = useCallback(
    (uri: string, source: RequestSource) => {
      if (hasAcceptedSceneIdDisclosure()) {
        void runIdentification(uri, source);
        return;
      }
      pendingRequestRef.current = { uri, source };
      setImageUri(uri);
      setActiveRequestSource(source);
      setDisclosureVisible(true);
    },
    [runIdentification]
  );

  const handlePickImage = useCallback(async () => {
    const picked = await pickSceneImage();
    if (picked.status === 'cancelled') return;
    if (picked.status === 'denied') {
      setPhase('photo-denied');
      return;
    }
    requestIdentification(picked.uri, 'standalone');
  }, [requestIdentification]);

  const handleIdentifyAnitabi = useCallback(() => {
    if (seed) requestIdentification(seed.point.image, 'anitabi');
  }, [requestIdentification, seed]);

  const handleAcceptDisclosure = useCallback(() => {
    const pending = pendingRequestRef.current;
    pendingRequestRef.current = null;
    acceptSceneIdDisclosure();
    setDisclosureVisible(false);
    if (pending) void runIdentification(pending.uri, pending.source);
  }, [runIdentification]);

  const handleDismissDisclosure = useCallback(() => {
    pendingRequestRef.current = null;
    setDisclosureVisible(false);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/pilgrimage');
  }, [router]);

  const resultBangumiId =
    result?.status === 'metadata'
      ? result.bangumiId
      : result?.status === 'identified'
        ? result.bangumiId
        : null;
  const resultAnime = result?.status === 'identified' ? result.anime : null;
  const traceTitleSource = useMemo(() => {
    if (result?.status !== 'identified') return null;
    const trace = result.trace;
    return {
      id: trace.anilistId,
      title:
        trace.titles.romaji ??
        trace.titles.native ??
        trace.titles.english ??
        String(trace.anilistId),
      titleEnglish: trace.titles.english,
      titleRomaji: trace.titles.romaji,
      titleJapanese: trace.titles.native,
    };
  }, [result]);
  const traceDisplayTitle = useAnimeDisplayTitle(traceTitleSource);
  const resultAnimeTitles = useMemo(
    () => (resultAnime ? getPilgrimageAnimeTitles(resultAnime) : null),
    [resultAnime]
  );
  const chrome = useMemo(
    () => ({
      title: resultAnimeTitles?.primary ?? seed?.chrome.title,
      titleSecondary: resultAnimeTitles?.secondary ?? seed?.chrome.titleSecondary,
      poster: resultAnime?.cover ?? seed?.chrome.poster,
      themeColor: resultAnime?.color ?? seed?.chrome.themeColor,
    }),
    [resultAnime, resultAnimeTitles, seed]
  );

  const handleOpenPilgrimage = useCallback(() => {
    if (resultBangumiId === null) return;
    router.push(buildPilgrimageDetailRoute(resultBangumiId, chrome));
  }, [chrome, resultBangumiId, router]);

  const handleOpenSpot = useCallback(
    (spot: AnitabiPoint) => {
      if (resultBangumiId === null) return;
      router.push(
        buildPilgrimageDetailRoute(resultBangumiId, {
          ...chrome,
          focusSpotId: spot.id,
        })
      );
    },
    [chrome, resultBangumiId, router]
  );

  const handleOpenAnime = useCallback(() => {
    if (result?.status !== 'identified') return;
    const trace = result.trace;
    pushAnimeDetail(router, {
      id: trace.anilistId,
      title: traceDisplayTitle || traceTitleSource?.title,
      image: trace.previewImageUrl || undefined,
    });
  }, [result, router, traceDisplayTitle, traceTitleSource?.title]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => undefined);
  }, []);

  const selectedImageSource = imageUri
    ? /^https?:\/\//i.test(imageUri)
      ? anitabiImageSource(imageUri)
      : { uri: imageUri }
    : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <ThemedIconButton
            icon={(color) => <Ionicons name="chevron-back" size={22} color={color} />}
            accessibilityLabel={t('common.back')}
            onPress={handleBack}
            variant="ghost"
          />
          <ThemedText variant="titleMedium" weight="700" numberOfLines={1} style={styles.title}>
            {t('pilgrimage.identify.title')}
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomPad({ bottom: 0 }) },
          ]}>
          {phase === 'processing' && selectedImageSource ? (
            <View style={styles.processing}>
              <Image source={selectedImageSource} style={styles.heroImage} contentFit="cover" />
              <AnitabiOriginCredit
                source={activeRequestSource === 'anitabi' ? seed?.point : null}
                variant="inline"
              />
              <ThemedText variant="titleMedium" weight="700">
                {t('pilgrimage.identify.analyzing')}
              </ThemedText>
              <Skeleton.Block width="100%" height={18} borderRadius={Radius.sm} />
              <Skeleton.Block width="72%" height={18} borderRadius={Radius.sm} />
              <Skeleton.Block width="100%" height={52} borderRadius={Radius.sm} />
            </View>
          ) : phase === 'result' && result && imageUri ? (
            <SceneIdResultView
              imageUri={imageUri}
              result={result}
              identifiedTitle={traceDisplayTitle}
              seedTitle={chrome.title}
              sourcePoint={activeRequestSource === 'anitabi' ? seed?.point : null}
              onChooseAnother={handlePickImage}
              onOpenAnime={handleOpenAnime}
              onOpenPilgrimage={handleOpenPilgrimage}
              onOpenSpot={handleOpenSpot}
            />
          ) : phase === 'photo-denied' ? (
            <View style={styles.centerState}>
              <Ionicons name="images-outline" size={40} color={theme.text.tertiary} />
              <ThemedText variant="titleLarge" weight="700" align="center">
                {t('pilgrimage.identify.photoDeniedTitle')}
              </ThemedText>
              <ThemedText variant="bodyMedium" tone="secondary" align="center">
                {t('pilgrimage.identify.photoDeniedBody')}
              </ThemedText>
              <ThemedButton
                label={t('common.settings')}
                onPress={handleOpenSettings}
                shape="rounded"
                fullWidth
              />
              <ThemedButton
                label={t('pilgrimage.identify.chooseScreenshot')}
                onPress={handlePickImage}
                variant="secondary"
                shape="rounded"
                fullWidth
              />
            </View>
          ) : seed ? (
            <View style={styles.idle}>
              <Image
                source={anitabiImageSource(seed.point.image)}
                style={styles.heroImage}
                contentFit="cover"
              />
              <AnitabiOriginCredit source={seed.point} variant="inline" />
              <ThemedText variant="titleLarge" weight="700">
                {seed.chrome.title || seed.point.name}
              </ThemedText>
              <ThemedButton
                label={t('pilgrimage.identify.entry')}
                accessibilityLabel={t('pilgrimage.identify.scanSceneA11y')}
                onPress={handleIdentifyAnitabi}
                icon={
                  <Ionicons name="scan-outline" size={18} color={readableTextOn(theme.accent)} />
                }
                shape="rounded"
                fullWidth
              />
            </View>
          ) : (
            <View style={styles.centerState}>
              <View style={[styles.scanIcon, { backgroundColor: `${theme.accent}18` }]}>
                <Ionicons name="scan-outline" size={38} color={theme.accent} />
              </View>
              <ThemedButton
                label={t('pilgrimage.identify.chooseScreenshot')}
                onPress={handlePickImage}
                icon={
                  <Ionicons name="image-outline" size={18} color={readableTextOn(theme.accent)} />
                }
                shape="rounded"
                fullWidth
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <SceneIdDisclosureSheet
        visible={disclosureVisible}
        onAccept={handleAcceptDisclosure}
        onDismiss={handleDismissDisclosure}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.md,
  },
  idle: {
    gap: Spacing.md,
  },
  processing: {
    gap: Spacing.md,
  },
  centerState: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(128,128,128,0.16)',
  },
  scanIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
});
