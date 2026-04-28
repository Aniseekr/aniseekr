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
          {/* General */}
          <View>
            <Text style={styles.sectionTitle}>General</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem label="Profile" icon="person-outline" onPress={() => {}} />
              <View style={styles.separator} />
              <SettingItem
                label="Language"
                icon="language-outline"
                value="English"
                onPress={() => {}}
              />
            </GlassCard>
          </View>

          {/* Sync & Data */}
          <View>
            <Text style={styles.sectionTitle}>Sync & Data</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Browse Source"
                icon="cloud-outline"
                onPress={() => router.push('/(setting)/data-source')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Platform Sync"
                icon="git-branch-outline"
                onPress={() => router.push('/(setting)/sync')}
              />
              <View style={styles.separator} />
              <SettingItem label="Backup" icon="cloud-upload-outline" onPress={() => {}} />
              <View style={styles.separator} />
              <View style={styles.switchRow}>
                <View style={styles.rowLeft}>
                  <Ionicons name="cellular-outline" size={22} color={Colors.text.primary} />
                  <Text style={styles.rowLabel}>Data Saver</Text>
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

          {/* Otaku DNA */}
          <View>
            <Text style={styles.sectionTitle}>Otaku DNA</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem label="DNA Analysis" icon="finger-print-outline" onPress={() => {}} />
            </GlassCard>
          </View>

          {/* About */}
          <View>
            <Text style={styles.sectionTitle}>App</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem label="About" icon="information-circle-outline" onPress={() => {}} />
              <View style={styles.separator} />
              <SettingItem label="Help & Support" icon="help-circle-outline" onPress={() => {}} />
              <View style={styles.separator} />
              <SettingItem
                label="Log Out"
                icon="log-out-outline"
                color={Colors.error}
                onPress={() => {}}
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
