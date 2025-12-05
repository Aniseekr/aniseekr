import { View, Dimensions, Modal, Text, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { GlassCard } from '../components/common/GlassCard';
import { GachaHeader } from '../components/gacha/GachaHeader';
import { PackCarousel } from '../components/gacha/PackCarousel';
import { GachaControls } from '../components/gacha/GachaControls';
import { LinearGradient } from 'expo-linear-gradient';

const PULL_COST = 100;
const CARDS_PER_PULL = 5;

export default function GachaScreen() {
  const { top } = useSafeAreaInsets();
  const [coinBalance, setCoinBalance] = useState(500);
  const [isOpeningPack, setIsOpeningPack] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pulledCards, setPulledCards] = useState<any[]>([]);
  const [showResult, setShowResult] = useState(false);
  
  // Modal states
  const [showDropRates, setShowDropRates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showCardManagement, setShowCardManagement] = useState(false);
  const [showReconstruction, setShowReconstruction] = useState(false);

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

  return (
    <View className="flex-1 bg-bg-dark">
      <LinearGradient
        colors={['#1a1b2e', '#13131f', '#0f0f16']}
        className="absolute inset-0"
      />
      
      {/* Background decoration */}
      <View className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4" />
      <View className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4" />

      <SafeAreaView style={{ paddingTop: top }} className="flex-1">
        <View className="px-3 pt-2">
            <GachaHeader 
                coinBalance={coinBalance} 
                onShowDropRates={() => setShowDropRates(true)} 
                onShowReconstruction={() => setShowReconstruction(true)} 
            />
        </View>

        {!isOpeningPack && (
          <>
            <View className="flex-1">
                <PackCarousel 
                    onPull={handlePull}
                    canAfford={canAffordPull}
                    isPulling={isPulling}
                    pullCost={PULL_COST}
                    cardsPerPull={CARDS_PER_PULL}
                />
            </View>
            <View className="px-5 pb-8 pt-2">
                <GachaControls 
                    onShowHistory={() => setShowHistory(true)}
                    onShowCollection={() => setShowCardManagement(true)}
                    onShowRanking={() => setShowRanking(true)}
                />
            </View>
          </>
        )}

        <Modal visible={showResult} transparent animationType="fade" onRequestClose={handleDismissResult}>
            <View className="flex-1 bg-black/90 items-center justify-center">
                <GlassCard className="p-8 m-5 w-[90%] max-w-[400px]" variant="dark">
                <Text className="text-white text-3xl font-bold mb-8 text-center tracking-tight">System Scan Complete</Text>
                <View className="flex-row flex-wrap justify-center gap-4 mb-8">
                    {pulledCards.map((card, idx) => (
                    <View key={idx} className="w-24 h-32 bg-white/5 border border-white/10 rounded-2xl items-center justify-center">
                        <Text className="text-white/40 text-sm font-medium tracking-widest">SIGNAL {idx + 1}</Text>
                    </View>
                    ))}
                </View>
                <Pressable onPress={handleDismissResult} className="bg-white rounded-full py-4 px-8 self-center w-full">
                    <Text className="text-black font-bold text-center text-lg tracking-wider">CONFIRM</Text>
                </Pressable>
                </GlassCard>
            </View>
        </Modal>

        {/* Placeholder Modals using same style */}
        {[
            { visible: showDropRates, close: () => setShowDropRates(false), title: "Drop Rates", content: "SSR: 3% | SR: 12% | R: 35% | N: 50%" },
            { visible: showHistory, close: () => setShowHistory(false), title: "History", content: "Recent signal scans will appear here." },
            { visible: showRanking, close: () => setShowRanking(false), title: "Ranking", content: "Top data collectors." },
            { visible: showCardManagement, close: () => setShowCardManagement(false), title: "Collection", content: "Manage your signals." },
            { visible: showReconstruction, close: () => setShowReconstruction(false), title: "Reconstruction", content: "Reconstruct data fragments." },
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
