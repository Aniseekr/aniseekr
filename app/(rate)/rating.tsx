import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PhotoCard } from '../../components/rate/PhotoCard';
import { Photo } from '../../components/rate/types';
import { AnimeRepository } from '../../libs/anime-repository';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../../components/common/GlassCard';
import { RatingInfoOverlay } from '../../components/rate/RatingInfoOverlay';

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
      {/* Header & Filters */}
      <View className="absolute top-0 left-0 right-0 z-50">
         {/* Top Bar */}
         <View className="flex-row items-center justify-between px-4 pb-2" style={{ paddingTop: top + 10 }}>
            {/* Close */}
            <Pressable onPress={handleClose} className="w-10 h-10 rounded-full bg-black/20 items-center justify-center">
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>

            {/* Center Status */}
            <GlassCard className="flex-row items-center gap-2 px-3 py-1.5 rounded-full" intensity={20}>
               <Text className="text-white font-bold text-sm">{loading ? "..." : `${currentIndex + 1}`}</Text>
               <Ionicons name="swap-horizontal" size={14} color="#fff" />
            </GlassCard>

            {/* Right Actions */}
            <View className="flex-row items-center gap-3">
               <Pressable className="w-10 h-10 rounded-full bg-black/20 items-center justify-center">
                  <Ionicons name="sparkles" size={20} color="#fff" />
               </Pressable>
               <Pressable className="w-10 h-10 rounded-full bg-black/20 items-center justify-center">
                  <Ionicons name="eye" size={22} color="#fff" />
               </Pressable>
               <Pressable className="w-10 h-10 rounded-full bg-black/20 items-center justify-center">
                  <Ionicons name="folder-open" size={20} color="#fff" />
               </Pressable>
            </View>
         </View>

         {/* Genre Pills */}
         <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}>
               {["All", "Action", "Adventure", "Comedy", "Drama", "Sci-Fi", "Fantasy"].map((genre, i) => (
                  <Pressable key={genre} className={`px-4 py-1.5 rounded-full ${i === 1 ? 'bg-zinc-800' : 'bg-black/20'} border border-white/10`}>
                     <Text className="text-white/90 text-sm font-medium">{genre}</Text>
                  </Pressable>
               ))}
            </ScrollView>
         </View>
      </View>

      {/* Card Stack (Full Screen) */}
      <View className="flex-1 bg-zinc-900">
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
          <View className="flex-1 w-full relative">
            {visibleCardIndices.map((photoIndex, stackIndex) => {
              const photo = photos[photoIndex];
              const isTopCard = stackIndex === 0;

              // Full screen stack logic
              return (
                <View
                  key={`${photo.id}-${photoIndex}`}
                  style={{
                    position: 'absolute',
                    top: 0, bottom: 0, left: 0, right: 0,
                    zIndex: MAX_VISIBLE_CARDS - stackIndex,
                    transform: [
                      // Slight scale down for cards behind
                      { scale: 1 - stackIndex * 0.02 },
                      // Slight downward offset for cards behind (optional, or keep centered)
                      // { translateY: stackIndex * 10 }, 
                    ],
                    // Don't fade out too much, keep it visible behind
                    opacity: 1, 
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

      {/* Overlays (Info & Buttons) */}
      <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0 z-50 pb-8">
          {photos.length > 0 && (
             <RatingInfoOverlay 
                photo={photos[currentIndex]} 
                onClose={() => console.log("Close overlay")}
                onMoreDetails={() => console.log("More details")}
             />
          )}
          
          {/* Bottom Action Buttons (3 Buttons) */}
          <View className="flex-row justify-center items-center gap-8 mt-4 pt-4">
             {/* Skip (Cross) */}
             <Pressable
                onPress={() => handleSwipe('left')}
                className="w-14 h-14 rounded-full bg-white shadow-lg items-center justify-center"
                style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 }}
             >
                <Ionicons name="close" size={28} color="#000" />
             </Pressable>

             {/* Like (Flame) - Main Button */}
             <Pressable
                onPress={() => handleSwipe('right')}
                className="w-20 h-20 rounded-full bg-orange-500 shadow-xl items-center justify-center border-4 border-white/10"
                style={{ shadowColor: '#F97316', shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 }}
             >
                <Ionicons name="flame" size={40} color="#fff" />
             </Pressable>

             {/* Check (Alt Like) */}
             <Pressable
                onPress={() => handleSwipe('right')}
                className="w-14 h-14 rounded-full bg-white shadow-lg items-center justify-center"
                style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 }}
             >
                <Ionicons name="checkmark" size={28} color="#000" />
             </Pressable>
          </View>
      </View>
    </SafeAreaView>
  );
}

