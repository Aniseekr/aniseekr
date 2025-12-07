import { View, Dimensions, Modal, Text, Pressable, Platform, StyleSheet, ScrollView, Animated, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useRef, useEffect } from 'react';
import { GlassCard } from '../components/common/GlassCard';
import { GachaHeader } from '../components/gacha/GachaHeader';
import { PackCarousel } from '../components/gacha/PackCarousel';
import { GachaControls } from '../components/gacha/GachaControls';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { gachaService, GachaCard, CardRarity, PULL_COST_CONST } from '../libs/services/gacha-service';
import { characterService } from '../libs/services/character-service';

const CARDS_PER_PULL = 5;
const PULL_COST = PULL_COST_CONST;

const RARITY_COLORS: Record<CardRarity, string> = {
  SSR: '#FFD700',
  SR: '#C0C0C0',
  R: '#CD7F32',
  N: '#808080',
};

const RARITY_PROBABILITIES: Record<CardRarity, number> = {
  SSR: 0.03,
  SR: 0.12,
  R: 0.35,
  N: 0.50,
};

export default function GachaScreen() {
  const { top } = useSafeAreaInsets();
  const [coinBalance, setCoinBalance] = useState(500);
  const [isOpeningPack, setIsOpeningPack] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pulledCards, setPulledCards] = useState<GachaCard[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [pullHistory, setPullHistory] = useState<GachaCard[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [showDropRates, setShowDropRates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showCardManagement, setShowCardManagement] = useState(false);
  const [showReconstruction, setShowReconstruction] = useState(false);

  const canAffordPull = coinBalance >= PULL_COST;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Initialize services and load user data
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsInitializing(true);
        // Initialize gacha pool
        await gachaService.initializePool();
        // Load user data
        const coins = await gachaService.getCoins();
        const history = await gachaService.getPullHistory();
        setCoinBalance(coins);
        setPullHistory(history);
      } catch (error) {
        console.error('Error initializing gacha:', error);
        setError('Failed to initialize gacha system');
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, []);

  // Load history when history modal opens
  useEffect(() => {
    if (showHistory) {
      const loadHistory = async () => {
        const history = await gachaService.getPullHistory();
        setPullHistory(history);
      };
      loadHistory();
    }
  }, [showHistory]);

  const handlePull = useCallback(async () => {
    if (!canAffordPull || isPulling) return;
    
    try {
      setIsOpeningPack(true);
      setIsPulling(true);
      setError(null);
      
      // Simulate pack opening animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      
      // Perform actual gacha pull
      const newCards = await gachaService.performMultiPull(CARDS_PER_PULL);
      
      // Update UI
      const updatedCoins = await gachaService.getCoins();
      setCoinBalance(updatedCoins);
      setPulledCards(newCards);
      setPullHistory((prev) => [...newCards, ...prev]);
      setShowResult(true);
      setIsPulling(false);
      
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } catch (error: any) {
      console.error('Error performing pull:', error);
      setError(error.message || 'Failed to perform pull');
      setIsPulling(false);
      setIsOpeningPack(false);
    }
  }, [canAffordPull, isPulling, fadeAnim]);

  const handleDismissResult = useCallback(() => {
    setShowResult(false);
    setIsOpeningPack(false);
    setPulledCards([]);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#121212', '#1E1E1E', '#121212']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Background decoration */}
      <View style={styles.backgroundBlur1} />
      <View style={styles.backgroundBlur2} />

      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <View style={styles.headerContainer}>
          <GachaHeader 
            coinBalance={coinBalance} 
            onShowDropRates={() => setShowDropRates(true)} 
            onShowReconstruction={() => setShowReconstruction(true)} 
          />
        </View>

        {isInitializing ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Initializing gacha system...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable 
              onPress={async () => {
                setError(null);
                setIsInitializing(true);
                try {
                  await gachaService.initializePool();
                  const coins = await gachaService.getCoins();
                  setCoinBalance(coins);
                } catch (e) {
                  setError('Failed to initialize');
                } finally {
                  setIsInitializing(false);
                }
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : !isOpeningPack && (
          <>
            <View style={styles.packContainer}>
              <PackCarousel 
                onPull={handlePull}
                canAfford={canAffordPull}
                isPulling={isPulling}
                pullCost={PULL_COST}
                cardsPerPull={CARDS_PER_PULL}
              />
            </View>
            <View style={styles.controlsContainer}>
              <GachaControls 
                onShowHistory={() => setShowHistory(true)}
                onShowCollection={() => setShowCardManagement(true)}
                onShowRanking={() => setShowRanking(true)}
              />
            </View>
          </>
        )}

        {/* Result Modal */}
        <Modal visible={showResult} transparent animationType="fade" onRequestClose={handleDismissResult}>
          <View style={styles.modalOverlay}>
            <View style={styles.resultModal}>
              <Text style={styles.resultTitle}>System Scan Complete</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardsContainer}
              >
                {pulledCards.map((card) => (
                  <View key={card.id} style={styles.cardWrapper}>
                    <View style={[styles.resultCard, { borderColor: RARITY_COLORS[card.rarity] }]}>
                      <LinearGradient
                        colors={[
                          `${RARITY_COLORS[card.rarity]}20`,
                          `${RARITY_COLORS[card.rarity]}05`,
                        ]}
                        style={styles.cardGradient}
                      />
                      <View style={[styles.rarityBadge, { backgroundColor: RARITY_COLORS[card.rarity] }]}>
                        <Text style={styles.rarityText}>{card.rarity}</Text>
                      </View>
                      {card.imageUrl ? (
                        <Image 
                          source={{ uri: card.imageUrl }} 
                          style={styles.cardImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.cardContent}>
                          <MaterialIcons name="signal-cellular-alt" size={32} color={RARITY_COLORS[card.rarity]} />
                        </View>
                      )}
                      <View style={styles.cardTitleContainer}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{card.characterName}</Text>
                        {card.isDuplicate && (
                          <View style={styles.duplicateBadge}>
                            <Text style={styles.duplicateText}>+{card.shardReward} Shards</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <Pressable onPress={handleDismissResult} style={styles.confirmButton}>
                <Text style={styles.confirmButtonText}>CONFIRM</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Drop Rates Modal */}
        <Modal visible={showDropRates} transparent animationType="fade" onRequestClose={() => setShowDropRates(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowDropRates(false)}>
            <View style={styles.infoModal}>
              <Text style={styles.modalTitle}>Drop Rates</Text>
              <View style={styles.ratesList}>
                {Object.entries(RARITY_PROBABILITIES).map(([rarity, prob]) => (
                  <View key={rarity} style={styles.rateItem}>
                    <View style={[styles.rateBadge, { backgroundColor: RARITY_COLORS[rarity as CardRarity] }]}>
                      <Text style={styles.rateBadgeText}>{rarity}</Text>
                    </View>
                    <Text style={styles.rateText}>{(prob * 100).toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={() => setShowDropRates(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* History Modal */}
        <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowHistory(false)}>
            <View style={styles.infoModal}>
              <Text style={styles.modalTitle}>Pull History</Text>
              <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyContent}>
                {pullHistory.length === 0 ? (
                  <Text style={styles.emptyText}>No history yet</Text>
                ) : (
                  <View style={styles.historyGrid}>
                    {pullHistory.slice(0, 20).map((card) => (
                      <View key={card.id} style={[styles.historyCard, { borderColor: RARITY_COLORS[card.rarity] }]}>
                        {card.imageUrl ? (
                          <Image 
                            source={{ uri: card.imageUrl }} 
                            style={styles.historyCardImage}
                            resizeMode="cover"
                          />
                        ) : null}
                        <View style={[styles.historyRarityBadge, { backgroundColor: RARITY_COLORS[card.rarity] }]}>
                          <Text style={styles.historyRarity}>{card.rarity}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
              <Pressable onPress={() => setShowHistory(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Other Modals */}
        {[
          { visible: showRanking, close: () => setShowRanking(false), title: "Ranking", content: "Top data collectors will appear here." },
          { visible: showCardManagement, close: () => setShowCardManagement(false), title: "Collection", content: "Manage your signal collection." },
          { visible: showReconstruction, close: () => setShowReconstruction(false), title: "Reconstruction", content: "Reconstruct data fragments into new signals." },
        ].map((modal, i) => (
          <Modal key={i} visible={modal.visible} transparent animationType="fade" onRequestClose={modal.close}>
            <Pressable style={styles.modalOverlay} onPress={modal.close}>
              <View style={styles.infoModal}>
                <Text style={styles.modalTitle}>{modal.title}</Text>
                <Text style={styles.modalContent}>{modal.content}</Text>
                <Pressable onPress={modal.close} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
        ))}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  safeArea: {
    flex: 1,
  },
  backgroundBlur1: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 500,
    height: 500,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 250,
    opacity: 0.5,
  },
  backgroundBlur2: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 400,
    height: 400,
    backgroundColor: 'rgba(147, 51, 234, 0.1)',
    borderRadius: 200,
    opacity: 0.5,
  },
  headerContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  packContainer: {
    flex: 1,
  },
  controlsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 8,
      },
    }),
  },
  resultTitle: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  cardsContainer: {
    paddingVertical: 8,
    gap: 12,
  },
  cardWrapper: {
    marginRight: 12,
  },
  resultCard: {
    width: 96,
    height: 128,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    ...Platform.select({
      android: {
        elevation: 4,
      },
    }),
  },
  cardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  rarityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rarityText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  cardTitleContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  cardTitle: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  duplicateBadge: {
    marginTop: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 4,
    alignSelf: 'center',
  },
  duplicateText: {
    color: '#FFD700',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  retryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  historyCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  historyRarityBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confirmButton: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 24,
    alignItems: 'center',
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  confirmButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  infoModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    width: '85%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 8,
      },
    }),
  },
  modalTitle: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  modalContent: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  ratesList: {
    gap: 12,
    marginBottom: 24,
  },
  rateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rateBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  rateText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  historyScroll: {
    maxHeight: 400,
    marginBottom: 24,
  },
  historyContent: {
    paddingVertical: 8,
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyCard: {
    width: 60,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyRarity: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 40,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
