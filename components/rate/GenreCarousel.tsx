// Horizontal carousel with iOS-style parallax: focused card is full size,
// neighbors scale to ~0.9 and fade slightly. Snap-aligned to card center.

import { memo, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { GenreCard } from './GenreCard';
import { Genre } from './types';

type Props = {
  data: Genre[];
  onSelect?: (genre: Genre) => void;
};

// Focused card ≈ 70% of screen width so the previous/next cards peek
// in clearly on both sides after the 0.88 neighbour scale (~12% per side
// visible — roughly a 1:7:1 visual split). Aspect 16:9 portrait makes the
// card tall and presence-heavy like an anime poster.
const CARD_RATIO = 0.7;
const CARD_ASPECT = 16 / 9;
// Wider gap so the side cards don't look glued to the focused one.
const SPACING = 14;
// Neighbour scale (focused card stays at 1). Lower = side cards shrink
// more, making the focused card feel relatively bigger.
const NEIGHBOUR_SCALE = 0.82;
const NEIGHBOUR_OPACITY = 0.6;
// Smaller reserve = taller card. Just enough for the header/pill bar above
// and the floating tab bar below.
const VERTICAL_RESERVE = 230;

function GenreCarouselComponent({ data, onSelect }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardWidth = Math.min(screenWidth * CARD_RATIO, 340);
  const maxByViewport = Math.max(
    340,
    screenHeight - insets.top - insets.bottom - VERTICAL_RESERVE
  );
  const cardHeight = Math.min(cardWidth * CARD_ASPECT, maxByViewport);
  const itemFullWidth = cardWidth + SPACING;
  const sidePadding = (screenWidth - cardWidth) / 2;

  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const renderItem = useMemo(
    () =>
      function Render(genre: Genre, index: number) {
        return (
          <GenreCarouselItem
            key={genre.id}
            genre={genre}
            index={index}
            scrollX={scrollX}
            itemFullWidth={itemFullWidth}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            spacing={SPACING}
            onSelect={onSelect}
          />
        );
      },
    [scrollX, itemFullWidth, cardWidth, cardHeight, onSelect]
  );

  return (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemFullWidth}
      snapToAlignment="start"
      contentContainerStyle={{
        paddingHorizontal: sidePadding,
        paddingVertical: 16,
        alignItems: 'center',
      }}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={{ minHeight: cardHeight + 60 }}>
      {data.map((g, i) => renderItem(g, i))}
    </Animated.ScrollView>
  );
}

interface GenreCarouselItemProps {
  genre: Genre;
  index: number;
  scrollX: SharedValue<number>;
  itemFullWidth: number;
  cardWidth: number;
  cardHeight: number;
  spacing: number;
  onSelect?: (g: Genre) => void;
}

const GenreCarouselItem = memo(function GenreCarouselItem({
  genre,
  index,
  scrollX,
  itemFullWidth,
  cardWidth,
  cardHeight,
  spacing,
  onSelect,
}: GenreCarouselItemProps) {
  const inputRange = [
    (index - 1) * itemFullWidth,
    index * itemFullWidth,
    (index + 1) * itemFullWidth,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [NEIGHBOUR_SCALE, 1, NEIGHBOUR_SCALE],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [NEIGHBOUR_OPACITY, 1, NEIGHBOUR_OPACITY],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View style={[{ width: cardWidth, marginRight: spacing }, animatedStyle]}>
      <View style={{ alignItems: 'center' }}>
        <GenreCard
          title={genre.displayName}
          image={genre.image}
          genreId={genre.id}
          onPress={() => onSelect?.(genre)}
          width={cardWidth}
          height={cardHeight}
          showButton
        />
      </View>
    </Animated.View>
  );
});

export const GenreCarousel = memo(GenreCarouselComponent);
