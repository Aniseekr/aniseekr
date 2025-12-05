import { View, ScrollView, RefreshControl, Text, Pressable, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { CollectionStats } from '../components/profile/CollectionStats';
import { QuickActions } from '../components/profile/QuickActions';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../components/common/GlassCard';

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

  return (
    <View className="flex-1 bg-bg-dark">
      <LinearGradient
        colors={['#1a1b2e', '#13131f', '#0f0f16']}
        className="absolute inset-0"
      />
      <SafeAreaView style={{ paddingTop: top }} className="flex-1">
        <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <ProfileHeader 
                username={username}
                profileImageURL={profileImageURL}
                isDonator={isDonator}
            />
            
            <CollectionStats 
                stats={{ totalRated, likedCount, cardsCount, foldersCount }}
            />

            <QuickActions 
                actions={{
                    onPremium: () => setShowSubscription(true),
                    onSync: () => setShowSync(true),
                    onSettings: () => setShowSettings(true),
                    onBackup: () => setShowSyncSettings(true),
                    onDNA: () => setShowOtakuDNA(true),
                }}
            />
        </ScrollView>

         {/* Reusing a generic Modal component or mapping would be DRYer, but keeping explicit for now */}
         {[
            { visible: showSettings, close: () => setShowSettings(false), title: "Settings", content: "App settings will appear here." },
            { visible: showSyncSettings, close: () => setShowSyncSettings(false), title: "Sync Settings", content: "Configure sync and backup settings here." },
            { visible: showSync, close: () => setShowSync(false), title: "Sync", content: "Sync your data across devices." },
            { visible: showProfile, close: () => setShowProfile(false), title: "Profile", content: "Edit your profile information." },
            { visible: showOtakuDNA, close: () => setShowOtakuDNA(false), title: "Otaku DNA", content: "View your anime preferences and DNA analysis." },
            { visible: showSubscription, close: () => setShowSubscription(false), title: "Premium", content: "Upgrade to premium for exclusive features." },
        ].map((modal, i) => (
            <Modal key={i} visible={modal.visible} transparent animationType="fade" onRequestClose={modal.close}>
                <Pressable className="flex-1 bg-black/80 items-center justify-center" onPress={modal.close}>
                    <GlassCard className="p-8 m-5 w-[85%] max-w-[360px]" variant="frosted">
                        <Text className="text-white text-2xl font-bold mb-4 tracking-tight">{modal.title}</Text>
                        <Text className="text-white/60 mb-8 text-base leading-6">{modal.content}</Text>
                        <Pressable onPress={modal.close} className="bg-white/10 border border-white/20 rounded-full py-3">
                            <Text className="text-white font-semibold text-center text-base">Close</Text>
                        </Pressable>
                    </GlassCard>
                </Pressable>
            </Modal>
        ))}

      </SafeAreaView>
    </View>
  );
}
