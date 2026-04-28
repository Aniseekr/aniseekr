import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { CollectionStats } from '../components/profile/CollectionStats';
import { QuickActions } from '../components/profile/QuickActions';
import { PlatformSwitcher } from '../components/profile/PlatformSwitcher';
import { UserRepository, UserProfile } from '../libs/repositories/user-repository';
import { router } from 'expo-router';
import { gachaService } from '../libs/services/gacha-service';
import {
  Colors,
  FontFamily,
  Spacing,
  Typography,
} from '../constants/DesignSystem';

export default function ProfileScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cardsCount, setCardsCount] = useState(0);
  const [coins, setCoins] = useState(0);
  const [shards, setShards] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<string | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      const data = await UserRepository.getProfile();
      setUser(data);

      try {
        const cards = await gachaService.getUserCards();
        const userCoins = await gachaService.getCoins();
        const userShards = await gachaService.getShards();
        setCardsCount(cards.length);
        setCoins(userCoins);
        setShards(userShards);
      } catch (e) {
        console.error('Error loading gacha data:', e);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const defaultStats = {
    totalRated: 0,
    likedCount: 0,
    cardsCount: cardsCount,
    foldersCount: 0,
  };

  const stats = user
    ? {
        ...user.stats,
        cardsCount: cardsCount || user.stats.cardsCount,
      }
    : defaultStats;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOrange} pointerEvents="none" />
      <View style={styles.glowPurple} pointerEvents="none" />
      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Profile</Text>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              tintColor={Colors.text.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              progressBackgroundColor={Colors.background.secondary}
            />
          }>
          <ProfileHeader
            username={user ? user.username : 'Loading...'}
            profileImageURL={user ? user.avatarUrl : ''}
            isDonator={user ? user.isDonator : false}
            coins={coins}
            shards={shards}
          />

          <PlatformSwitcher
            selected={selectedPlatform}
            onSelect={setSelectedPlatform}
          />

          <CollectionStats stats={stats} />

          <QuickActions
            actions={{
              onPremium: () => {},
              onSync: () => router.push('/(setting)/sync'),
              onSettings: () => router.push('/(setting)/settings'),
              onBackup: () => alert('Backup feature coming soon!'),
              onDNA: () => {},
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  glowOrange: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: `${Colors.primary}33`,
    opacity: 0.55,
  },
  glowPurple: {
    position: 'absolute',
    top: 160,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: `${Colors.secondary}33`,
    opacity: 0.4,
  },
  safeArea: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: Spacing.sm,
  },
  screenTitle: {
    ...Typography.headlineLarge,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
});
