// Small "Pro" tag for a control that needs Aniseekr Pro. Locked → lock icon;
// unlocked (subscriber) → ribbon. Hidden when premium is switched off, the
// same way the appearance screen hides its premium pill.
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../themed';
import { Radius } from '../../constants/DesignSystem';
import { FeatureFlags } from '../../constants/FeatureFlags';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';

export function ProBadge({ locked, color }: { locked: boolean; color?: string }) {
  const { theme } = useTheme();
  const t = useT();
  if (!FeatureFlags.PREMIUM_ENABLED) return null;
  const ink = color ?? theme.accent;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: ink,
      }}>
      <Ionicons name={locked ? 'lock-closed' : 'ribbon'} size={9} color={ink} />
      <ThemedText variant="captionSmall" weight="700" style={{ color: ink }}>
        {t('subscription.proBadge')}
      </ThemedText>
    </View>
  );
}
