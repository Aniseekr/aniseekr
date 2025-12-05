import { View, Text, Pressable } from "react-native";
import { Photo } from "./types";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";

type Props = {
  photo: Photo | null;
  onClose?: () => void;
  onMoreDetails?: () => void;
};

export function RatingInfoOverlay({ photo, onClose, onMoreDetails }: Props) {
  if (!photo) return null;

  return (
    <Animated.View 
      entering={FadeInDown.springify()} 
      exiting={FadeOutDown.springify()}
      className="absolute bottom-28 left-4 right-4 z-40"
    >
      <View className="rounded-3xl overflow-hidden bg-black/80 border border-white/10 shadow-lg">
        <BlurView intensity={80} tint="dark" className="p-5">
          {/* Row 1: Title & Actions */}
          <View className="flex-row items-start justify-between mb-1">
            <Text className="text-white text-xl font-bold flex-1 mr-2" numberOfLines={1}>
              {photo.title || "Unknown Title"}
            </Text>
            
            <View className="flex-row items-center gap-1">
               {/* Score / Vibe */}
               <View className="flex-row items-center gap-1 mr-2">
                 <Ionicons name="star" size={14} color="#F59E0B" />
                 <Text className="text-amber-500 font-bold text-base">{photo.score ? photo.score.toFixed(2) : "N/A"}</Text>
                 <View className="items-end">
                    <Text className="text-white/40 text-[10px] leading-3">Vibe</Text>
                    <Text className="text-white/80 text-xs font-medium leading-3">91</Text>
                 </View>
               </View>

              {/* Action Buttons on Card */}
              <Pressable onPress={onMoreDetails} className="w-8 h-8 rounded-full bg-white/10 items-center justify-center">
                <Ionicons name="chevron-up" size={18} color="#fff" />
              </Pressable>
              
              <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-white/10 items-center justify-center ml-1">
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Row 2: Subtitle Metadata */}
          <Text className="text-white/60 text-xs font-medium mb-3">
             {photo.year || "Unknown"} • {photo.type || "Anime"}
          </Text>

          {/* Row 3: Tags */}
          {photo.tags && photo.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {photo.tags.slice(0, 4).map((tag, i) => (
                <View key={i} className="bg-white/10 px-3 py-1.5 rounded-full border border-white/5">
                  <Text className="text-white/90 text-xs font-medium">{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </BlurView>
      </View>
    </Animated.View>
  );
}
