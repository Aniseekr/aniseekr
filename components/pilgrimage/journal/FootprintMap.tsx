// Journal map tab: Japan as a tile grid, one square per prefecture, inked by
// how many spots the user has stamped there. Built only from on-device stamp
// records; a stamp whose municipality is unknown is counted, never placed.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

import { readableTextOn, ThemedBottomSheet, ThemedText } from '@/components/themed';
import { withAlpha } from '@/components/themed/contrast';
import { Size, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { stampBookRoute, useAtlasWorkMap, useStamps } from '@/hooks/useStamps';
import { listItemEnter } from '@/libs/animations/presets';
import { useT } from '@/libs/i18n';
import { useUiLanguage } from '@/libs/i18n/ui-language';
import { atlasClient, type AtlasCityLabel } from '@/libs/services/pilgrimage/atlas/atlas-client';
import {
  buildFootprint,
  PREFECTURE_GRID,
  PREFECTURE_TILES,
  type FootprintPrefecture,
} from '@/libs/services/pilgrimage/footprint';
import { getPilgrimageAnimeTitles } from '@/libs/services/pilgrimage/pilgrimage-localization';
import { hapticsBridge } from '@/modules/haptics/hapticsBridge';

const TILE_GAP = 2;
const TILE_RADIUS = 3;
const TILE_BY_CODE = new Map(PREFECTURE_TILES.map((tile) => [tile.code, tile]));

/** Ink strength by stamped spots: a first visit shows, a well-walked prefecture is solid. */
function inkLevel(spots: number): 1 | 2 | 3 {
  return spots >= 10 ? 3 : spots >= 3 ? 2 : 1;
}

function useCityNames(): ReadonlyMap<string, AtlasCityLabel> {
  const [cities, setCities] = useState<ReadonlyMap<string, AtlasCityLabel>>(new Map());
  useEffect(() => {
    let cancelled = false;
    atlasClient
      .cityLookup()
      .then((lookup) => {
        if (!cancelled) setCities(lookup);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return cities;
}

export function FootprintMap() {
  const t = useT();
  const { theme } = useTheme();
  const language = useUiLanguage();
  const stamps = useStamps();
  const footprint = useMemo(() => buildFootprint(stamps), [stamps]);
  const [width, setWidth] = useState(0);
  const [openCode, setOpenCode] = useState<string | null>(null);

  // Place names are Japanese; zh and ja read them as written, the rest get romaji.
  const japaneseNames = language === 'ja' || language === 'zh-Hant' || language === 'zh-Hans';
  const nameOf = (code: string) => {
    const tile = TILE_BY_CODE.get(code);
    return tile ? (japaneseNames ? tile.name : tile.en) : code;
  };

  const byCode = useMemo(
    () => new Map(footprint.prefectures.map((pref) => [pref.code, pref])),
    [footprint]
  );
  const cell = width / PREFECTURE_GRID.columns;
  const tile = cell - TILE_GAP;
  const fontSize = Math.min(10, tile * 0.38);
  const onAccent = readableTextOn(theme.accent);

  const open = (code: string) => {
    hapticsBridge.selection();
    setOpenCode(code);
  };

  const summary = t('pilgrimage.footprint.summary', {
    prefs: footprint.prefectures.length,
    cities: footprint.cityCount,
  });

  return (
    <View style={styles.section}>
      <ThemedText variant="titleSmall" weight="700">
        {footprint.prefectures.length ? summary : t('pilgrimage.footprint.empty')}
      </ThemedText>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: cell * PREFECTURE_GRID.rows }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        {width > 0 ? (
          <Svg width={width} height={cell * PREFECTURE_GRID.rows}>
            {PREFECTURE_TILES.map((item) => {
              const visited = byCode.get(item.code);
              const level = visited ? inkLevel(visited.spots) : 0;
              const fill =
                level === 3
                  ? theme.accent
                  : level === 2
                    ? withAlpha(theme.accent, 0.45)
                    : level === 1
                      ? withAlpha(theme.accent, 0.2)
                      : theme.background.secondary;
              const x = item.x * cell + TILE_GAP / 2;
              const y = item.y * cell + TILE_GAP / 2;
              return (
                <G key={item.code} onPress={visited ? () => open(item.code) : undefined}>
                  <Rect
                    x={x}
                    y={y}
                    width={tile}
                    height={tile}
                    rx={TILE_RADIUS}
                    fill={fill}
                    stroke={visited ? theme.accent : theme.glassBorder}
                    strokeWidth={visited ? 1.25 : 1}
                  />
                  <SvgText
                    x={x + tile / 2}
                    y={y + tile / 2 + fontSize * 0.36}
                    fontSize={fontSize}
                    fontWeight={visited ? '700' : '500'}
                    textAnchor="middle"
                    fill={
                      level === 3 ? onAccent : visited ? theme.text.primary : theme.text.tertiary
                    }>
                    {item.short}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>
      {footprint.prefectures.length ? (
        <View>
          {footprint.prefectures.map((pref, index) => (
            <Animated.View key={pref.code} entering={listItemEnter(index)}>
              <Pressable
                onPress={() => open(pref.code)}
                accessibilityRole="button"
                accessibilityLabel={`${nameOf(pref.code)}, ${t('pilgrimageUi.spotsCount', { count: pref.spots })}`}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: theme.glassBorder },
                  pressed && styles.pressed,
                ]}>
                <ThemedText variant="bodyMedium" weight="700" numberOfLines={1} style={styles.flex}>
                  {nameOf(pref.code)}
                </ThemedText>
                <ThemedText variant="caption" tone="secondary" style={styles.count}>
                  {t('pilgrimageUi.spotsCount', { count: pref.spots })}
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      ) : null}
      {footprint.unplaced > 0 ? (
        <ThemedText variant="caption" tone="tertiary">
          {t('pilgrimage.footprint.unplaced', { count: footprint.unplaced })}
        </ThemedText>
      ) : null}
      <PrefectureSheet
        prefecture={openCode ? (byCode.get(openCode) ?? null) : null}
        name={openCode ? nameOf(openCode) : ''}
        onClose={() => setOpenCode(null)}
      />
    </View>
  );
}

function PrefectureSheet({
  prefecture,
  name,
  onClose,
}: {
  prefecture: FootprintPrefecture | null;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const { theme } = useTheme();
  const router = useRouter();
  const works = useAtlasWorkMap();
  const cities = useCityNames();

  // Consecutive rows of one municipality share a heading.
  const groups = useMemo(() => {
    const byCity = new Map<string, FootprintPrefecture['places']>();
    for (const place of prefecture?.places ?? []) {
      byCity.set(place.muniCd, [...(byCity.get(place.muniCd) ?? []), place]);
    }
    return [...byCity.entries()];
  }, [prefecture]);

  return (
    <ThemedBottomSheet visible={prefecture !== null} onClose={onClose} maxHeightPct={0.7}>
      <SafeAreaView edges={['bottom']}>
        <ThemedText variant="titleMedium" weight="700" style={styles.sheetTitle}>
          {name}
        </ThemedText>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          {groups.map(([muniCd, places]) => (
            <View key={muniCd}>
              {/* The code is shown only while the city list has not loaded; it is the real id. */}
              <ThemedText variant="caption" weight="700" tone="secondary">
                {cities.get(muniCd)?.name ?? muniCd}
              </ThemedText>
              {places.map((place) => {
                const work = works.get(place.workKey);
                const title = work ? getPilgrimageAnimeTitles(work).primary : place.workKey;
                const detail = [
                  t('pilgrimageUi.spotsCount', { count: place.spots }),
                  place.onsite > 0
                    ? t('pilgrimage.stamps.onsiteCount', { count: place.onsite })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={place.workKey}
                    onPress={() => {
                      hapticsBridge.tap();
                      onClose();
                      router.push(stampBookRoute(place.workKey, title, work));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('pilgrimage.stamps.openBookA11y', {
                      progress: `${title}, ${detail}`,
                    })}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: theme.glassBorder },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText
                      variant="bodyMedium"
                      weight="700"
                      numberOfLines={1}
                      style={styles.flex}>
                      {title}
                    </ThemedText>
                    <ThemedText variant="caption" tone="secondary" style={styles.count}>
                      {detail}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.minTouchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  count: { fontVariant: ['tabular-nums'] },
  sheetTitle: { paddingBottom: Spacing.sm },
  sheetBody: { gap: Spacing.md },
});
