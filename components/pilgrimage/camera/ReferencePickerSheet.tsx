import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { importReferenceImage } from '../../../libs/services/pilgrimage/reference-image';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedBottomSheet, ThemedButton, ThemedText } from '../../themed';

export interface PickedReference {
  kind: 'imported';
  uri: string;
  width?: number;
  height?: number;
}

interface ReferencePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (reference: PickedReference) => void;
  episode?: string;
  time?: string;
}

/** Import a user supplied screenshot to compare with the camera capture. */
export function ReferencePickerSheet({
  visible,
  onClose,
  onPick,
  episode,
  time,
}: ReferencePickerSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await importReferenceImage();
      if (result.status === 'ok') {
        hapticsBridge.success();
        onPick({ kind: 'imported', uri: result.uri, width: result.width, height: result.height });
        onClose();
      }
    } catch (error) {
      console.warn('[reference] import failed', error);
      hapticsBridge.error();
      Alert.alert(t('pilgrimageUi.referencePicker.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const hint =
    episode && time
      ? t('pilgrimage.album.episodeTime', { episode, time })
      : episode
        ? t('pilgrimage.album.epLabel', { ep: episode })
        : null;

  return (
    <ThemedBottomSheet visible={visible} onClose={onClose} maxHeightPct={0.55}>
      <SafeAreaView edges={['bottom']} style={styles.body}>
        <ThemedText variant="titleMedium" weight="700">
          {t('pilgrimageUi.referencePicker.title')}
        </ThemedText>
        {hint ? (
          <ThemedText variant="bodySmall" tone="secondary">
            {hint}
          </ThemedText>
        ) : null}
        <ThemedButton
          label={t('pilgrimageUi.referencePicker.importScreenshot')}
          variant="secondary"
          fullWidth
          loading={importing}
          icon={<Ionicons name="images-outline" size={18} color={theme.text.primary} />}
          onPress={() => void handleImport()}
        />
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
});
