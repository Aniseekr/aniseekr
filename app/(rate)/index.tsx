import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View, Platform, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { GenreCarousel } from "../../components/rate/GenreCarousel";
import { SimpleAnimeCard } from "../../components/rate/SimpleAnimeCard";
import { TrendCard } from "../../components/rate/TrendCard";
import { AIRecommendationSheet } from "../../components/rate/AIRecommendationSheet";
import { useRateData } from "../../components/rate/useRateData";
import { Genre, Anime, ViewMode } from "../../components/rate/types";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrowseSourceChip } from "../../components/common/BrowseSourceChip";

export default function HomeRateScreen() {
  const { top } = useSafeAreaInsets();
  const { state, actions } = useRateData();
  const router = useRouter();
  const [showAI, setShowAI] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);

  const handleGenreSelect = useCallback((genre: Genre) => {
    router.push({
      pathname: "/(rate)/rating",
      params: { genreId: genre.id, genreName: genre.displayName },
    });
  }, [router]);

  const handleAnimeSelect = useCallback((anime: Anime) => {
    router.push({
      pathname: `/(rate)/anime/${anime.id}`,
    });
  }, [router]);

  const handlePullAI = useCallback(async () => {
    setShowAI(true);
    await actions.loadAIRecommendation();
  }, [actions]);

  // Handle refresh based on current view mode
  const onRefresh = useCallback(() => {
    if (state.viewMode === 'discovery') actions.loadGenres();
    if (state.viewMode === 'tracking') {
        actions.loadSeasonal();
        actions.loadRecommendations();
    }
    if (state.viewMode === 'trend') actions.loadTrend();
  }, [actions, state.viewMode]);

  const darkBg = Platform.OS === 'ios' ? "#000000" : "#121212";

  // Tab Header Rendering
  const renderTab = (mode: ViewMode) => {
    const isActive = state.viewMode === mode;
    return (
      <Pressable
        key={mode}
        onPress={() => actions.setViewMode(mode)}
        style={[
          styles.tabButton,
          // Explicit background colors for safety
          { backgroundColor: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.1)' },
          Platform.OS === 'ios' && styles.tabButtonIOS,
        ]}
      >
        <Text
          style={[
            styles.tabButtonText,
            isActive && styles.tabButtonTextActive,
            // Explicit text colors for safety
            { color: isActive ? '#000000' : '#CCCCCC' }
          ]}
        >
          {mode === "discovery" ? "Discovery" : mode === "tracking" ? "Tracking" : "Trend"}
        </Text>
      </Pressable>
    );
  };
  
  const headerBlock = (
    <View style={{ marginBottom: 20 }}>
      {/* Top Icons Row */}
      <View style={styles.headerRow}>
          <View>
              <Text style={styles.appTitle}>AniSeekr</Text>
              <Text style={styles.appSubtitle}>
                {state.viewMode === 'discovery' ? 'Explore Genres' : 
                 state.viewMode === 'tracking' ? 'My Feed' : 'Top Charts'}
              </Text>
          </View>
          <View style={styles.headerIcons}>
            <Pressable onPress={handlePullAI} style={styles.iconButton}>
              <MaterialIcons name="auto-awesome" size={24} color="#fbbf24" />
            </Pressable>
            <Pressable onPress={() => setShowDisplaySettings(true)} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
      </View>

      {/* Browse source chip */}
      <View style={styles.sourceChipRow}>
          <BrowseSourceChip />
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
          {["discovery", "tracking", "trend"].map((m) => renderTab(m as ViewMode))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ paddingTop: top, backgroundColor: darkBg }} className="flex-1">
      <Modal 
        visible={showDisplaySettings} 
        transparent 
        animationType={Platform.OS === 'ios' ? 'slide' : 'fade'} 
        onRequestClose={() => setShowDisplaySettings(false)}
      >
        <Pressable className="flex-1 bg-black/60" onPress={() => setShowDisplaySettings(false)}>
          <View style={styles.modalContent} className="mt-auto bg-card-surface border-t border-card-border rounded-t-3xl p-5">
            <Text style={styles.modalTitle} className="text-white text-lg font-semibold mb-2">Display Settings</Text>
            <Text style={styles.modalText} className="text-white/70 text-sm">
               Customize your feed layout and content filtering here.
            </Text>
          </View>
        </Pressable>
      </Modal>

      <AIRecommendationSheet
        visible={showAI}
        data={state.aiRecommendation}
        onClose={() => setShowAI(false)}
        onSelect={() => setShowAI(false)}
      />

      {/* Main Content Area */}
      {state.viewMode === "trend" ? (
        <FlatList
          data={state.trendAnime}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
             <View style={{ paddingHorizontal: 16 }}>
                 <TrendCard anime={item} rank={index + 1} onPress={() => handleAnimeSelect(item)} />
             </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 120 }}
          ListHeaderComponent={headerBlock}
          refreshControl={<RefreshControl tintColor="#fff" refreshing={false} onRefresh={onRefresh} />}
          ListEmptyComponent={
             <View style={{ padding: 20, alignItems: 'center' }}>
                 <Text style={{ color: 'white' }}>Loading Trends...</Text>
             </View>
          }
        />
      ) : (
        <ScrollView
            className="flex-1"
            style={{ backgroundColor: darkBg }}
            contentContainerStyle={{ paddingVertical: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl tintColor={Platform.OS === 'ios' ? "#fff" : "#6200EE"} refreshing={false} onRefresh={onRefresh} />}
        >
            {headerBlock}

            {state.viewMode === "discovery" && (
                <View style={{ minHeight: 450 }}>
                     <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Browse by Genre</Text>
                     </View>
                     <GenreCarousel data={state.availableGenres} onSelect={handleGenreSelect} />
                </View>
            )}

            {state.viewMode === "tracking" && (
                <View style={{ gap: 24, paddingBottom: 20 }}>
                    {/* 1. Latest Season */}
                    <View>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Latest Season</Text>
                            <Pressable onPress={() => actions.loadSeasonal()}><Text style={styles.seeAllText}>Refresh</Text></Pressable>
                        </View>
                        <FlatList
                            horizontal
                            data={state.seasonalAnime}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <SimpleAnimeCard anime={item} onPress={() => handleAnimeSelect(item)} />
                            )}
                            contentContainerStyle={{ paddingHorizontal: 16 }}
                            showsHorizontalScrollIndicator={false}
                            style={styles.horizontalList}
                            ListEmptyComponent={
                                <View style={{ padding: 20 }}>
                                    <Text style={{ color: 'white' }}>Loading Season...</Text>
                                </View>
                            }
                        />
                    </View>

                    {/* 2. For You */}
                    <View>
                        <View style={styles.sectionHeader}>
                             <Text style={styles.sectionTitle}>For You</Text>
                             <Pressable onPress={() => actions.loadRecommendations()}>
                                 <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.5)" />
                             </Pressable>
                        </View>
                        <FlatList
                             horizontal
                             data={state.recommendations.map(r => r.anime)}
                             keyExtractor={(item) => `rec-${item.id}`}
                             renderItem={({ item }) => (
                                 <SimpleAnimeCard anime={item} onPress={() => handleAnimeSelect(item)} />
                             )}
                             contentContainerStyle={{ paddingHorizontal: 16 }}
                             showsHorizontalScrollIndicator={false}
                             style={styles.horizontalList}
                             ListEmptyComponent={
                                 <View style={{ width: 300, paddingLeft: 16 }}>
                                      <Text style={{ color: 'rgba(255,255,255,0.4)' }}>
                                          Interact with anime to get recommendations.
                                      </Text>
                                 </View>
                             }
                        />
                    </View>
                </View>
            )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 20,
  },
  appTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: '#fff',
      letterSpacing: -1,
  },
  appSubtitle: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.6)',
      fontWeight: '500',
  },
  headerIcons: {
      flexDirection: 'row',
      gap: 12,
  },
  sourceChipRow: {
      paddingHorizontal: 16,
      marginBottom: 12,
      flexDirection: 'row',
      justifyContent: 'flex-start',
  },
  iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
  },
  tabButton: {
      flex: 1, // Fill available width
      minHeight: 48, // Taller button
      borderRadius: 99, // Big rounded corners
      justifyContent: 'center', // Center vertically
      alignItems: 'center', // Center horizontally
      overflow: 'hidden',
  },
  tabButtonActive: {
      // styles for active tab
  },
  tabButtonIOS: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
  },
  tabButtonText: {
      fontFamily: Platform.select({ ios: 'System', android: 'Roboto' }),
      fontSize: 14,
  },
  tabButtonTextActive: {
      fontWeight: '600',
  },
  sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 12,
      marginTop: 8,
  },
  sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
  },
  seeAllText: {
      fontSize: 14,
      color: '#fbbf24', // Amber/Gold
      fontWeight: '600',
  },
  horizontalList: {
      marginBottom: 12,
  },
  modalContent: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalTitle: {
    fontFamily: Platform.select({ ios: 'System', android: 'Roboto' }),
    fontWeight: '600',
  },
  modalText: {
    fontFamily: Platform.select({ ios: 'System', android: 'Roboto' }),
  },
});
