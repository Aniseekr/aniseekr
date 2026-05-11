import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface CollectionHeaderProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: { [key: string]: number };
  categoryIcons?: Record<string, string>;
  onAddFolder?: () => void;
  onPressSearch?: () => void;
}

export function CollectionHeader({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  categoryIcons: _categoryIcons,
  onAddFolder,
  onPressSearch,
}: CollectionHeaderProps) {
  const handleSearchPress = () => {
    hapticsBridge.tap();
    onPressSearch?.();
  };

  const handleAddPress = () => {
    hapticsBridge.tap();
    onAddFolder?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Collection</Text>
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionButton}
            onPress={handleSearchPress}
            accessibilityRole="button"
            accessibilityLabel="Search collection">
            <MaterialIcons name="search" size={18} color={Colors.primary} />
          </Pressable>
          <Pressable
            style={styles.actionButtonPrimary}
            onPress={handleAddPress}
            accessibilityRole="button"
            accessibilityLabel="Add folder">
            <MaterialIcons name="create-new-folder" size={18} color="#0A0A0A" />
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}>
        {categories.map((category) => {
          const count = categoryCounts[category] || 0;
          const isSelected = selectedCategory === category;
          return (
            <Pressable
              key={category}
              onPress={() => onSelectCategory(category)}
              style={[styles.categoryButton, isSelected && styles.categoryButtonActive]}>
              <View style={styles.categoryContent}>
                <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                  {category}
                </Text>
                {count > 0 && !isSelected && (
                  <Text style={styles.countText}>{count}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoriesContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  categoryButtonActive: {
    backgroundColor: Colors.text.primary,
    borderColor: Colors.text.primary,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    fontWeight: '500',
    letterSpacing: 0,
  },
  categoryTextActive: {
    color: '#0A0A0A',
    fontWeight: '700',
  },
  countText: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '600',
  },
});
