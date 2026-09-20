import { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SheetBackdrop, ThemedButton, ThemedSurface, ThemedText } from '../themed';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Shadow, Spacing } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import type { ExperienceMode } from '../../libs/navigation/experience-tabs';

interface ExperienceModeSwitcherProps {
  mode: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
}

const MODE_ORDER: readonly ExperienceMode[] = ['explorer', 'collector', 'seeker'];

export function ExperienceModeSwitcher({ mode, onChange }: ExperienceModeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const modeLabel = t(`tabs.profileScreen.experienceMode.${mode}`);
  const styles = useMemo(() => makeStyles(top), [top]);

  const handleSelect = (next: ExperienceMode) => {
    setOpen(false);
    if (next !== mode) onChange(next);
  };

  return (
    <>
      <ThemedButton
        label={`AniSeekr · ${modeLabel}`}
        accessibilityLabel={t('tabs.profileScreen.experienceMode.menuA11y')}
        onPress={() => {
          setOpen(true);
        }}
        variant="secondary"
        size="md"
        shape="pill"
        haptic="tap"
        iconRight={<Ionicons name="chevron-down" size={15} color={theme.text.secondary} />}
        style={styles.trigger}
      />

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <SheetBackdrop onPress={() => setOpen(false)} />
          <ThemedSurface
            variant="sheet"
            radius={Radius.card}
            style={[styles.menu, { borderColor: theme.glassBorder }]}>
            <ThemedText variant="titleMedium" weight="700" style={styles.menuTitle}>
              {t('tabs.profileScreen.experienceMode.choose')}
            </ThemedText>

            {MODE_ORDER.map((candidate) => {
              const selected = candidate === mode;
              return (
                <View key={candidate} style={styles.modeOption}>
                  <ThemedButton
                    label={t(`tabs.profileScreen.experienceMode.${candidate}`)}
                    accessibilityLabel={t(`tabs.profileScreen.experienceMode.${candidate}`)}
                    onPress={() => handleSelect(candidate)}
                    variant={selected ? 'outline' : 'secondary'}
                    shape="rounded"
                    fullWidth
                    haptic="selection"
                    icon={
                      <ModeIcon
                        mode={candidate}
                        color={selected ? theme.accent : theme.text.secondary}
                      />
                    }
                    iconRight={
                      selected ? (
                        <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                      ) : undefined
                    }
                  />
                  <ThemedText variant="bodySmall" tone="secondary" style={styles.modeDescription}>
                    {t(`tabs.profileScreen.experienceMode.${candidate}Description`)}
                  </ThemedText>
                </View>
              );
            })}
          </ThemedSurface>
        </View>
      </Modal>
    </>
  );
}

function ModeIcon({ mode, color }: { mode: ExperienceMode; color: string }) {
  if (mode === 'explorer') return <MaterialIcons name="explore" size={22} color={color} />;
  if (mode === 'collector')
    return <MaterialIcons name="collections-bookmark" size={21} color={color} />;
  return <Ionicons name="sparkles" size={20} color={color} />;
}

const makeStyles = (safeTop: number) =>
  StyleSheet.create({
    trigger: {
      minWidth: 164,
    },
    backdrop: {
      flex: 1,
      paddingTop: safeTop + 66,
      paddingHorizontal: Spacing.screenPadding,
      alignItems: 'center',
    },
    menu: {
      width: '100%',
      maxWidth: 420,
      padding: Spacing.md,
      gap: Spacing.sm,
      ...Shadow.heavy,
    },
    menuTitle: {
      paddingHorizontal: Spacing.xs,
      paddingBottom: Spacing.xxs,
    },
    modeOption: {
      gap: Spacing.xs,
    },
    modeDescription: {
      paddingHorizontal: Spacing.sm,
    },
  });
