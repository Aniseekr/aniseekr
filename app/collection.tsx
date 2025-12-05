import { ScrollView, Text, View, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { GlassCard } from '../components/common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  isR18: boolean;
  isShared: boolean;
  isSystemFolder: boolean;
  folderType?: string;
}

interface Anime {
  id: number;
  title: string;
  images: {
    jpg: {
      imageUrl?: string;
      largeImageUrl?: string;
    };
  };
  score?: number;
  year?: number;
  type?: string;
}

const availableCategories = ['Overview', 'Movie', 'Game'];

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Overview');
  const [folders, setFolders] = useState<CollectionFolder[]>([
    { id: '1', name: 'All', icon: 'library', isR18: false, isShared: false, isSystemFolder: true, folderType: 'all' },
    { id: '2', name: 'Wishlist', icon: 'star', isR18: false, isShared: false, isSystemFolder: true },
    { id: '3', name: 'Watching', icon: 'play-circle', isR18: false, isShared: false, isSystemFolder: true },
  ]);
  const [folderPreviews, setFolderPreviews] = useState<{ [key: string]: Anime[] }>({});

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    folders.forEach((folder) => {
      const previews = folderPreviews[folder.id] || [];
      previews.forEach((anime) => {
        const type = anime.type?.toLowerCase() || 'other';
        if (type === 'movie') counts['Movie'] = (counts['Movie'] || 0) + 1;
        if (type === 'game') counts['Game'] = (counts['Game'] || 0) + 1;
        counts['Overview'] = (counts['Overview'] || 0) + 1;
      });
    });
    return counts;
  }, [folders, folderPreviews]);

  const filteredFolders = useMemo(() => {
    if (selectedCategory === 'Overview') return folders;
    return folders.filter((folder) => {
      const previews = folderPreviews[folder.id] || [];
      return previews.some((anime) => {
        const type = anime.type?.toLowerCase() || '';
        if (selectedCategory === 'Movie') return type === 'movie';
        if (selectedCategory === 'Game') return type === 'game';
        return true;
      });
    });
  }, [selectedCategory, folders, folderPreviews]);

  const headerView = (
    <GlassCard className="p-6 mb-6">
      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
              <Ionicons name="library" size={24} color="#fff" />
            </View>
            <Text className="text-white text-2xl font-bold">Collector</Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
              <Ionicons name="search" size={20} color="#fff" />
            </Pressable>
            <Pressable className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
            <Pressable className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
              <Ionicons name="refresh" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {availableCategories.map((category) => {
              const count = categoryCounts[category] || 0;
              const isSelected = selectedCategory === category;
              return (
                <Pressable
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  className={`px-5 py-3 rounded-3xl ${isSelected ? 'bg-white' : 'bg-white/10'}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className={`text-base font-semibold ${isSelected ? 'text-black' : 'text-white'}`}>
                      {category}
                    </Text>
                    {count > 0 && (
                      <View className={`px-2 py-1 rounded-2xl ${isSelected ? 'bg-black/10' : 'bg-white/10'}`}>
                        <Text className={`text-xs font-bold ${isSelected ? 'text-black/60' : 'text-white/60'}`}>
                          {count}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </GlassCard>
  );

  const renderFolderSection = (folder: CollectionFolder) => {
    const previews = folderPreviews[folder.id] || [];

    return (
      <View key={folder.id} className="mb-6">
        <Pressable className="flex-row items-center justify-between mb-4 px-5">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
              <Ionicons name={folder.icon as any} size={24} color="#fff" />
            </View>
            <Text className="text-white text-xl font-semibold">{folder.name}</Text>
            {folder.isR18 && (
              <View className="px-2 py-1 bg-orange-500 rounded-2xl">
                <Text className="text-white text-xs font-bold">15+</Text>
              </View>
            )}
            {folder.isShared && (
              <View className="w-8 h-8 rounded-2xl bg-blue-500/20 items-center justify-center">
                <Ionicons name="people" size={14} color="#3b82f6" />
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>

        {folder.name === 'Wishlist' && previews.length > 0 ? (
          <View className="px-5">
            <GlassCard className="h-56 rounded-3xl overflow-hidden">
              <View className="absolute bottom-0 left-0 right-0 p-6" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                <Text className="text-white text-xl font-semibold mb-2">{previews[0].title}</Text>
                <View className="flex-row items-center gap-4">
                  {previews[0].score && (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="star" size={14} color="#fbbf24" />
                      <Text className="text-yellow-500 text-sm font-medium">{previews[0].score.toFixed(1)}</Text>
                    </View>
                  )}
                  {previews[0].year && <Text className="text-white/80 text-sm">{previews[0].year}</Text>}
                </View>
              </View>
            </GlassCard>
          </View>
        ) : folder.folderType === 'all' && previews.length > 0 ? (
          <View className="px-5">
            <View className="flex-row flex-wrap gap-3">
              {previews.slice(0, 6).map((anime) => (
                <View key={anime.id} className="w-[31%]">
                  <View className="aspect-[2/3] bg-white/10 rounded-3xl mb-2" />
                  <Text className="text-white text-xs mb-1.5" numberOfLines={1}>
                    {anime.title}
                  </Text>
                  {anime.score && (
                    <View className="flex-row items-center gap-1">
                      <Text className="text-yellow-500 text-xs">⭐</Text>
                      <Text className="text-white/80 text-xs">{anime.score.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        ) : previews.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5">
            <View className="flex-row gap-4">
              {previews.map((anime) => (
                <View key={anime.id} className="w-28">
                  <View className="aspect-[2/3] bg-white/10 rounded-3xl mb-2" />
                  <Text className="text-white text-xs" numberOfLines={1}>
                    {anime.title}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Pressable className="px-5">
            <GlassCard className="h-32 rounded-3xl items-center justify-center flex-row gap-3">
              <View className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
                <Ionicons name={folder.icon as any} size={24} color="rgba(255,255,255,0.3)" />
              </View>
              <Text className="text-white/30 text-base">No items</Text>
            </GlassCard>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark">
      <View className="px-5 pt-5">
        {headerView}
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredFolders.length === 0 ? (
          <View className="py-12 items-center">
            <Text className="text-white/60 text-base">No items in {selectedCategory}</Text>
          </View>
        ) : (
          filteredFolders.map((folder) => renderFolderSection(folder))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

