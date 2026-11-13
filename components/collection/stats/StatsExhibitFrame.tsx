import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing } from '../../../constants/DesignSystem';
import { ScreenHeader, ThemedIconButton } from '../../themed';
import { useT } from '../../../libs/i18n';

interface Props {
  title: string;
  children: ReactNode;
  onShare?: () => void;
  contentPaddingBottom?: number;
  scrollable?: boolean;
}

export function StatsExhibitFrame({
  title,
  children,
  onShare,
  contentPaddingBottom,
  scrollable = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();

  const body = (
    <View style={[styles.content, { paddingBottom: contentPaddingBottom ?? insets.bottom + 120 }]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader
          title={title}
          right={
            onShare ? (
              <ThemedIconButton
                accessibilityLabel={t('collectionUi.shareWithFriends')}
                size={40}
                icon={(color) => <MaterialIcons name="ios-share" size={18} color={color} />}
                onPress={onShare}
              />
            ) : undefined
          }
        />
        {scrollable ? <ScrollView showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    gap: Spacing.md,
  },
});
