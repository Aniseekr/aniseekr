import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Spacing, bottomPad } from '../../../constants/DesignSystem';
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
import { buildPilgrimageDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import {
  acceptSceneIdDisclosure,
  hasAcceptedSceneIdDisclosure,
} from '../../../libs/services/pilgrimage/scene-id/disclosure';
import {
  sceneIdService,
  type SceneIdentificationResult,
} from '../../../libs/services/pilgrimage/scene-id/scene-id-service';
import {
  pickSceneImage,
  prepareSceneImage,
} from '../../../libs/services/pilgrimage/scene-id/scene-image';
import type { PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';

type RequestSource = 'screenshot';
type ScreenPhase = 'idle' | 'processing' | 'result' | 'photo-denied';

export default function PilgrimageSceneIdScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScreenPhase>('idle');
  const [result, setResult] = useState<SceneIdentificationResult | null>(null);
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
      setResult(null);
      setPhase('processing');

      let prepared: Awaited<ReturnType<typeof prepareSceneImage>> | null = null;
      try {
        prepared = await prepareSceneImage(uri);
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;

        const searchInput = { ...prepared.searchInput, signal: controller.signal };
        const nextResult = await sceneIdService.identify(searchInput);
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
    []
  );

  const requestIdentification = useCallback(
    (uri: string, source: RequestSource) => {
      if (hasAcceptedSceneIdDisclosure()) {
        void runIdentification(uri, source);
        return;
      }
      pendingRequestRef.current = { uri, source };
      setImageUri(uri);
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
    requestIdentification(picked.uri, 'screenshot');
  }, [requestIdentification]);

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
  const resultWork = result?.status === 'identified' ? result.work : null;
  const chrome = useMemo(
    () => ({
      title: resultWork?.titleJa,
      poster: resultWork?.bgm?.[0] ? `https://api.bgm.tv/v0/subjects/${resultWork.bgm[0]}/image?type=common` : undefined,
    }),
    [resultWork]
  );

  const handleOpenPilgrimage = useCallback(() => {
    if (!resultWork) return;
    router.push(buildPilgrimageDetailRoute(resultWork.key, chrome));
  }, [chrome, resultWork, router]);

  const handleOpenSpot = useCallback(
    (spot: PilgrimageSpot) => {
      if (!resultWork) return;
      router.push(
        buildPilgrimageDetailRoute(resultWork.key, {
          ...chrome,
          focusSpotId: spot.id,
        })
      );
    },
    [chrome, resultWork, router]
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

  const selectedImageSource = imageUri ? { uri: imageUri } : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <ThemedIconButton
            icon={(color) => <Ionicons name="arrow-back" size={20} color={color} />}
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
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
});
