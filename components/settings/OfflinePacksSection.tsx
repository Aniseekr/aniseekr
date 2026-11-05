// Offline trip packs in Settings → Cache: size, update, delete. Packs are
// user downloads, so they are listed apart from the cache buckets and are
// not removed by "Clear all caches".
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { SettingsRow, SettingsSection } from '../setting/SettingsScreenLayout';
import { ThemedButton, ThemedText } from '../themed';
import { offlinePackStore } from '../../libs/services/pilgrimage/offline-pack/offline-pack-store';
import { packStatus } from '../../libs/services/pilgrimage/offline-pack/pack-manifest';
import {
  useLatestAtlasVersion,
  useOfflinePackSnapshot,
} from '../../libs/services/pilgrimage/offline-pack/use-offline-pack';
import {
  formatPackBytes,
  formatPackDate,
} from '../../libs/services/pilgrimage/offline-pack/pack-format';

export function OfflinePacksSection() {
  const { theme } = useTheme();
  const t = useT();
  const snapshot = useOfflinePackSnapshot();
  const keys = useMemo(
    () => [...new Set([...Object.keys(snapshot.manifests), ...Object.keys(snapshot.runtime)])],
    [snapshot]
  );
  const latest = useLatestAtlasVersion(keys.length > 0);
  // The store re-measures whenever a pack is added, updated or removed.
  const totalBytes = offlinePackStore.totalBytes();

  const confirmDelete = (workKey: string, title: string) => {
    Alert.alert(
      t('pilgrimage.offlinePack.deleteTitle'),
      t('pilgrimage.offlinePack.deleteMessage', { title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pilgrimage.offlinePack.delete'),
          style: 'destructive',
          onPress: () => void offlinePackStore.remove(workKey),
        },
      ]
    );
  };
  const download = (workKey: string) =>
    void offlinePackStore.download(workKey).catch(() => undefined);

  return (
    <SettingsSection title={t('settings.cacheScreen.section.offlinePacks')}>
      <SettingsRow
        icon="cloud-download"
        label={t('settings.cacheScreen.offlinePacksTotal')}
        description={t('settings.cacheScreen.offlinePacksDesc')}
        value={formatPackBytes(totalBytes)}
      />
      {keys.length === 0 ? (
        <ThemedText variant="caption" tone="tertiary" style={styles.empty}>
          {t('settings.cacheScreen.offlinePacksEmpty')}
        </ThemedText>
      ) : (
        keys.map((key) => {
          const manifest = snapshot.manifests[key] ?? null;
          const status = packStatus(manifest, latest, snapshot.runtime[key] ?? null);
          const title = manifest?.title ?? key;
          let detail = '';
          if (status.kind === 'downloading') {
            const { done, total } = status.progress;
            detail =
              total > 0
                ? t('pilgrimage.offlinePack.downloading', {
                    percent: Math.floor((done / total) * 100),
                  })
                : t('pilgrimage.offlinePack.preparing');
          } else if (status.kind === 'failed') {
            detail = `${t('pilgrimage.offlinePack.failed')} · ${status.error}`;
          } else if (manifest) {
            const parts = [
              t('pilgrimage.offlinePack.ready', { date: formatPackDate(manifest.downloadedAt) }),
              t('pilgrimage.offlinePack.readyDetail', {
                size: formatPackBytes(manifest.bytes),
                spots: manifest.spotCount,
              }),
            ];
            if (manifest.mapCoverage === 'partial') parts.push(t('pilgrimage.offlinePack.partial'));
            if (status.kind === 'update-available') {
              parts.push(t('pilgrimage.offlinePack.updateAvailable'));
            }
            detail = parts.join(' · ');
          }
          return (
            <View key={key} style={[styles.pack, { borderTopColor: theme.glassBorder }]}>
              <View style={styles.packText}>
                <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
                  {title}
                </ThemedText>
                <ThemedText variant="captionSmall" tone="secondary">
                  {detail}
                </ThemedText>
              </View>
              {status.kind === 'update-available' || status.kind === 'failed' ? (
                <ThemedButton
                  size="sm"
                  variant="secondary"
                  label={t(
                    status.kind === 'failed'
                      ? 'pilgrimage.offlinePack.retry'
                      : 'pilgrimage.offlinePack.update'
                  )}
                  onPress={() => download(key)}
                />
              ) : null}
              {manifest && status.kind !== 'downloading' ? (
                <ThemedButton
                  size="sm"
                  variant="ghost"
                  label={t('pilgrimage.offlinePack.delete')}
                  haptic="warning"
                  onPress={() => confirmDelete(key, title)}
                />
              ) : null}
            </View>
          );
        })
      )}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  packText: {
    flex: 1,
    gap: 2,
  },
});
