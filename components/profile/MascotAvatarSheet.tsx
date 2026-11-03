import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { ThemedBottomSheet, ThemedText } from '../themed';
import { SEEKR_POSES } from '../brand/SeekrPose';
import { Radius, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { PROFILE_MASCOTS, type ProfileMascot } from '../../libs/services/user-prefs';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

/** Pick which Seekr pose stands in for the avatar. Four thumbnails, one tap. */
export function MascotAvatarSheet({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: ProfileMascot;
  onSelect: (mascot: ProfileMascot) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <ThemedBottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <ThemedText variant="headlineSmall">{t('tabs.profileScreen.pickAvatar')}</ThemedText>
        <View style={styles.row}>
          {PROFILE_MASCOTS.map((pose) => {
            const active = pose === value;
            return (
              <Pressable
                key={pose}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={pose}
                onPress={() => {
                  hapticsBridge.selection();
                  onSelect(pose);
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: active ? theme.accent : theme.glassBorder,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <Image source={SEEKR_POSES[pose]} style={styles.pose} contentFit="contain" />
              </Pressable>
            );
          })}
        </View>
      </View>
    </ThemedBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingBottom: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.sm },
  option: {
    flex: 1,
    aspectRatio: 0.9,
    minHeight: Size.minTouchTarget,
    borderRadius: Radius.card,
    borderWidth: 2,
    padding: Spacing.xs,
  },
  pose: { flex: 1 },
});
