import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PhotoCard } from '../../components/rate/PhotoCard';
import { Photo } from '../../components/rate/types';
import { AnimeRepository } from '../../libs/anime-repository';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../../components/common/GlassCard';

const MAX_VISIBLE_CARDS = 3;
const CARD_SPACING = 8;

export default function RatingScreen() {
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ genreId?: string; genreName?: string; animeId?: string }>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, [params.genreId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      let animeList;
      if (params.genreId) {
        animeList = await AnimeRepository.getAnimeByGenre(Number(params.genreId));
      } else {
        // Fallback to trending or seasonal if no genre
        animeList = await AnimeRepository.getSeasonalAnime();
      }
      const mappedPhotos = animeList.map(AnimeRepository.mapAnimeToPhoto);
      // Filter out photos without URL
      setPhotos(mappedPhotos.filter(p => !!p.url));
    } catch (error) {
      console.error("Failed to load photos:", error);
    } finally {
      setLoading(false);
    }
  };

  const visibleCardIndices = useMemo(() => {
    const maxIndex = Math.min(currentIndex + MAX_VISIBLE_CARDS, photos.length);
    return Array.from({ length: maxIndex - currentIndex }, (_, i) => currentIndex + i);
  }, [currentIndex, photos.length]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      // Save rating based on direction
      if (direction === 'right') {
        // Like/Track
        console.log('Liked photo:', photos[currentIndex]?.id);
      } else {
        // Skip
        console.log('Skipped photo:', photos[currentIndex]?.id);
      }

      // Move to next photo
      if (currentIndex < photos.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // No more photos, go back or fetch more
        router.back();
      }
    },
    [currentIndex, photos, router]
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#050505' }} className="flex-1">
      {/* Header */}
      <View className="absolute top-0 left-0 right-0 z-50" style={{ paddingTop: top }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable onPress={handleClose} className="w-10 h-10 rounded-3xl bg-white/10 items-center justify-center">
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <GlassCard className="px-4 py-2">
              <Text className="text-white text-sm font-semibold">
                {loading ? "Loading..." : `${currentIndex + 1} / ${photos.length}`}
              </Text>
            </GlassCard>
          </View>
        </View>
      </View>

      {/* Card Stack */}
      <View className="flex-1 items-center justify-center" style={{ paddingTop: top + 60, paddingBottom: bottom + 120 }}>
        {loading ? (
           <View className="items-center justify-center flex-1">
             <Text className="text-white/80 text-lg">Loading Anime...</Text>
           </View>
        ) : photos.length === 0 ? (
          <View className="items-center justify-center flex-1">
            <Text className="text-white/80 text-lg mb-4">No photos available</Text>
            <Pressable onPress={handleClose} className="px-6 py-3 bg-white rounded-3xl">
              <Text className="text-black font-semibold">Go Back</Text>
            </Pressable>
          </View>
        ) : (
          <View className="w-full h-full items-center justify-center" style={{ position: 'relative' }}>
            {visibleCardIndices.map((photoIndex, stackIndex) => {
              const photo = photos[photoIndex];
              const isTopCard = stackIndex === 0;

              return (
                <View
                  key={`${photo.id}-${photoIndex}`}
                  style={{
                    position: 'absolute',
                    zIndex: MAX_VISIBLE_CARDS - stackIndex,
                    transform: [
                      { translateY: stackIndex * CARD_SPACING },
                      { scale: 1 - stackIndex * 0.05 },
                    ],
                    opacity: 1 - stackIndex * 0.1,
                  }}
                >
                  <PhotoCard
                    photo={photo}
                    index={photoIndex}
                    isTop={isTopCard}
                    onSwipe={isTopCard ? handleSwipe : () => {}}
                  />
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Bottom Action Buttons */}
      <View className="absolute bottom-0 left-0 right-0 z-50" style={{ paddingBottom: bottom + 20 }}>
        <View className="flex-row justify-center gap-6 px-5">
          <Pressable
            onPress={() => handleSwipe('left')}
            className="w-16 h-16 rounded-3xl bg-white/10 items-center justify-center"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => handleSwipe('right')}
            className="w-16 h-16 rounded-3xl bg-white/10 items-center justify-center"
          >
            <Ionicons name="heart" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

