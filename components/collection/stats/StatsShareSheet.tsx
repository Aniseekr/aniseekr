// Share a stats card as an image. The card on screen is rendered again here
// with the Aniseekr mark; free exports carry the logo, Pro can turn it off
// (same rule as the pilgrimage share images).
import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View, type ViewInstance } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing } from '../../../constants/DesignSystem';
import { ThemedBottomSheet, ThemedButton, ThemedText } from '../../themed';
import { BrandMark } from '../../pilgrimage/BrandMark';
import { ProOptionChips } from '../../pilgrimage/ProOptionChips';
import { PaywallSheet } from '../../subscription/PaywallSheet';
import { useSubscription } from '../../../context/SubscriptionContext';
import { useT } from '../../../libs/i18n';
import {
  effectiveBrandMark,
  type BrandMarkOption,
  type BrandMarkStyle,
} from '../../../libs/services/pilgrimage/share-brand-mark';

/** First entry is the free default. */
const STATS_MARKS: readonly BrandMarkOption[] = [
  { id: 'logo', pro: false },
  { id: 'none', pro: true },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Ink for the mark when the card is not on the page background. */
  markInk?: string;
  /** Renders the card; `mark` goes in the card's footer. */
  children: (mark: ReactNode) => ReactNode;
}

export function StatsShareSheet({ visible, onClose, markInk, children }: Props) {
  const { theme } = useTheme();
  const t = useT();
  const { isPro } = useSubscription();
  const cardRef = useRef<ViewInstance>(null);
  const [markChoice, setMarkChoice] = useState<BrandMarkStyle>(STATS_MARKS[0].id);
  const [sharing, setSharing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const markStyle = effectiveBrandMark(STATS_MARKS, markChoice, isPro);
  const markOptions = useMemo(
    () => STATS_MARKS.map((o) => ({ ...o, label: t(`pilgrimage.brandMark.${o.id}`) })),
    [t]
  );

  const share = useCallback(async () => {
    if (sharing || !cardRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef.current, { format: 'png', result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch (error) {
      console.warn('[stats-share] failed', error);
      Alert.alert(t('collectionStats.share.failed'));
    } finally {
      setSharing(false);
    }
  }, [sharing, t]);

  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <View
          ref={cardRef}
          collapsable={false}
          style={[styles.capture, { backgroundColor: theme.background.primary }]}>
          {children(
            <BrandMark
              style={markStyle}
              dateline=""
              accent={theme.accent}
              surface="page"
              pageInk={markInk ?? theme.text.secondary}
            />
          )}
        </View>
        <View style={styles.option}>
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            {t('pilgrimage.brandMark.title')}
          </ThemedText>
          <ProOptionChips
            options={markOptions}
            value={markStyle}
            isPro={isPro}
            accent={theme.accent}
            onChange={setMarkChoice}
            onLocked={() => setPaywallVisible(true)}
            accessibilityLabel={(o) => t('pilgrimage.brandMark.a11y', { label: o.label })}
          />
        </View>
        <ThemedButton
          size="lg"
          fullWidth
          label={t('collectionStats.share.cta')}
          loading={sharing}
          onPress={share}
        />
      </View>
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  capture: { padding: Spacing.sm },
  option: { gap: Spacing.xs },
});
