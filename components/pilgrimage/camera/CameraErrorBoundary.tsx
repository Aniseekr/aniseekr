import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedButton, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { Spacing } from '../../../constants/DesignSystem';

interface CameraErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface CameraErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface CameraErrorFallbackProps {
  onRetry: () => void;
}

function CameraErrorFallback({ onRetry }: CameraErrorFallbackProps) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.content}>
        <ThemedText variant="titleLarge">{t('pilgrimageUi.cameraNeedsRestart')}</ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary" style={styles.message}>
          {t('pilgrimageUi.cameraTemporarilyUnavailable')}
        </ThemedText>
        <ThemedButton
          size="lg"
          label={t('pilgrimageUi.restartCamera')}
          onPress={onRetry}
          fullWidth
        />
      </View>
    </View>
  );
}

export default class CameraErrorBoundary extends React.Component<
  CameraErrorBoundaryProps,
  CameraErrorBoundaryState
> {
  state: CameraErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(err: Error): CameraErrorBoundaryState {
    return { hasError: true, error: err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.warn('[CameraErrorBoundary]', err, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      // The raw Error.message is developer-facing — it is logged in
      // componentDidCatch, never shown. The fallback renders a localized,
      // generic message instead (Rule 11 + no leaked internals).
      return <CameraErrorFallback onRetry={this.handleReset} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: Spacing.md,
  },
  message: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
});
