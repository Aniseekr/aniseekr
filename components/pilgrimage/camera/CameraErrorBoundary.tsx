import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedButton, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
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
  message: string;
  onRetry: () => void;
}

function CameraErrorFallback({ message, onRetry }: CameraErrorFallbackProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.content}>
        <ThemedText variant="titleLarge">相機需要重新啟動</ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary" style={styles.message}>
          {message}
        </ThemedText>
        <ThemedButton size="lg" label="重新啟動相機" onPress={onRetry} fullWidth />
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
      const message = this.state.error?.message ?? '相機暫時無法使用';
      return <CameraErrorFallback message={message} onRetry={this.handleReset} />;
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
