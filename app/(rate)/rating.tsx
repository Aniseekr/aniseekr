import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { PhotoCard, PhotoCardRef } from '../../components/rate/PhotoCard';
import { Photo } from '../../components/rate/types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { NativeAdCard, NativeAdCardRef } from '../../components/ads/NativeAdCard';
import { isAdSlotEnabled } from '../../libs/services/ads/ad-config';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../../components/common/GlassCard';
import { RatingInfoOverlay } from '../../components/rate/RatingInfoOverlay';
import { ModeSelector } from '../../components/rate/ModeSelector';
import {
  RatingActionButtons,
  type RatingType,
} from '../../components/rate/RatingActionButtons';
import { ImageDisplaySettingsSheet } from '../../components/rate/ImageDisplaySettingsSheet';
import { ImagePreloader } from '../../libs/image-preloader';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { LocalDB } from '../../libs/db';
import {
  DEFAULT_SWIPE_PREFS,
  loadUserPrefs,
  patchSwipePrefs,
  type SwipeMode,
  type SwipePrefs,
} from '../../libs/services/user-prefs';
import { useTheme } from '../../context/ThemeContext';
import { readableTextOn } from '../../components/themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAX_VISIBLE_CARDS = 3;
const CARD_STACK_SPACING = 10;
const CARD_SCALE_RATIO = 0.05;
const AD_INTERVAL = 12;

type DeckItem = { kind: 'photo'; photo: Photo } | { kind: 'ad'; id: string };

function buildDeck(photos: Photo[], includeAds: boolean): DeckItem[] {
  if (!includeAds) return photos.map((photo) => ({ kind: 'photo', photo }));
  const deck: DeckItem[] = [];
  let adCounter = 0;
  photos.forEach((photo, index) => {
    deck.push({ kind: 'photo', photo });
    if ((index + 1) % AD_INTERVAL === 0 && index < photos.length - 1) {
      deck.push({ kind: 'ad', id: `ad-${adCounter++}` });
    }
  });
  return deck;
}

// Spring config for smooth animations
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 180,
  mass: 1,
};

function deriveRatingFromDirection(
  direction: 'left' | 'right',
  mode: SwipeMode
): RatingType {
  if (direction === 'left') return 'skip';
  return mode === 'plan' ? 'tracking' : 'like';
}

function isPositiveRating(rating: RatingType): boolean {
  return rating === 'like' || rating === 'love' || rating === 'tracking';
}

async function applyOutcome(photo: Photo, rating: RatingType): Promise<void> {
  try {
    if (rating === 'skip') return;

    if (rating === 'tracking') {
      // Plan-mode right-swipe and tracking button: write into the `planned`
      // status so the item lands in Collection's "Plan to Watch" folder.
      await trackingService.updateStatus(photo.id, 'planned', {
        title: photo.title,
        imageUrl: photo.url,
      });
      return;
    }

    if (rating === 'like' || rating === 'love') {
      // Existing path: addRating('like') + addFavorite.
      await AnimeRepository.rateAnime(photo.id, 'like');
      return;
    }

    // dislike / neutral / pass — record a 'pass' for stats; nothing lands in
    // any folder.
    await LocalDB.addRating(photo.id, 'pass');
  } catch (err) {
    console.warn('[Rating] applyOutcome failed', err);
  }
}

const MODE_OPTIONS: readonly { value: SwipeMode; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'like', label: 'Like' },
];

