import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { ThemedButton, ThemedText } from '../../components/themed';
import { useT } from '../../libs/i18n';
import { authService } from '../../libs/services/auth/auth-service';
import { PLATFORM_CONFIGS, type PlatformType } from '../../libs/services/auth/types';
import {
  multiPlatformSyncService,
  type PlatformCheckResult,
} from '../../libs/services/sync/multi-platform-sync-service';
import { offlineQueueService, type SyncJob } from '../../libs/services/sync/offline-queue-service';
import {
  conflictResolutionService,
  type ConflictRecord,
} from '../../libs/services/sync/conflict-resolution-service';

function platformName(value: unknown, unknown: string): string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_CONFIGS, value)
    ? PLATFORM_CONFIGS[value as PlatformType].displayName
    : unknown;
}

type QueueSnapshot = { pending: number; running: number; dead: number; jobs: SyncJob[] };

export default function SyncHubScreen() {
  const { theme } = useTheme();
  const t = useT();
  const [platforms, setPlatforms] = useState<PlatformType[] | null>(null);
  const [platformError, setPlatformError] = useState(false);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [queueError, setQueueError] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRecord[] | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [resolutionError, setResolutionError] = useState<number | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);
  const resolvingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [results, setResults] = useState<PlatformCheckResult[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ errors: string[]; conflicts: number } | null>(
    null
  );
  const running = useRef(false);
  const refreshId = useRef(0);

  const refreshLocal = useCallback(async () => {
    const id = ++refreshId.current;
    setRefreshing(true);
    setResults(null);
    try {
      const records = await conflictResolutionService.listUnresolved();
      if (id === refreshId.current) {
        setConflicts(records);
        setConflictError(false);
      }
    } catch {
      if (id === refreshId.current) setConflictError(true);
    }
    try {
      await authService.initialize();
      if (id === refreshId.current) {
        setPlatforms(authService.getConnectedPlatforms());
        setPlatformError(false);
      }
    } catch {
      if (id === refreshId.current) setPlatformError(true);
    }

    try {
      const snapshot = await offlineQueueService.getDiagnostics();
      if (id === refreshId.current) {
        setQueue(snapshot);
        setQueueError(false);
      }
    } catch {
      if (id === refreshId.current) {
        setQueue(null);
        setQueueError(true);
      }
    } finally {
      if (id === refreshId.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLocal();
      return () => {
        refreshId.current += 1;
      };
    }, [refreshLocal])
  );

  const checkPlatforms = async () => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    setCheckError(false);
    setResults(null);
    try {
      const checked = await multiPlatformSyncService.checkPlatforms();
      setPlatforms(authService.getConnectedPlatforms());
      setPlatformError(false);
      setResults(checked);
    } catch {
      setCheckError(true);
    } finally {
      running.current = false;
      setChecking(false);
    }
  };

  const syncPlatforms = async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await multiPlatformSyncService.syncAll();
      await refreshLocal();
      setSyncResult({
        errors: result.errors.map(
          (error) =>
            `${platformName(error.platform, t('settings.syncHubScreen.unknownPlatform'))}: ${error.error}`
        ),
        conflicts: result.conflictIds.length,
      });
    } catch (error) {
      setSyncResult({
        errors: [error instanceof Error ? error.message : String(error)],
        conflicts: 0,
      });
    } finally {
      running.current = false;
      setSyncing(false);
    }
  };

  const resolveConflict = async (conflictId: number, platform: PlatformType) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(conflictId);
    setResolutionError(null);
    try {
      await conflictResolutionService.resolveManually(conflictId, platform);
      await refreshLocal();
    } catch {
      setResolutionError(conflictId);
    } finally {
      resolvingRef.current = false;
      setResolving(null);
    }
  };

  const conflictValue = (field: ConflictRecord['field'], value: string | number) => {
    if (field !== 'status') return String(value);
    switch (value) {
      case 'watching':
        return t('commonUi.watching');
      case 'completed':
        return t('commonUi.completed');
      case 'on_hold':
        return t('commonUi.onHold');
      case 'dropped':
        return t('commonUi.dropped');
      case 'planned':
        return t('commonUi.planToWatch');
      default:
        return String(value);
    }
  };

  const jobType = (value: unknown) => {
    switch (value) {
      case 'progress':
        return t('settings.syncHubScreen.jobProgress');
      case 'status':
        return t('settings.syncHubScreen.jobStatus');
      case 'score':
        return t('settings.syncHubScreen.jobScore');
      case 'add':
        return t('settings.syncHubScreen.jobAdd');
      case 'remove':
        return t('settings.syncHubScreen.jobRemove');
      default:
        return t('settings.syncHubScreen.unknownJob');
    }
  };

  return (
    <SettingsScreenLayout
      title={t('settings.syncHub')}
      subtitle={t('settings.syncHubScreen.subtitle')}
      refreshing={refreshing}
      onRefresh={() => void refreshLocal()}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        <ThemedText variant="titleMedium">{t('settings.syncHubScreen.syncNow')}</ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {t('settings.syncHubScreen.syncDescription')}
        </ThemedText>
        <ThemedButton
          label={
            syncing ? t('settings.syncHubScreen.syncing') : t('settings.syncHubScreen.syncNow')
          }
          onPress={() => void syncPlatforms()}
          loading={syncing}
          disabled={checking || platforms === null || platforms.length === 0 || platformError}
          fullWidth
        />
        {syncResult && (
          <ThemedText variant="bodySmall" tone="secondary">
            {syncResult.errors.length
              ? syncResult.errors.join('\n')
              : t('settings.syncHubScreen.syncFinished', { count: syncResult.conflicts })}
          </ThemedText>
        )}
      </View>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        <View style={styles.heading}>
          <MaterialIcons name="sync-problem" size={24} color={theme.accent} />
          <ThemedText variant="titleMedium" style={styles.headingText}>
            {t('settings.syncHubScreen.checkTitle')}
          </ThemedText>
        </View>
        <ThemedText variant="bodySmall" tone="secondary">
          {t('settings.syncHubScreen.checkDescription')}
        </ThemedText>
        <ThemedButton
          label={
            checking ? t('settings.syncHubScreen.checking') : t('settings.syncHubScreen.checkNow')
          }
          onPress={() => void checkPlatforms()}
          loading={checking}
          disabled={syncing}
          fullWidth
        />
        {checkError && (
          <ThemedText variant="bodySmall" tone="secondary">
            {t('settings.syncHubScreen.checkError')}
          </ThemedText>
        )}
      </View>

      <SettingsSection title={t('settings.syncHubScreen.connectedChecks')}>
        {platformError ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.platformsError')}
          </ThemedText>
        ) : platforms === null ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.platformsLoading')}
          </ThemedText>
        ) : platforms.length === 0 ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.noPlatforms')}
          </ThemedText>
        ) : (
          platforms.map((platform, index) => {
            const result = results?.find((item) => item.platform === platform);
            return (
              <View
                key={`${String(platform)}-${index}`}
                style={[styles.result, { borderBottomColor: theme.glassBorder }]}>
                <View style={styles.resultName}>
                  <ThemedText variant="titleMedium">
                    {platformName(platform, t('settings.syncHubScreen.unknownPlatform'))}
                  </ThemedText>
                  <ThemedText variant="bodySmall" tone="secondary">
                    {checking
                      ? t('settings.syncHubScreen.checking')
                      : result?.status === 'ok'
                        ? t('settings.syncHubScreen.checkCount', { count: result.count })
                        : result?.status === 'error'
                          ? t('settings.syncHubScreen.checkFailed')
                          : t('settings.syncHubScreen.notChecked')}
                  </ThemedText>
                </View>
              </View>
            );
          })
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.syncHubScreen.conflictsTitle')}>
        {conflictError ? (
          <View style={styles.empty}>
            <ThemedText variant="bodyMedium" tone="secondary">
              {t('settings.syncHubScreen.conflictsError')}
            </ThemedText>
            <ThemedButton
              label={t('commonUi.tryAgain')}
              onPress={() => void refreshLocal()}
              disabled={refreshing}
            />
          </View>
        ) : conflicts === null ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.conflictsLoading')}
          </ThemedText>
        ) : conflicts.length === 0 ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.conflictsEmpty')}
          </ThemedText>
        ) : (
          conflicts.map((conflict) => (
            <View
              key={conflict.id}
              style={[styles.result, { borderBottomColor: theme.glassBorder }]}>
              <View style={styles.resultName}>
                <ThemedText variant="titleMedium">
                  {conflict.field === 'progress'
                    ? t('settings.syncHubScreen.jobProgress')
                    : conflict.field === 'status'
                      ? t('settings.syncHubScreen.jobStatus')
                      : conflict.field === 'score'
                        ? t('settings.syncHubScreen.jobScore')
                        : t('settings.syncHubScreen.unknownJob')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  {t('settings.syncHubScreen.conflictAnime', { id: conflict.animeId })}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  {t('settings.syncHubScreen.conflictChoose')}
                </ThemedText>
                {conflict.values
                  .filter(
                    (entry) =>
                      entry &&
                      typeof entry === 'object' &&
                      typeof entry.platform === 'string' &&
                      (typeof entry.value === 'string' || typeof entry.value === 'number')
                  )
                  .map((entry, index) => (
                    <ThemedButton
                      key={`${entry.platform}-${index}`}
                      label={t('settings.syncHubScreen.conflictOption', {
                        platform: platformName(
                          entry.platform,
                          t('settings.syncHubScreen.unknownPlatform')
                        ),
                        value: conflictValue(conflict.field, entry.value),
                      })}
                      onPress={() => void resolveConflict(conflict.id, entry.platform)}
                      disabled={
                        resolving !== null ||
                        !Object.prototype.hasOwnProperty.call(PLATFORM_CONFIGS, entry.platform) ||
                        conflict.values.filter(
                          (candidate) => candidate?.platform === entry.platform
                        ).length !== 1
                      }
                      loading={resolving === conflict.id}
                      variant="secondary"
                      fullWidth
                    />
                  ))}
                {resolutionError === conflict.id && (
                  <ThemedText variant="bodySmall" tone="secondary">
                    {t('settings.syncHubScreen.resolveError')}
                  </ThemedText>
                )}
              </View>
            </View>
          ))
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.syncHubScreen.queueTitle')}>
        {queueError ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.queueError')}
          </ThemedText>
        ) : !queue ? (
          <ThemedText variant="bodyMedium" tone="secondary" style={styles.empty}>
            {t('settings.syncHubScreen.queueLoading')}
          </ThemedText>
        ) : (
          <>
            <View style={styles.empty}>
              <ThemedText variant="bodyMedium">
                {t('settings.syncHubScreen.queuePending', { count: queue.pending })}
              </ThemedText>
              <ThemedText variant="bodyMedium">
                {t('settings.syncHubScreen.queueRunning', { count: queue.running })}
              </ThemedText>
              <ThemedText variant="bodyMedium">
                {t('settings.syncHubScreen.queueDead', { count: queue.dead })}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary">
                {t('settings.syncHubScreen.queueDescription')}
              </ThemedText>
            </View>
            {queue.jobs.map((job) => {
              const animeId =
                job.payload &&
                typeof job.payload === 'object' &&
                typeof job.payload.animeId === 'string'
                  ? job.payload.animeId
                  : '';
              const date = new Date(job.updatedAt);
              return (
                <View
                  key={job.id}
                  style={[styles.result, { borderBottomColor: theme.glassBorder }]}>
                  <View style={styles.resultName}>
                    <ThemedText variant="titleMedium">
                      {platformName(job.platform, t('settings.syncHubScreen.unknownPlatform'))} ·{' '}
                      {jobType(job.jobType)}
                    </ThemedText>
                    <ThemedText variant="bodySmall" tone="secondary">
                      {job.state === 'dead'
                        ? t('settings.syncHubScreen.deadState')
                        : t('settings.syncHubScreen.unknownState')}
                    </ThemedText>
                    {animeId ? (
                      <ThemedText variant="bodySmall" tone="secondary">
                        {t('settings.syncHubScreen.jobAnimeId', { id: animeId })}
                      </ThemedText>
                    ) : null}
                    <ThemedText variant="bodySmall" tone="secondary">
                      {t('settings.syncHubScreen.jobAttempts', { count: job.attempts })}
                    </ThemedText>
                    {Number.isFinite(date.getTime()) && (
                      <ThemedText variant="bodySmall" tone="secondary">
                        {t('settings.syncHubScreen.jobUpdated', { date: date.toLocaleString() })}
                      </ThemedText>
                    )}
                    <ThemedText variant="bodySmall" tone="secondary">
                      {typeof job.lastError === 'string' && job.lastError.trim()
                        ? job.lastError
                        : t('settings.syncHubScreen.noErrorDetail')}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
            {queue.dead > queue.jobs.length && (
              <ThemedText variant="bodySmall" tone="secondary" style={styles.empty}>
                {t('settings.syncHubScreen.queueLimited', { count: queue.jobs.length })}
              </ThemedText>
            )}
          </>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.syncHubScreen.section.linked')}>
        <SettingsRow
          icon="manage-accounts"
          label={t('settings.connectedPlatforms')}
          onPress={() => router.push('/(setting)/account')}
          value={t('settings.syncHubScreen.manageInAccount')}
        />
        <SettingsRow
          icon="cloud"
          label={t('settings.syncHubScreen.cloudBackup')}
          description={t('settings.syncHubScreen.cloudBackupDesc')}
          onPress={() => router.push('/(setting)/backup')}
        />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headingText: { flex: 1 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: { flex: 1, gap: Spacing.xs },
  empty: { padding: Spacing.md, gap: Spacing.xs },
});
