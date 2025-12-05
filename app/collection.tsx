import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { CollectionHeader } from '../components/collection/CollectionHeader';
import { FolderList, CollectionFolder, AnimePreview } from '../components/collection/FolderList';
import { LinearGradient } from 'expo-linear-gradient';

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Wishlist', 'Favorites', 'Watching', 'Completed', 'Dropped'];
  const categoryCounts = { 'All': 156, 'Wishlist': 42, 'Favorites': 12, 'Watching': 8, 'Completed': 85 };

  const folders: CollectionFolder[] = [
    { id: '1', name: 'Wishlist', icon: 'bookmark', isR18: false, isShared: false, isSystemFolder: true },
    { id: '2', name: 'Watching', icon: 'play-circle', isR18: false, isShared: false, isSystemFolder: true, folderType: 'all' },
    { id: '3', name: 'Favorites', icon: 'heart', isR18: false, isShared: true, isSystemFolder: true },
    { id: '4', name: 'Summer 2024', icon: 'folder', isR18: false, isShared: false, isSystemFolder: false },
    { id: '5', name: 'Sci-Fi Masterpieces', icon: 'rocket', isR18: false, isShared: true, isSystemFolder: false },
  ];

  // Mock data for previews
  const folderPreviews: { [key: string]: AnimePreview[] } = {
    '1': [{ id: 101, title: 'Frieren: Beyond Journey\'s End', score: 9.4, year: 2023, image: '...' }],
    '2': [
        { id: 201, title: 'Oshi no Ko', score: 8.9 },
        { id: 202, title: 'Jujutsu Kaisen', score: 8.7 },
        { id: 203, title: 'One Piece', score: 9.0 },
        { id: 204, title: 'Bleach', score: 8.5 },
        { id: 205, title: 'Naruto', score: 8.2 },
        { id: 206, title: 'Attack on Titan', score: 9.1 },
    ],
    '3': [
        { id: 301, title: 'Steins;Gate' },
        { id: 302, title: 'Fullmetal Alchemist' },
        { id: 303, title: 'Cowboy Bebop' },
    ],
    '4': [],
    '5': [{ id: 501, title: 'Neon Genesis Evangelion' }, { id: 502, title: 'Ghost in the Shell' }],
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View className="flex-1 bg-bg-dark">
      <LinearGradient
        colors={['#1a1b2e', '#13131f', '#0f0f16']}
        className="absolute inset-0"
      />
      <SafeAreaView style={{ paddingTop: top }} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100, paddingLeft: 20, paddingRight: 20 }}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View className="pt-2">
                <CollectionHeader 
                    categories={categories}
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    categoryCounts={categoryCounts}
                />
            </View>

            <FolderList 
                folders={folders}
                folderPreviews={folderPreviews}
            />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
