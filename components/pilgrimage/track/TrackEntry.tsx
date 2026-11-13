// Entry points to the walk recorder. Each owns its recorder subscription so
// the big screens around them do not re-render on every location batch.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { RoundHeaderButton } from '@/components/pilgrimage/detail/RoundHeaderButton';
import { formatDistanceKm } from '@/components/pilgrimage/detail/_helpers';
import { readableTextOn, ThemedButton } from '@/components/themed';
import { useTheme } from '@/context/ThemeContext';
import { useActiveTrack } from '@/hooks/useTrackRecording';
import { useT } from '@/libs/i18n';
import { WALK_RECORDING_SUPPORTED } from '@/libs/services/pilgrimage/track/track-recorder';

/** Home shortcut: "Start a walk", or the live status while one is recording. */
export function TrackShortcut() {
  const t = useT();
  const router = useRouter();
  const { theme } = useTheme();
  const active = useActiveTrack();
  if (!WALK_RECORDING_SUPPORTED) return null;
  const label = active
    ? `${t(active.status === 'paused' ? 'pilgrimage.track.paused' : 'pilgrimage.track.recording')} · ${formatDistanceKm(active.meters / 1000)}`
    : t('pilgrimage.track.entry');
  return (
    <ThemedButton
      size="sm"
      variant={active ? 'primary' : 'secondary'}
      label={label}
      icon={
        <Ionicons
          name="walk"
          size={16}
          color={active ? readableTextOn(theme.accent) : theme.text.primary}
        />
      }
      onPress={() => router.push('/pilgrimage/track')}
    />
  );
}

/** Work page header: filled while a walk is recording. */
export function TrackHeaderButton({ tint }: { tint: string }) {
  const t = useT();
  const router = useRouter();
  const { theme } = useTheme();
  const active = useActiveTrack();
  if (!WALK_RECORDING_SUPPORTED) return null;
  return (
    <RoundHeaderButton
      icon={active ? 'walk' : 'walk-outline'}
      onPress={() => router.push('/pilgrimage/track')}
      accessibilityLabel={t('pilgrimage.track.openA11y')}
      tint={tint}
      theme={theme}
    />
  );
}
