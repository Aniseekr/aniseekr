import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useAnimeDisplayTitle } from '../../libs/i18n/use-display-title';
import { ThemedText, ON_DARK } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { listItemEnter } from '../../libs/animations/presets';

export interface CollectionAnimeCardItem {
  id: string;
  title: string;
  imageUrl: string | null;
  progress: number;
  totalEpisodes: number | null;
  status: string;
}

interface CollectionAnimeGridProps {
  items: CollectionAnimeCardItem[];
  onPressItem?: (item: CollectionAnimeCardItem) => void;
  onLongPressItem?: (item: CollectionAnimeCardItem) => void;
}

function CollectionAnimeGridComponent({
  items,
  onPressItem,
  onLongPressItem,
}: CollectionAnimeGridProps) {
  const { theme } = useTheme();

  // Bucket into rows of two so the grid always renders a clean 2-up layout
  // without relying on FlatList's numColumns (we keep the page in one ScrollView).
  const rows: CollectionAnimeCardItem[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((item, colIndex) => {
            const entryIndex = rowIndex * 2 + colIndex;
            const card = (
              <AnimeGridCard
                item={item}
                theme={theme}
                onPressItem={onPressItem}
                onLongPressItem={onLongPressItem}
              />
            );
            return entryIndex < 8 ? (
              <Animated.View
                key={item.id}
                entering={listItemEnter(entryIndex)}
                style={styles.cardSlot}>
                {card}
              </Animated.View>
            ) : (
              <View key={item.id} style={styles.cardSlot}>
                {card}
              </View>
            );
          })}
          {row.length === 1 ? <View style={styles.cardSpacer} /> : null}
        </View>
      ))}
    </View>
  );
}

function AnimeGridCard({
  item,
  theme,
  onPressItem,
  onLongPressItem,
}: {
  item: CollectionAnimeCardItem;
  theme: ReturnType<typeof useTheme>['theme'];
  onPressItem?: (item: CollectionAnimeCardItem) => void;
  onLongPressItem?: (item: CollectionAnimeCardItem) => void;
}) {
  const displayTitle = useAnimeDisplayTitle({ id: item.id, title: item.title });
  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPressItem?.(item);
      }}
      onLongPress={
        onLongPressItem
          ? () => {
              hapticsBridge.longPress();
              onLongPressItem(item);
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.gradient}
        pointerEvents="none"
      />
      <View style={styles.textBlock}>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={2} style={styles.title}>
          {displayTitle}
        </ThemedText>
        <ThemedText variant="captionSmall" style={styles.episodes} numberOfLines={1}>
          Ep {item.progress} / {item.totalEpisodes ?? '?'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
  },
  card: {
    flex: 1,
    height: 200,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.md,
    justifyContent: 'flex-end',
  },
  cardSlot: {
    flex: 1,
  },
  cardSpacer: {
    flex: 1,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  textBlock: {
    gap: 4,
  },
  title: {
    ...Typography.bodySmall,
    color: ON_DARK,
  },
  episodes: {
    ...Typography.captionSmall,
    color: ON_DARK,
    opacity: 0.7,
  },
});

export const CollectionAnimeGrid = memo(CollectionAnimeGridComponent);
