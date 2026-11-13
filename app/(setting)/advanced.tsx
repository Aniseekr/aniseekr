import { router } from 'expo-router';
import {
  SettingsRow,
  SettingsScreenLayout,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { useT } from '../../libs/i18n';

/** Diagnostics and developer tools — the pages a bug report or a designer needs. */
export default function AdvancedScreen() {
  const t = useT();
  return (
    <SettingsScreenLayout title={t('settings.advanced.title')}>
      <SettingsSection title={t('settings.advanced.section.diagnostics')} divided>
        <SettingsRow
          icon="photo-camera"
          label={t('settings.advanced.cameraDiagnostics')}
          onPress={() => router.push('/(setting)/camera-diagnostics')}
        />
      </SettingsSection>
      <SettingsSection title={t('settings.advanced.section.developer')} divided>
        <SettingsRow
          icon="widgets"
          label={t('settingsUi.designTokens')}
          onPress={() => router.push('/(setting)/design-tokens')}
        />
        <SettingsRow
          icon="visibility"
          label={t('settingsUi.livePreview')}
          onPress={() => router.push('/(setting)/theme-preview')}
        />
      </SettingsSection>
    </SettingsScreenLayout>
  );
}
