import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import type { ShareTemplate } from '../../libs/services/collection/share-templates';
import { useT } from '../../libs/i18n';
import { readableTextOn } from '../themed';

interface ShareTemplateCardProps {
  template: ShareTemplate;
  active?: boolean;
  onSelect: (template: ShareTemplate) => void;
}

function ShareTemplateCardComponent({ template, active, onSelect }: ShareTemplateCardProps) {
  const { theme } = useTheme();
  const t = useT();
  const onAccent = readableTextOn(theme.accent);

  return (
    <Pressable
      onPress={() => {
        hapticsBridge.selection();
        onSelect(template);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: active ? theme.accent : theme.background.secondary,
          borderColor: active ? theme.accent : theme.glassBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.row}>
        <Ionicons name={template.icon} size={22} color={active ? onAccent : theme.text.secondary} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: active ? onAccent : theme.text.primary }]}>
            {t(template.titleKey)}
          </Text>
          <Text
            style={[
              styles.description,
              { color: active ? onAccent : theme.text.secondary, opacity: active ? 0.75 : 1 },
            ]}
            numberOfLines={2}>
            {t(template.descriptionKey)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: {
    flex: 1,
  },
  title: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  description: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
});

export const ShareTemplateCard = memo(ShareTemplateCardComponent);
