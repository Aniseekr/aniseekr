// Provenance caption for curated local-intel content (spec §13): shows when
// the fact was human-verified and that an official source backs it. Static
// data must never masquerade as live info — this line is the honesty marker.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';

export function IntelProvenanceLine({
  verifiedAt,
  theme,
  showLinkHint = true,
}: {
  verifiedAt: string;
  theme: ThemePalette;
  /** Hide when the parent row is not tappable (no link to hint at). */
  showLinkHint?: boolean;
}) {
  const t = useT();
  return (
    <View style={styles.row}>
      <Ionicons name="shield-checkmark-outline" size={11} color={theme.text.tertiary} />
      <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
        {t('pilgrimageUi.intel.verifiedAt', { date: verifiedAt })}
        {showLinkHint ? ` · ${t('pilgrimageUi.intel.officialSite')}` : ''}
      </ThemedText>
      {showLinkHint ? (
        <Ionicons name="open-outline" size={11} color={theme.text.tertiary} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
