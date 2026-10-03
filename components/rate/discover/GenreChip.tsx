import { ThemedButton } from '../../themed';
import { useTranslatedGenre } from '../../../libs/i18n/use-translated-genre';
import type { Genre } from '../types';

export function GenreChip({ genre, onPress }: { genre: Genre; onPress: () => void }) {
  const label = useTranslatedGenre(genre.displayName);
  return <ThemedButton size="sm" variant="secondary" label={label.value} onPress={onPress} />;
}