export default function RatingScreen() {
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ genreId?: string; genreName?: string; animeId?: string }>();
  const { theme } = useTheme();

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [deck, setDeck] = useState<DeckItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swipePrefs, setSwipePrefs] = useState<SwipePrefs>(DEFAULT_SWIPE_PREFS);
  const [showSettings, setShowSettings] = useState(false);
  const adsEnabled = isAdSlotEnabled('rate_native');

  // Shared Value for the ACTIVE card's translation X
  const activeTranslationX = useSharedValue(0);

  // Ref for the top card (shared shape between PhotoCard and NativeAdCard)
  const topCardRef = useRef<PhotoCardRef | NativeAdCardRef>(null);
  // When a bottom-button is tapped, the desired rating is stashed here so the
  // ensuing swipe-callback consumes it instead of inferring an action from the
  // direction alone (which would lose 'love' vs 'like', 'dislike' vs 'skip', …).
  const pendingRatingRef = useRef<RatingType | null>(null);

  // Hydrate swipe prefs on mount; the ModeSelector + settings sheet persist
  // changes via patchSwipePrefs so they survive deck reloads.
  useEffect(() => {
    let cancelled = false;
    void loadUserPrefs().then((p) => {
      if (!cancelled) setSwipePrefs(p.swipe);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModeChange = useCallback((mode: SwipeMode) => {
    setSwipePrefs((prev) => ({ ...prev, mode }));
    void patchSwipePrefs({ mode });
    hapticsBridge.selection();
  }, []);

  const handleSwipePrefsChange = useCallback((next: SwipePrefs) => {
    setSwipePrefs(next);
    void patchSwipePrefs(next);
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [params.genreId, params.animeId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      let animeList;
      if (params.animeId) {
        // [NEW] Load specific anime if requested
        const specificAnime = await AnimeRepository.getAnimeDetails(params.animeId);
        animeList = [specificAnime];
        // Optional: fetch recommendations based on this anime to fill the stack?
        // For now, just the one to rate.
      } else if (params.genreId) {
        // Genre is a string name in AniList (e.g. "Action")
        animeList = await AnimeRepository.getAnimeByGenre(params.genreId);
      } else {
        animeList = await AnimeRepository.getSeasonalAnime();
      }
      const mappedPhotos = animeList.map(AnimeRepository.mapAnimeToPhoto);
      const validPhotos = mappedPhotos.filter((p) => !!p.url);
      console.log(`Loaded ${validPhotos.length} photos out of ${mappedPhotos.length} total`);
      if (validPhotos.length > 0) {
        console.log('First photo URL:', validPhotos[0].url);
      }
      setPhotos(validPhotos);
      setDeck(buildDeck(validPhotos, adsEnabled));
      setCurrentIndex(0); // Reset index when new photos are loaded
      activeTranslationX.value = 0; // Reset shared value
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const visibleCardIndices = useMemo(() => {
    const maxIndex = Math.min(currentIndex + MAX_VISIBLE_CARDS, deck.length);
    return Array.from({ length: maxIndex - currentIndex }, (_, i) => currentIndex + i);
  }, [currentIndex, deck.length]);

  // 🟢 Prefetch images for smoother experience
  useEffect(() => {
    if (deck.length > 0) {
      // Prefetch next 5 photo cards (skip ad sentinels)
      const nextPhotos = deck
        .slice(currentIndex + 1, currentIndex + 6)
        .map((item) => (item.kind === 'photo' ? item.photo.url : undefined))
        .filter(Boolean) as string[];
      ImagePreloader.preload(nextPhotos);
    }
  }, [currentIndex, deck]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const item = deck[currentIndex];
      if (item?.kind === 'photo') {
        const pending = pendingRatingRef.current;
        const rating: RatingType =
          pending ?? deriveRatingFromDirection(direction, swipePrefs.mode);
        void applyOutcome(item.photo, rating);
      }
      pendingRatingRef.current = null;

      // flingOut in PhotoCard already resets activeTranslationX; the new top
      // card will start from its own zero translation.
      if (currentIndex < deck.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        router.back();
      }
    },
    [currentIndex, deck, router, swipePrefs.mode]
  );

  // Bottom-button taps: stash the desired rating then animate the card out in
  // a sensible direction so the deck visually matches the action.
  const handleRateFromButton = useCallback((rating: RatingType) => {
    pendingRatingRef.current = rating;
    const direction = isPositiveRating(rating) ? 'right' : 'left';
    topCardRef.current?.swipe(direction);
  }, []);

  const triggerSwipe = useCallback((direction: 'left' | 'right') => {
    pendingRatingRef.current = null;
    topCardRef.current?.swipe(direction);
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const currentItem = deck[currentIndex];
  const currentPhoto = currentItem?.kind === 'photo' ? currentItem.photo : undefined;
  const photoProgress = useMemo(() => {
    if (deck.length === 0) return { current: 0, total: 0 };
    const total = photos.length;
    let current = 0;
    for (let i = 0; i <= currentIndex && i < deck.length; i++) {
      if (deck[i].kind === 'photo') current += 1;
    }
    return { current, total };
  }, [deck, currentIndex, photos.length]);

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]} edges={['left', 'right']}>
      {/* Header & Filters */}
      <View style={[styles.headerContainer, { paddingTop: top + 10 }]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>

          <GlassCard
            className="flex-row items-center gap-2 rounded-full px-3 py-1.5"
            intensity={20}>
            <Text style={styles.counterText}>
              {loading ? '...' : `${photoProgress.current} / ${photoProgress.total}`}
            </Text>
            <Ionicons name="swap-horizontal" size={14} color="#fff" />
          </GlassCard>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.actionButton}
              accessibilityLabel="Rating preferences"
              onPress={() => {
                hapticsBridge.tap();
                setShowSettings(true);
              }}>
              <Ionicons name="options-outline" size={20} color="#fff" />
            </Pressable>
            {/* Detail View Shortcut */}
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                if (currentPhoto) {
                  router.push(`/(rate)/anime/${currentPhoto.id}`);
                }
              }}>
              <Ionicons name="eye" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Mode selector: Plan (right swipe → Plan to Watch) / Like (right swipe → Favorites). */}
        <View style={styles.modeSelectorRow}>
          <ModeSelector
            options={MODE_OPTIONS}
            value={swipePrefs.mode}
            onChange={handleModeChange}
          />
          <Text style={styles.modeHint}>
            {swipePrefs.mode === 'plan'
              ? 'Swipe right to add to Plan to Watch'
              : 'Swipe right to add to Favorites'}
          </Text>
        </View>
      </View>

      {/* Card Stack (Full Screen) */}
      <View style={styles.cardStackContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="planet" size={48} color="#666" />
            <Text style={styles.loadingText}>Loading Anime...</Text>
          </View>
        ) : deck.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#666" />
            <Text style={styles.emptyText}>No photos available</Text>
            <Pressable onPress={handleClose} style={styles.goBackButton}>
              <Text style={styles.goBackButtonText}>Go Back</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardStack}>
            {visibleCardIndices
              .slice()
              .reverse()
              .map((deckIndex) => {
                const item = deck[deckIndex];
                if (!item) return null; // Safety check

                const stackIndex = visibleCardIndices.indexOf(deckIndex);
                const key = item.kind === 'photo' ? item.photo.id : item.id;
                return (
                  <CardWrapper
                    key={key}
                    item={item}
                    index={deckIndex}
                    stackIndex={stackIndex}
                    isTop={stackIndex === 0}
                    activeTranslationX={activeTranslationX}
                    onSwipe={handleSwipe}
                    refProp={stackIndex === 0 ? topCardRef : null}
                  />
                );
              })}
          </View>
        )}
      </View>

      {/* Overlays (Info & Buttons) */}
      <View
        style={[styles.overlayContainer, { paddingBottom: bottom + 16 }]}
        pointerEvents="box-none">
        {currentPhoto && (
          <RatingInfoOverlay
            photo={currentPhoto}
            onClose={() => {}}
            onMoreDetails={() => router.push(`/(rate)/anime/${currentPhoto.id}`)}
          />
        )}

        {swipePrefs.mode === 'plan' ? (
          <View style={styles.actionButtonsRow}>
            <Pressable
              onPress={() => triggerSwipe('left')}
              style={styles.skipButton}
              accessibilityLabel="Skip">
              <Ionicons name="close" size={28} color="#000" />
            </Pressable>

            <Pressable
              onPress={() => handleRateFromButton('tracking')}
              style={[styles.planButton, { backgroundColor: theme.accent }]}
              accessibilityLabel="Add to Plan to Watch">
              <Ionicons name="calendar" size={32} color={readableTextOn(theme.accent)} />
            </Pressable>
          </View>
        ) : (
          <RatingActionButtons
            style={styles.likeModeButtons}
            mode={swipePrefs.ratingButtons === 'five' ? 'fiveButtons' : 'threeButtons'}
            onRate={handleRateFromButton}
          />
        )}
      </View>

      <ImageDisplaySettingsSheet
        visible={showSettings}
        preferences={swipePrefs}
        onClose={() => setShowSettings(false)}
        onChange={handleSwipePrefsChange}
      />
    </SafeAreaView>
  );
}

