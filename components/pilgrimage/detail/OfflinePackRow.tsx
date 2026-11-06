// Offline trip pack status + action for one work, shown in the work sheet.
// Viewing stays free; only "Download for offline" is Pro (PaywallSheet).
// Every state is real: estimate from the actual tile plan, live progress,
// the stored copy's date, an update offer only when Atlas says so.
import { memo, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useSubscription } from '../../../context/SubscriptionContext';
import { useT } from '../../../libs/i18n';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import {
  estimatePackBytes,
  planPackTiles,
} from '../../../libs/services/pilgrimage/offline-pack/pack-plan';
import { offlinePackStore } from '../../../libs/services/pilgrimage/offline-pack/offline-pack-store';
import { useOfflinePackStatus } from '../../../libs/services/pilgrimage/offline-pack/use-offline-pack';
import {
  formatPackBytes,
  formatPackDate,
} from '../../../libs/services/pilgrimage/offline-pack/pack-format';
import { ThemedButton, ThemedText } from '../../themed';
import { PaywallSheet } from '../../subscription/PaywallSheet';

interface OfflinePackRowProps {
  anime: PilgrimageWork;
  themeColor: string;
  theme: ThemePalette;
}

function OfflinePackRowImpl({ anime, themeColor, theme }: OfflinePackRowProps) {
  const t = useT();
  const { isPro } = useSubscription();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const status = useOfflinePackStatus(anime.key);

  const estimateBytes = useMemo(() => {
    const plan = planPackTiles(anime.spots);
    return estimatePackBytes(plan.tiles.length, JSON.stringify(anime.spots).length);
  }, [anime.spots]);

  const start = () => {
    if (!isPro) {
      setPaywallVisible(true);
      return;
    }
    Alert.alert(
      t('pilgrimage.offlinePack.confirmTitle'),
      t('pilgrimage.offlinePack.confirmMessage', {
        size: formatPackBytes(estimateBytes),
        spots: anime.spots.length,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pilgrimage.offlinePack.download'),
          onPress: () => void offlinePackStore.download(anime.key).catch(() => undefined),
        },
      ]
    );
  };
  const retry = () => void offlinePackStore.download(anime.key).catch(() => undefined);

  let icon: keyof typeof Ionicons.glyphMap = 'cloud-download-outline';
  let iconColor = theme.text.secondary;
  let title = t('pilgrimage.offlinePack.title');
  let detail: string | null = t('pilgrimage.offlinePack.pitch', {
    size: formatPackBytes(estimateBytes),
  });
  let action: { label: string; onPress: () => void } | null = {
    label: t('pilgrimage.offlinePack.download'),
    onPress: start,
  };
  let progress: number | null = null;

  switch (status.kind) {
    case 'downloading': {
      icon = 'cloud-download';
      iconColor = themeColor;
      const { done, total } = status.progress;
      progress = total > 0 ? done / total : null;
      title =
        total > 0
          ? t('pilgrimage.offlinePack.downloading', { percent: Math.floor((done / total) * 100) })
          : t('pilgrimage.offlinePack.preparing');
      detail = total > 0 ? formatPackBytes(status.progress.bytes) : null;
      action = null;
      break;
    }
    case 'failed':
      icon = 'alert-circle-outline';
      iconColor = theme.text.primary;
      title = t('pilgrimage.offlinePack.failed');
      detail = status.error;
      action = { label: t('pilgrimage.offlinePack.retry'), onPress: retry };
      break;
    case 'ready':
    case 'update-available': {
      const { manifest } = status;
      icon = 'cloud-done-outline';
      iconColor = themeColor;
      const date = formatPackDate(manifest.downloadedAt);
      title = anime.offlineCopy
        ? t('pilgrimage.offlinePack.servedOffline', { date })
        : t('pilgrimage.offlinePack.ready', { date });
      const parts = [
        t('pilgrimage.offlinePack.readyDetail', {
          size: formatPackBytes(manifest.bytes),
          spots: manifest.spotCount,
        }),
      ];
      if (manifest.mapCoverage === 'partial') parts.push(t('pilgrimage.offlinePack.partial'));
      if (manifest.mapCoverage === 'none') parts.push(t('pilgrimage.offlinePack.noMap'));
      if (status.kind === 'update-available') {
        parts.push(t('pilgrimage.offlinePack.updateAvailable'));
      }
      detail = parts.join(' · ');
      action =
        status.kind === 'update-available'
          ? { label: t('pilgrimage.offlinePack.update'), onPress: retry }
          : null;
      break;
    }
    case 'none':
      break;
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
      ]}>
      <View style={styles.row}>
        <Ionicons name={icon} size={20} color={iconColor} />
        <View style={styles.text}>
          <View style={styles.titleLine}>
            <ThemedText variant="bodySmall" weight="700" numberOfLines={2} style={styles.flex}>
              {title}
            </ThemedText>
            {status.kind === 'none' && !isPro ? (
              <View style={[styles.badge, { borderColor: themeColor }]}>
                <ThemedText variant="captionSmall" weight="800" style={{ color: themeColor }}>
                  {t('pilgrimage.offlinePack.proBadge')}
                </ThemedText>
              </View>
            ) : null}
          </View>
          {detail ? (
            <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2}>
              {detail}
            </ThemedText>
          ) : null}
        </View>
        {action ? (
          <ThemedButton
            size="sm"
            variant="secondary"
            label={action.label}
            onPress={action.onPress}
          />
        ) : null}
      </View>
      {progress !== null ? (
        <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
          <View
            style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: themeColor }]}
          />
        </View>
      ) : null}
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

export const OfflinePackRow = memo(OfflinePackRowImpl);

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  flex: {
    flexShrink: 1,
  },
  badge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
  },
});
