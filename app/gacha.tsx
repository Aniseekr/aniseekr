import { ScrollView, Text, View, RefreshControl, Pressable, Modal, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { GlassCard } from '../components/common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PULL_COST = 100;
const CARDS_PER_PULL = 5;

export default function GachaScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [coinBalance, setCoinBalance] = useState(500);
  const [isOpeningPack, setIsOpeningPack] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [showDropRates, setShowDropRates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showCardManagement, setShowCardManagement] = useState(false);
  const [showReconstruction, setShowReconstruction] = useState(false);
  const [selectedPackIndex, setSelectedPackIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [pulledCards, setPulledCards] = useState<any[]>([]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const canAffordPull = coinBalance >= PULL_COST;

  const handlePull = useCallback(async () => {
    if (!canAffordPull) return;
    
    setIsOpeningPack(true);
    setIsPulling(true);
    
    // Simulate pack opening
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    setCoinBalance((prev) => prev - PULL_COST);
    setPulledCards(Array.from({ length: CARDS_PER_PULL }, (_, i) => ({ id: i, rarity: 'R' })));
    setShowResult(true);
    setIsPulling(false);
  }, [canAffordPull]);

  const handleDismissResult = useCallback(() => {
    setShowResult(false);
    setIsOpeningPack(false);
  }, []);

  const headerSection = (
    <View className="flex-row items-center justify-between mb-6">
      <View>
        <Text className="text-white/70 text-xs font-bold tracking-wider mb-2">SIGNAL SCANNER</Text>
        <GlassCard className="px-5 py-3">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-3xl bg-yellow-500/20 items-center justify-center">
              <FontAwesome5 name="coins" size={20} color="#fbbf24" />
            </View>
            <Text className="text-white text-xl font-bold">{coinBalance}</Text>
            <Pressable className="px-4 py-2 bg-yellow-500 rounded-3xl">
              <Text className="text-black text-sm font-bold">+100</Text>
            </Pressable>
          </View>
        </GlassCard>
      </View>
      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => setShowDropRates(true)} className="w-12 h-12 rounded-3xl bg-white/10 items-center justify-center">
          <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <Pressable onPress={() => setShowReconstruction(true)} className="w-12 h-12 rounded-3xl bg-cyan-500/20 items-center justify-center">
          <MaterialIcons name="auto-awesome" size={20} color="#06b6d4" />
        </Pressable>
      </View>
    </View>
  );

  const packCarousel = (
    <View className="flex-1 items-center justify-center">
      <GlassCard className="w-[320px] h-[480px] items-center justify-center p-8">
        <View className="w-24 h-24 rounded-3xl bg-white/10 items-center justify-center mb-6">
          <FontAwesome5 name="box" size={48} color="#fff" />
        </View>
        <Text className="text-white text-2xl font-bold mb-3 text-center">Standard Signal Pack</Text>
        <Text className="text-white/60 text-base mb-8 text-center">Contains {CARDS_PER_PULL} Signals</Text>
        <Pressable
          onPress={handlePull}
          disabled={!canAffordPull || isPulling}
          className={`w-full px-8 py-5 rounded-3xl ${canAffordPull ? 'bg-white' : 'bg-white/30'}`}
        >
          {isPulling ? (
            <Text className="text-black text-lg font-bold text-center">Opening...</Text>
          ) : (
            <View className="items-center">
              <Text className="text-black text-lg font-bold">SCAN NOW</Text>
              <Text className="text-black/70 text-sm">({PULL_COST} coins)</Text>
            </View>
          )}
        </Pressable>
      </GlassCard>
    </View>
  );

  const bottomControls = (
    <GlassCard className="py-6 px-8">
      <View className="flex-row justify-around items-center">
        <Pressable onPress={() => setShowHistory(true)} className="items-center flex-1">
          <View className="w-14 h-14 rounded-3xl bg-white/10 items-center justify-center mb-2">
            <Ionicons name="time-outline" size={24} color="rgba(255,255,255,0.8)" />
          </View>
          <Text className="text-white/80 text-xs font-medium">History</Text>
        </Pressable>
        <Pressable onPress={() => setShowCardManagement(true)} className="items-center flex-1">
          <View className="w-14 h-14 rounded-3xl bg-white/10 items-center justify-center mb-2">
            <MaterialIcons name="collections" size={24} color="rgba(255,255,255,0.8)" />
          </View>
          <Text className="text-white/80 text-xs font-medium">Collection</Text>
        </Pressable>
        <Pressable onPress={() => setShowRanking(true)} className="items-center flex-1">
          <View className="w-14 h-14 rounded-3xl bg-white/10 items-center justify-center mb-2">
            <Ionicons name="stats-chart" size={24} color="rgba(255,255,255,0.8)" />
          </View>
          <Text className="text-white/80 text-xs font-medium">Ranking</Text>
        </Pressable>
      </View>
    </GlassCard>
  );

  const cardPackOpeningView = (
    <Modal visible={showResult} transparent animationType="fade" onRequestClose={handleDismissResult}>
      <View className="flex-1 bg-black/80 items-center justify-center">
        <GlassCard className="p-8 m-5 max-w-md">
          <Text className="text-white text-3xl font-bold mb-6 text-center">Cards Opened!</Text>
          <View className="flex-row flex-wrap justify-center gap-4 mb-6">
            {pulledCards.map((card, idx) => (
              <View key={idx} className="w-24 h-32 bg-white/10 rounded-3xl items-center justify-center">
                <Text className="text-white text-sm font-medium">Card {idx + 1}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={handleDismissResult} className="bg-white rounded-3xl py-4 px-8">
            <Text className="text-black font-semibold text-center text-lg">Close</Text>
          </Pressable>
        </GlassCard>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark">
      <View className="px-5 pt-5">
        {headerSection}
      </View>

      {!isOpeningPack && (
        <>
          <View className="flex-1">{packCarousel}</View>
          <View className="px-5 pb-6">{bottomControls}</View>
        </>
      )}

      {cardPackOpeningView}

      <Modal visible={showDropRates} transparent animationType="fade" onRequestClose={() => setShowDropRates(false)}>
        <Pressable className="flex-1 bg-black/60 items-center justify-center" onPress={() => setShowDropRates(false)}>
          <GlassCard className="p-8 m-5">
            <Text className="text-white text-2xl font-bold mb-6">Drop Rates</Text>
            <View className="gap-3 mb-6">
              <View className="flex-row items-center justify-between px-4 py-3 bg-white/5 rounded-3xl">
                <Text className="text-white text-lg">SSR</Text>
                <Text className="text-white text-lg font-semibold">3%</Text>
              </View>
              <View className="flex-row items-center justify-between px-4 py-3 bg-white/5 rounded-3xl">
                <Text className="text-white text-lg">SR</Text>
                <Text className="text-white text-lg font-semibold">12%</Text>
              </View>
              <View className="flex-row items-center justify-between px-4 py-3 bg-white/5 rounded-3xl">
                <Text className="text-white text-lg">R</Text>
                <Text className="text-white text-lg font-semibold">35%</Text>
              </View>
              <View className="flex-row items-center justify-between px-4 py-3 bg-white/5 rounded-3xl">
                <Text className="text-white text-lg">N</Text>
                <Text className="text-white text-lg font-semibold">50%</Text>
              </View>
            </View>
            <Pressable onPress={() => setShowDropRates(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">OK</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Modal>

      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
        <Pressable className="flex-1 bg-black/60 items-center justify-center" onPress={() => setShowHistory(false)}>
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Gacha History</Text>
            <Text className="text-white/70 mb-6 text-base">Your pull history will appear here.</Text>
            <Pressable onPress={() => setShowHistory(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Modal>

      <Modal
        visible={showRanking}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRanking(false)}
      >
        <Pressable className="flex-1 bg-black/60 items-center justify-center" onPress={() => setShowRanking(false)}>
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Ranking</Text>
            <Text className="text-white/70 mb-6 text-base">Card collection rankings will appear here.</Text>
            <Pressable onPress={() => setShowRanking(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Modal>

      <Modal
        visible={showCardManagement}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCardManagement(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 items-center justify-center"
          onPress={() => setShowCardManagement(false)}
        >
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Card Collection</Text>
            <Text className="text-white/70 mb-6 text-base">Manage your collected cards here.</Text>
            <Pressable onPress={() => setShowCardManagement(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Modal>

      <Modal
        visible={showReconstruction}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReconstruction(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 items-center justify-center"
          onPress={() => setShowReconstruction(false)}
        >
          <GlassCard className="p-8 m-5 max-w-md">
            <Text className="text-white text-2xl font-bold mb-5">Reconstruction Store</Text>
            <Text className="text-white/70 mb-6 text-base">Reconstruct cards and manage materials here.</Text>
            <Pressable onPress={() => setShowReconstruction(false)} className="bg-white rounded-3xl py-4">
              <Text className="text-black font-semibold text-center text-lg">Close</Text>
            </Pressable>
          </GlassCard>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

