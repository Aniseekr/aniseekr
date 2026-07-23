import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { ThemedBottomSheet, ThemedButton, ThemedText } from '../../themed';

interface SceneIdDisclosureSheetProps {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

function SceneIdDisclosureSheetComponent({
  visible,
  onAccept,
  onDismiss,
}: SceneIdDisclosureSheetProps) {
  const { theme } = useTheme();
  const t = useT();

  return (
    <ThemedBottomSheet visible={visible} onClose={onDismiss}>
      <SafeAreaView edges={['bottom']}>
        <View style={[styles.iconBubble, { backgroundColor: `${theme.accent}22` }]}>
          <Ionicons name="scan-outline" size={23} color={theme.accent} />
        </View>
        <ThemedText variant="titleMedium" weight="700" align="center">
          {t('pilgrimage.identify.disclosureTitle')}
        </ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary" align="center" style={styles.body}>
          {t('pilgrimage.identify.disclosureBody')}
        </ThemedText>
        <View style={styles.actions}>
          <ThemedButton
            label={t('pilgrimage.identify.disclosureAllow')}
            onPress={onAccept}
            size="lg"
            shape="rounded"
            fullWidth
          />
          <ThemedButton
            label={t('common.notNow')}
            onPress={onDismiss}
            size="lg"
            variant="ghost"
            fullWidth
          />
        </View>
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  iconBubble: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    marginBottom: Spacing.sm,
  },
  body: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  actions: {
    gap: Spacing.xs,
  },
});

export const SceneIdDisclosureSheet = memo(SceneIdDisclosureSheetComponent);
