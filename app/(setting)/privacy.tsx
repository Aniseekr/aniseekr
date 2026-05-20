import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What we store locally',
    body: 'Aniseekr keeps your folders, ratings, theme choices, notification preferences, and OAuth tokens (in Keychain / EncryptedSharedPreferences) on your device. We do not run a backend, so nothing is uploaded to our servers.',
  },
  {
    title: 'Third-party platforms',
    body: 'When you connect AniList, MyAnimeList, Bangumi, Annict, Shikimori, Simkl, or Kitsu, requests go directly between your device and that platform. We do not proxy or log those requests. Disconnecting an account in Settings stops all syncing.',
  },
  {
    title: 'Notifications',
    body: 'Episode and achievement reminders are scheduled locally by iOS / Android — we do not push them from a server. We may register an Apple Push (APNs) or FCM token so the OS can deliver them, but the payload is generated on your device. Disabling notifications system-wide stops all reminders immediately.',
  },
  {
    title: 'Location',
    body: 'Pilgrimage features use your location only while you have the screen open to filter nearby anime spots. Coordinates stay on the device — they are never sent to our servers. Always-on background location is not requested.',
  },
  {
    title: 'Camera & photos',
    body: 'The pilgrimage comparison flow uses the camera to capture a scene and, with your permission, saves it to your Photos library so you can share it later. We do not upload photos. EXIF (including GPS, if present) is stripped before saving comparison shots.',
  },
  {
    title: 'Advertising (Google AdMob)',
    body: 'We show AdMob ads in some surfaces. We do not present an App Tracking Transparency (ATT) prompt, so AdMob operates without IDFA — ads are non-personalized and attribution uses Apple’s privacy-preserving SKAdNetwork. Google may still collect device-level signals; see Google’s privacy policy: https://policies.google.com/privacy.',
  },
  {
    title: 'Usage analytics (Microsoft Clarity)',
    body: 'We use Microsoft Clarity to understand how users interact with the app — taps, scroll depth, screen views, anonymized session recordings. Sensitive text fields are masked; OAuth tokens and PII are never recorded. Microsoft processes the data under its own privacy statement.',
  },
  {
    title: 'Crash reports',
    body: 'Crash logs surface only as on-device console output and never leave your phone unless you choose to share them.',
  },
  {
    title: 'Your data, your control',
    body: 'You can clear caches, delete folders, disconnect platforms, or revoke camera / photo / location / notification permissions at any time in iOS / Android settings. Uninstalling the app removes all locally stored data. Cleared data cannot be recovered.',
  },
  {
    title: 'Children’s privacy',
    body: 'Aniseekr is not directed at children under 13. We do not knowingly collect personal information from them. If you believe a child has provided data, contact us and we will remove it.',
  },
  {
    title: 'Contact',
    body: 'Questions about this policy: gm@aniseekr.moe',
  },
];

export default function PrivacyScreen() {
  const { theme } = useTheme();

  return (
    <SettingsScreenLayout title="Privacy policy" subtitle="What happens to your data">
      <Text style={[styles.lead, { color: theme.text.primary }]}>
        Aniseekr is built on the principle that your library belongs to you.
      </Text>
      {SECTIONS.map((section) => (
        <View
          key={section.title}
          style={[
            styles.card,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>{section.title}</Text>
          <Text style={[styles.body, { color: theme.text.secondary }]}>{section.body}</Text>
        </View>
      ))}
      <Text style={[styles.updated, { color: theme.text.tertiary }]}>
        Last updated: May 2026
      </Text>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  lead: {
    ...Typography.titleLarge,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  sectionTitle: {
    ...Typography.titleMedium,
  },
  body: {
    ...Typography.bodyMedium,
    lineHeight: 22,
  },
  updated: {
    ...Typography.captionSmall,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
