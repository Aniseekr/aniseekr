import { useMemo, useState, type ComponentProps } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import {
  subscriptionService,
  type SubscriptionOfferingPackage,
} from '../../libs/services/subscription/subscription-service';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { useI18n, type TranslationKey } from '../../libs/i18n';

const PLAN_LABEL: Record<string, TranslationKey> = {
  ANNUAL: 'subscription.annual',
  MONTHLY: 'subscription.monthly',
  LIFETIME: 'subscription.lifetime',
  WEEKLY: 'subscription.weekly',
};

const BENEFITS: { icon: ComponentProps<typeof MaterialIcons>['name']; key: TranslationKey }[] = [
  { icon: 'cloud-download', key: 'subscription.offlineTripPack' },
  { icon: 'photo-library', key: 'subscription.batchImport' },
  { icon: 'hd', key: 'subscription.proExport' },
  { icon: 'palette', key: 'subscription.allPremiumThemes' },
  { icon: 'block', key: 'subscription.noAds' },
];

export default function SubscriptionScreen() {
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const subscription = useSubscription();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // `adFree` is the real paid entitlement; `isPro` can be forced on by flags.
  const paid = subscription.adFree;

  // Match the active product against the store offerings to name the plan.
  const activePackage = useMemo<SubscriptionOfferingPackage | null>(() => {
    const id = subscription.productIdentifier;
    if (!id) return null;
    for (const offering of subscription.offerings) {
      const pkgs = [
        offering.annual,
        offering.monthly,
        offering.lifetime,
        ...offering.availablePackages,
      ];
      const hit = pkgs.find((p) => p?.productIdentifier === id);
      if (hit) return hit;
    }
    return null;
  }, [subscription.offerings, subscription.productIdentifier]);

  const planLabel = activePackage
    ? PLAN_LABEL[activePackage.packageType]
      ? t(PLAN_LABEL[activePackage.packageType])
      : (activePackage.product?.title ?? null)
    : null;

  const dateLabel = useMemo(() => {
    if (!subscription.expiresAt) return null;
    return new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(subscription.expiresAt));
  }, [language, subscription.expiresAt]);

  const onRestore = async () => {
    setRestoring(true);
    try {
      const next = await subscription.restore();
      if (!next.isPro) Alert.alert(t('subscription.noActiveSubscription'));
    } catch (e) {
      Alert.alert(t('commonUi.restoreFailed'), e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SettingsScreenLayout
      title={t('subscription.screen.title')}
      refreshing={subscription.loading}
      onRefresh={() => void subscription.refresh()}>
      <SettingsSection title={t('subscription.screen.status')}>
        <SettingsRow
          icon={paid ? 'verified' : 'info-outline'}
          label={t('subscription.aniseekrPro')}
          value={paid ? t('subscription.screen.active') : t('subscription.screen.inactive')}
        />
        {paid && planLabel ? (
          <SettingsRow icon="workspace-premium" label={t('subscription.screen.plan')} value={planLabel} />
        ) : null}
        {paid ? (
          <SettingsRow
            icon="event"
            label={
              !dateLabel
                ? t('subscription.screen.validity')
                : subscription.willRenew
                  ? t('subscription.screen.renewsOn')
                  : t('subscription.screen.expiresOn')
            }
            value={dateLabel ?? t('subscription.screen.noExpiry')}
          />
        ) : null}
      </SettingsSection>

      {paid ? (
        <SettingsSection title={t('subscription.screen.included')}>
          {BENEFITS.map((b) => (
            <SettingsRow key={b.key} icon={b.icon} label={t(b.key)} />
          ))}
        </SettingsSection>
      ) : (
        <ThemedText variant="bodyMedium" tone="secondary" style={styles.note}>
          {t('subscription.unlockTheFullToolkit')}
        </ThemedText>
      )}

      <View style={styles.actions}>
        {paid ? (
          <ThemedButton
            label={t('subscription.screen.manageInStore')}
            size="lg"
            fullWidth
            onPress={() => void subscriptionService.manageInStore()}
            iconRight={<MaterialIcons name="open-in-new" size={18} color={readableTextOn(theme.accent)} />}
          />
        ) : (
          <ThemedButton
            label={t('settings.premium.upgrade')}
            size="lg"
            fullWidth
            onPress={() => setPaywallVisible(true)}
          />
        )}
        <ThemedButton
          variant="secondary"
          label={t('commonUi.restorePurchases')}
          fullWidth
          loading={restoring}
          onPress={() => void onRestore()}
        />
        {paid ? (
          <ThemedText
            variant="caption"
            tone="tertiary"
            align="center">
            {t('subscription.screen.manageHint')}
          </ThemedText>
        ) : null}
      </View>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: Spacing.xs },
  actions: { gap: Spacing.sm, paddingTop: Spacing.md },
});
