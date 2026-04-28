import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../components/common/GlassCard';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';

export default function SettingsScreen() {
  const { top } = useSafeAreaInsets();
  const [dataSaver, setDataSaver] = useState(false);
  const [notifications, setNotifications] = useState(true);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Account */}
          <View>
            <Text style={styles.sectionTitle}>Account</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Connected platforms"
                icon="people-circle-outline"
                onPress={() => router.push('/(setting)/account')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Otaku DNA"
                icon="finger-print-outline"
                onPress={() => router.push('/(setting)/otaku-dna')}
              />
            </GlassCard>
          </View>

          {/* Appearance */}
          <View>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Theme"
                icon="color-palette-outline"
                onPress={() => router.push('/(setting)/theme')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Title language priority"
                icon="language-outline"
                onPress={() => router.push('/(setting)/language-priority')}
              />
            </GlassCard>
          </View>

          {/* Sync & Data */}
          <View>
            <Text style={styles.sectionTitle}>Sync & Data</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Browse source"
                icon="cloud-outline"
                onPress={() => router.push('/(setting)/data-source')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Sync hub"
                icon="git-branch-outline"
                onPress={() => router.push('/(setting)/sync-hub')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Import wizard"
                icon="cloud-upload-outline"
                onPress={() => router.push('/(setting)/import-wizard')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Cache"
                icon="server-outline"
                onPress={() => router.push('/(setting)/cache')}
              />
              <View style={styles.separator} />
              <View style={styles.switchRow}>
                <View style={styles.rowLeft}>
                  <Ionicons name="cellular-outline" size={22} color={Colors.text.primary} />
                  <Text style={styles.rowLabel}>Data saver</Text>
                </View>
                <Switch
                  value={dataSaver}
                  onValueChange={setDataSaver}
                  trackColor={{ false: '#333', true: Colors.secondary }}
                  thumbColor={Colors.text.primary}
                />
              </View>
            </GlassCard>
          </View>

          {/* Notifications */}
          <View>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Reminders"
                icon="notifications-outline"
                onPress={() => router.push('/(setting)/notifications')}
              />
            </GlassCard>
          </View>

          {/* About */}
          <View>
            <Text style={styles.sectionTitle}>About</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Attribution"
                icon="ribbon-outline"
                onPress={() => router.push('/(setting)/attribution')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Privacy policy"
                icon="lock-closed-outline"
                onPress={() => router.push('/(setting)/privacy')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Terms of service"
                icon="document-text-outline"
                onPress={() => router.push('/(setting)/terms')}
              />
            </GlassCard>
          </View>

          <Text style={styles.versionText}>Aniseekr v1.0.0 (Expo)</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SettingItem({
  label,
  icon,
  value,
  color = Colors.text.primary,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value?: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.itemRow, pressed && { backgroundColor: Colors.glass.light }]}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.valueText}>{value}</Text>}
        <Ionicons name="chevron-forward" size={18} color={Colors.text.disabled} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
    backgroundColor: Colors.glass.light,
    borderRadius: Radius.full,
  },
  headerTitle: {
    color: Colors.text.primary,
    ...Typography.headlineSmall,
  },
  scrollView: {
    flex: 1,
    marginTop: Spacing.md,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
    gap: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.text.secondary,
    ...Typography.caption,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xxs,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.glass.border,
    marginLeft: 54, // Icon width + spacing
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowLabel: {
    color: Colors.text.primary,
    ...Typography.bodyLarge,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  valueText: {
    color: Colors.text.tertiary,
    ...Typography.bodyMedium,
  },
  versionText: {
    color: Colors.text.disabled,
    textAlign: 'center',
    ...Typography.caption,
    marginTop: Spacing.md,
  },
});