// Subcomponent to handle individual card animations
function CardWrapper({
  item,
  index,
  stackIndex,
  isTop,
  activeTranslationX,
  onSwipe,
  refProp,
}: {
  item: DeckItem;
  index: number;
  stackIndex: number;
  isTop: boolean;
  activeTranslationX: SharedValue<number>;
  onSwipe: (direction: 'left' | 'right') => void;
  refProp: React.RefObject<(PhotoCardRef & NativeAdCardRef) | null> | null;
}) {
  // Derive progress from active card translation
  const progress = useDerivedValue(() => {
    return Math.min(Math.abs(activeTranslationX.value) / 300, 1);
  });

  // Non-linear progress for "pop" effect
  const nonLinearProgress = useDerivedValue(() => {
    return interpolate(Math.pow(progress.value, 2), [0, 1], [0, 1]);
  });

  const animatedStyle = useAnimatedStyle(() => {
    if (isTop) {
      return {
        zIndex: 100,
        transform: [{ scale: 1 }, { translateY: 0 }],
      };
    }

    // Background card animation logic
    // Base scale for this stack position (e.g., 1st behind is 0.95, 2nd is 0.9)
    const baseScale = 1 - stackIndex * CARD_SCALE_RATIO;
    // Next scale (what it will become when current card is gone)
    const nextScale = 1 - (stackIndex - 1) * CARD_SCALE_RATIO;

    // Base Y offset
    const baseTranslateY = stackIndex * CARD_STACK_SPACING;
    const nextTranslateY = (stackIndex - 1) * CARD_STACK_SPACING;

    // Interpolate based on progress
    const currentScale = interpolate(
      nonLinearProgress.value,
      [0, 1],
      [baseScale, nextScale],
      Extrapolation.CLAMP
    );

    const currentTranslateY = interpolate(
      nonLinearProgress.value,
      [0, 1],
      [baseTranslateY, nextTranslateY],
      Extrapolation.CLAMP
    );

    // Opacity: cards behind are slightly dimmed
    const baseOpacity = 1 - stackIndex * 0.15;
    const nextOpacity = 1 - (stackIndex - 1) * 0.15;
    const currentOpacity = interpolate(
      nonLinearProgress.value,
      [0, 1],
      [baseOpacity, nextOpacity],
      Extrapolation.CLAMP
    );

    return {
      zIndex: 100 - stackIndex,
      opacity: currentOpacity,
      transform: [{ scale: currentScale }, { translateY: currentTranslateY }],
    };
  });

  return (
    <Animated.View
      style={[styles.cardWrapper, animatedStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}>
      {item.kind === 'photo' ? (
        <PhotoCard
          ref={refProp}
          photo={item.photo}
          index={index}
          isTop={isTop}
          onSwipe={onSwipe}
          activeTranslation={isTop ? activeTranslationX : undefined}
        />
      ) : (
        <NativeAdCard
          ref={refProp}
          isTop={isTop}
          onSwipe={onSwipe}
          activeTranslation={isTop ? activeTranslationX : undefined}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSelectorRow: {
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  modeHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  cardStackContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '500',
  },
  goBackButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    marginTop: 8,
  },
  goBackButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  cardStack: {
    flex: 1,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    paddingHorizontal: 16,
    paddingTop: 120, // Space for header
    paddingBottom: 200, // Space for bottom overlay
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginTop: 16,
    paddingTop: 16,
  },
  skipButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  planButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  likeModeButtons: {
    marginTop: 16,
    paddingTop: 16,
  },
});
