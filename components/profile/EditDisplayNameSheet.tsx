/* eslint-disable react-hooks/set-state-in-effect -- Existing open-reset effect; Phase 3 only replaces the sheet shell. */
import { useEffect, useState, useCallback } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';
import { ThemedBottomSheet, readableTextOn } from '../themed';

interface EditDisplayNameSheetProps {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void> | void;
}

export function EditDisplayNameSheet({
  visible,
  currentName,
  onClose,
  onSave,
}: EditDisplayNameSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const accentFg = readableTextOn(theme.accent);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(
        t('profile.displayNamePleaseEnterATitle'),
        t('profile.displayNamePleaseEnterAMessage')
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      hapticsBridge.success();
      onClose();
    } catch (e) {
      hapticsBridge.warning();
      Alert.alert(
        t('profile.saveFailed'),
        e instanceof Error ? e.message : t('profile.couldNotSave')
      );
    } finally {
      setSaving(false);
    }
  }, [name, onSave, onClose, t]);

  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior="padding">
        <SafeAreaView edges={['bottom']}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text.primary }]}>
              {t('profile.editDisplayName')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={theme.text.secondary} />
            </Pressable>
          </View>

          <Text style={[styles.helperText, { color: theme.text.secondary }]}>
            {t('profile.storedOnThisDeviceOnly')}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.background.tertiary,
                borderColor: theme.glassBorder,
                color: theme.text.primary,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder={t('profile.animeFan')}
            placeholderTextColor={theme.text.tertiary}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!saving}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: theme.accent, opacity: saving ? 0.5 : pressed ? 0.85 : 1 },
            ]}>
            <Text style={[styles.saveLabel, { color: accentFg }]}>
              {saving ? t('commonUi.saving') : t('common.save')}
            </Text>
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  helperText: {
    ...Typography.bodySmall,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
    ...Typography.bodyLarge,
  },
  saveButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveLabel: {
    ...Typography.bodyLarge,
    fontWeight: '700',
  },
});
