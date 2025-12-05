import { ScrollView, Text, View, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { GlassCard } from '../components/common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface StatCardProps {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap | keyof typeof MaterialIcons.glyphMap | keyof typeof FontAwesome5.glyphMap;
  iconSet: 'Ionicons' | 'MaterialIcons' | 'FontAwesome5';
  color: string;
}

function AccountStatCard({ title, value, icon, iconSet, color }: StatCardProps) {
  const IconComponent = iconSet === 'Ionicons' ? Ionicons : iconSet === 'MaterialIcons' ? MaterialIcons : FontAwesome5;
  return (
    <GlassCard className="w-[130px] h-[160px] items-center justify-center p-6">
      <View className="w-16 h-16 rounded-3xl items-center justify-center mb-4" style={{ backgroundColor: `${color}26` }}>
        <IconComponent name={icon as any} size={32} color={color} />
      </View>
      <Text className="text-white text-2xl font-bold mb-2">{value}</Text>
      <Text className="text-gray-400 text-sm">{title}</Text>
    </GlassCard>
  );
}

interface QuickActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap | keyof typeof MaterialIcons.glyphMap | keyof typeof FontAwesome5.glyphMap;
  iconSet: 'Ionicons' | 'MaterialIcons' | 'FontAwesome5';
  title: string;
  color: string;
  onPress: () => void;
}

function QuickActionButton({ icon, iconSet, title, color, onPress }: QuickActionButtonProps) {
  const IconComponent = iconSet === 'Ionicons' ? Ionicons : iconSet === 'MaterialIcons' ? MaterialIcons : FontAwesome5;
  return (
    <Pressable onPress={onPress} className="items-center flex-1">
      <View className="w-16 h-16 rounded-3xl items-center justify-center mb-3" style={{ backgroundColor: `${color}26` }}>
        <IconComponent name={icon as any} size={32} color={color} />
      </View>
      <Text className="text-gray-400 text-sm font-medium">{title}</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOtakuDNA, setShowOtakuDNA] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);

  const username = 'User';
  const profileImageURL = '';
  const isDonator = false;
  const totalRated = 42;
  const likedCount = 18;
  const cardsCount = 156;
  const foldersCount = 8;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const profileHeaderSection = (
    <GlassCard className="p-8 mx-5 mt-5 mb-6">
      <View className="items-center py-8">
        <View className="w-[140px] h-[140px] rounded-3xl bg-white/10 border-2 border-white/20 items-center justify-center mb-6">
          {profileImageURL ? (
            <Image source={{ uri: profileImageURL }} className="w-full h-full rounded-3xl" />
          ) : (
            <Ionicons name="person" size={64} color="#9ca3af" />
          )}
        </View>
        <View className="flex-row items-center gap-3 mb-4">
          <Text className="text-white text-3xl font-bold">{username}</Text>
          {isDonator && (
            <View className="px-3 py-1.5 bg-yellow-500 rounded-3xl flex-row items-center gap-1.5">
              <FontAwesome5 name="crown" size={14} color="#000" />
              <Text className="text-black text-sm font-bold">VIP</Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-4 mt-2">
          <Pressable className="w-14 h-14 rounded-3xl bg-blue-500/30 items-center justify-center">
            <Ionicons name="logo-mal" size={20} color="#3b82f6" />
          </Pressable>
          <Pressable className="w-14 h-14 rounded-3xl bg-cyan-500/30 items-center justify-center">
            <Ionicons name="logo-anilist" size={20} color="#06b6d4" />
          </Pressable>
          <Pressable className="w-14 h-14 rounded-3xl bg-pink-500/30 items-center justify-center">
            <Ionicons name="logo-bangumi" size={20} color="#ec4899" />
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );

  const collectionDashboardSection = (
    <View className="mb-6">
      <Text className="text-white text-2xl font-bold mb-5 px-5">Collection Overview</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
        <AccountStatCard title="Rated" value={totalRated.toString()} icon="star" iconSet="Ionicons" color="#fbbf24" />
        <AccountStatCard title="Liked" value={likedCount.toString()} icon="heart" iconSet="Ionicons" color="#ef4444" />
        <AccountStatCard title="Cards" value={cardsCount.toString()} icon="cube" iconSet="Ionicons" color="#3b82f6" />
        <AccountStatCard title="Folders" value={foldersCount.toString()} icon="folder" iconSet="Ionicons" color="#10b981" />
      </ScrollView>
    </View>
  );

  const quickActionsSection = (
    <View className="mb-6">
      <Text className="text-white text-2xl font-bold mb-5 px-5">Quick Actions</Text>
      <GlassCard className="p-8 mx-5">
        <View className="flex-row justify-around">
          <QuickActionButton icon="diamond" iconSet="Ionicons" title="Premium" color="#fbbf24" onPress={() => setShowSubscription(true)} />
          <QuickActionButton icon="sync" iconSet="Ionicons" title="Sync" color="#3b82f6" onPress={() => setShowSync(true)} />
          <QuickActionButton icon="settings" iconSet="Ionicons" title="Settings" color="#6b7280" onPress={() => setShowSettings(true)} />
          <QuickActionButton icon="cloud-upload" iconSet="Ionicons" title="Backup" color="#06b6d4" onPress={() => setShowSyncSettings(true)} />
          <QuickActionButton icon="dna" iconSet="Ionicons" title="DNA" color="#a855f7" onPress={() => setShowOtakuDNA(true)} />
        </View>
      </GlassCard>
    </View>
  );

  return (
    <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {profileHeaderSection}
        {collectionDashboardSection}
        {quickActionsSection}
      </ScrollView>

      {/* Modals for various actions */}
      {showSettings && (
        <Pressable className="absolute inset-0 bg-black/60 items-center justify-center" onPress={() => setShowSettings(false)}>
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Settings</Text>
            <Text className="text-white/70 mb-6 text-base">App settings will appear here.</Text>
            <Pressable onPress={() => setShowSettings(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      )}

      {showSyncSettings && (
        <Pressable
          className="absolute inset-0 bg-black/60 items-center justify-center"
          onPress={() => setShowSyncSettings(false)}
        >
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Sync Settings</Text>
            <Text className="text-white/70 mb-6 text-base">Configure sync and backup settings here.</Text>
            <Pressable onPress={() => setShowSyncSettings(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      )}

      {showSync && (
        <Pressable className="absolute inset-0 bg-black/60 items-center justify-center" onPress={() => setShowSync(false)}>
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Sync</Text>
            <Text className="text-white/70 mb-6 text-base">Sync your data across devices.</Text>
            <Pressable onPress={() => setShowSync(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      )}

      {showProfile && (
        <Pressable className="absolute inset-0 bg-black/60 items-center justify-center" onPress={() => setShowProfile(false)}>
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Profile</Text>
            <Text className="text-white/70 mb-6 text-base">Edit your profile information.</Text>
            <Pressable onPress={() => setShowProfile(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      )}

      {showOtakuDNA && (
        <Pressable
          className="absolute inset-0 bg-black/60 items-center justify-center"
          onPress={() => setShowOtakuDNA(false)}
        >
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Otaku DNA</Text>
            <Text className="text-white/70 mb-6 text-base">View your anime preferences and DNA analysis.</Text>
            <Pressable onPress={() => setShowOtakuDNA(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      )}

      {showSubscription && (
        <Pressable
          className="absolute inset-0 bg-black/60 items-center justify-center"
          onPress={() => setShowSubscription(false)}
        >
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Premium</Text>
            <Text className="text-white/70 mb-6 text-base">Upgrade to premium for exclusive features.</Text>
            <Pressable onPress={() => setShowSubscription(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

