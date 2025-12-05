import { View, Text, ScrollView, Pressable } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';

interface CollectionHeaderProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: { [key: string]: number };
}

export function CollectionHeader({ categories, selectedCategory, onSelectCategory, categoryCounts }: CollectionHeaderProps) {
  return (
    <GlassCard className="p-6 mb-6 rounded-[32px]" variant="dark" intensity={50}>
      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center shadow-lg">
              <Ionicons name="library" size={24} color="#fff" />
            </View>
            <Text className="text-white text-3xl font-bold tracking-tight">Collector</Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center active:bg-white/10">
              <Ionicons name="search" size={22} color="#fff" />
            </Pressable>
            <Pressable className="w-12 h-12 rounded-full bg-white/5 border border-white/10 items-center justify-center active:bg-white/10">
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {categories.map((category) => {
              const count = categoryCounts[category] || 0;
              const isSelected = selectedCategory === category;
              return (
                <Pressable
                  key={category}
                  onPress={() => onSelectCategory(category)}
                  className={`px-6 py-3 rounded-full border ${isSelected ? 'bg-white border-white' : 'bg-white/5 border-white/10'}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className={`text-sm font-bold tracking-wide ${isSelected ? 'text-black' : 'text-white'}`}>
                      {category}
                    </Text>
                    {count > 0 && (
                      <View className={`px-2 py-0.5 rounded-full ${isSelected ? 'bg-black/10' : 'bg-white/10'}`}>
                        <Text className={`text-[10px] font-bold ${isSelected ? 'text-black/60' : 'text-white/60'}`}>
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
}
