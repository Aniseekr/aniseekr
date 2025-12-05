import { View, Text, Pressable, ScrollView } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';

// Define types locally for now, could be shared
export interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  isR18: boolean;
  isShared: boolean;
  isSystemFolder: boolean;
  folderType?: string;
}

export interface AnimePreview {
  id: number;
  title: string;
  score?: number;
  year?: number;
  type?: string;
  image?: string;
}

interface FolderListProps {
    folders: CollectionFolder[];
    folderPreviews: { [key: string]: AnimePreview[] };
}

export function FolderList({ folders, folderPreviews }: FolderListProps) {
    const renderFolderSection = (folder: CollectionFolder) => {
        const previews = folderPreviews[folder.id] || [];
    
        return (
          <View key={folder.id} className="mb-8">
            <Pressable className="flex-row items-center justify-between mb-4 px-5 active:opacity-60">
              <View className="flex-row items-center gap-4">
                <View className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 items-center justify-center">
                  <Ionicons name={folder.icon as any} size={24} color="#fff" />
                </View>
                <Text className="text-white text-xl font-bold tracking-tight">{folder.name}</Text>
                {folder.isR18 && (
                  <View className="px-2 py-1 bg-red-500 rounded-lg">
                    <Text className="text-white text-[10px] font-bold">18+</Text>
                  </View>
                )}
                {folder.isShared && (
                  <View className="w-8 h-8 rounded-full bg-blue-500/20 items-center justify-center border border-blue-500/30">
                    <Ionicons name="people" size={14} color="#3b82f6" />
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>
    
            {folder.name === 'Wishlist' && previews.length > 0 ? (
              <View className="px-5">
                <GlassCard className="h-64 rounded-[36px] overflow-hidden p-0" variant="dark">
                  {/* Simulate a large cover image bg */}
                  <View className="absolute inset-0 bg-gray-800" /> 
                  <View className="absolute bottom-0 left-0 right-0 p-8 pt-20 bg-gradient-to-t from-black/90 to-transparent">
                    <Text className="text-white text-2xl font-bold mb-2 leading-7">{previews[0].title}</Text>
                    <View className="flex-row items-center gap-4">
                      {previews[0].score && (
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="star" size={16} color="#fbbf24" />
                          <Text className="text-yellow-400 text-base font-bold">{previews[0].score.toFixed(1)}</Text>
                        </View>
                      )}
                      {previews[0].year && <Text className="text-white/60 text-sm font-medium">{previews[0].year}</Text>}
                    </View>
                  </View>
                </GlassCard>
              </View>
            ) : folder.folderType === 'all' && previews.length > 0 ? (
              <View className="px-5">
                <View className="flex-row flex-wrap gap-3">
                  {previews.slice(0, 6).map((anime) => (
                    <View key={anime.id} className="w-[31%] mb-2">
                       <GlassCard className="aspect-[2/3] rounded-2xl mb-2 p-0 overflow-hidden border border-white/10" variant="clear">
                          <View className="flex-1 bg-white/5" />
                       </GlassCard>
                      <Text className="text-white text-[11px] font-medium leading-4 pl-1" numberOfLines={1}>
                        {anime.title}
                      </Text>
                      {anime.score && (
                        <View className="flex-row items-center gap-1 pl-1">
                          <Text className="text-yellow-500 text-[10px]">⭐</Text>
                          <Text className="text-white/60 text-[10px] font-bold">{anime.score.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ) : previews.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                <View className="flex-row gap-4">
                  {previews.map((anime) => (
                    <View key={anime.id} className="w-32">
                        <GlassCard className="aspect-[2/3] rounded-3xl mb-3 p-0 overflow-hidden border border-white/10" variant="clear">
                            <View className="flex-1 bg-white/5" />
                        </GlassCard>
                      <Text className="text-white text-xs font-semibold pl-1" numberOfLines={1}>
                        {anime.title}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Pressable className="px-5">
                <GlassCard className="h-32 rounded-[28px] items-center justify-center flex-row gap-3 border-dashed border-2 border-white/5" variant="clear">
                  <View className="w-12 h-12 rounded-full bg-white/5 items-center justify-center">
                    <Ionicons name="add" size={24} color="rgba(255,255,255,0.2)" />
                  </View>
                  <Text className="text-white/30 text-base font-medium">Add to collection</Text>
                </GlassCard>
              </Pressable>
            )}
          </View>
        );
      };

    return (
        <View>
            {folders.map(folder => renderFolderSection(folder))}
        </View>
    )
}
