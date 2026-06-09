// Full-bleed overlay shown when the MapLibre base map fails to load — almost
// always "offline with no cached tiles for this area". Replaces the silent
// blank GL surface (which reads as a crash) with an honest empty state + retry
// (P0 #1). Themed end-to-end; copy routes through useT (CLAUDE.md Rule 11).

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { EmptyStateView } from '../common/EmptyStateView';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';

export interface MapOfflineOverlayProps {
  onRetry: () => void;
}

function MapOfflineOverlayImpl({ onRetry }: MapOfflineOverlayProps) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.background.primary }]}
      pointerEvents="auto">
      <EmptyStateView
        icon="cloud-off"
        title={t('pilgrimage.map.offlineTitle')}
        description={t('pilgrimage.map.offlineBody')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
});

export const MapOfflineOverlay = memo(MapOfflineOverlayImpl);
