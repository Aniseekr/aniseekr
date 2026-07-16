import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimeTitleText, ThemedText } from '../themed';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Anime } from '../rate/types';
import { pushAnimeDetail } from '../../libs/utils/navigate-to-anime';
import { IconSize, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';
import { formatReleaseDate } from '../../libs/utils/release-date';

interface SpecialContentSectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  anime: Anime[];
  onSeeAll?: () => void;
}

function SpecialContentSectionComponent({
  title,
  subtitle,
  icon = 'movie-creation',
  anime,
  onSeeAll,
}: SpecialContentSectionProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();

  if (!anime || anime.length === 0) return null;

  const handlePress = (item: Anime) => {
    hapticsBridge.tap();
    pushAnimeDetail(router, item);
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <MaterialIcons name={icon} size={20} color={theme.accent} />
          <View>
            <Text style={[styles.title, { color: theme.text.primary }]}>
              {title}
              <Text style={[styles.count, { color: theme.text.tertiary }]}>
                {'  '}
                {anime.length}
              </Text>
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.text.secondary }]}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              onSeeAll();
            }}
            hitSlop={8}>
            <Text style={[styles.seeAll, { color: theme.accent }]}>{t('commonUi.seeAll')}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {anime.map((item) => {
          const releaseDate = formatReleaseDate(item.startDate);
          return (
            <SpecialContentCard
              key={item.id}
              item={item}
              theme={theme}
              releaseDate={releaseDate}
              releaseDateLabel={
                releaseDate ? t('tabs.bangumiScreen.releaseDate', { date: releaseDate }) : null
              }
              onPress={() => handlePress(item)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function SpecialContentCard({
  item,
  theme,
  releaseDate,
  releaseDateLabel,
  onPress,
}: {
  item: Anime;
  theme: ThemePalette;
  releaseDate: string | null;
  releaseDateLabel: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ProgressiveImage
        source={{ uri: item.image }}
        containerStyle={styles.cardImage}
        borderRadius={14}
      />
      {releaseDate && releaseDateLabel ? (
        <View
          style={[
            styles.releaseDateBanner,
            { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}42` },
          ]}
          accessibilityLabel={releaseDateLabel}>
          <MaterialIcons name="event" size={IconSize.sm} color={theme.accent} />
          <ThemedText
            variant="titleSmall"
            weight="700"
            style={[styles.releaseDateText, { color: theme.accent }]}
            numberOfLines={1}>
            {releaseDate}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.cardBody}>
        <AnimeTitleText
          anime={item}
          style={[styles.cardTitle, { color: theme.text.primary }]}
          numberOfLines={2}
        />
        {item.format ? (
          <View style={styles.metaRow}>
            <View style={[styles.formatBadge, { backgroundColor: theme.accent + '24' }]}>
              <Text style={[styles.formatLabel, { color: theme.accent }]}>{item.format}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginVertical: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs + 2,
  },
  title: {
    ...Typography.titleLarge,
  },
  count: {
    ...Typography.bodySmall,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  seeAll: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    width: 130,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: 130,
    height: 180,
  },
  cardBody: {
    padding: Spacing.xs + 2,
    gap: 4,
  },
  cardTitle: {
    ...Typography.titleSmall,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  releaseDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    minHeight: 28,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  releaseDateText: {
    fontVariant: ['tabular-nums'],
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  formatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export const SpecialContentSection = memo(SpecialContentSectionComponent);
