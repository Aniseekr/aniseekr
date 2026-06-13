// Drop-in replacement for `<Text>{anime.title}</Text>` in list rows and
// cards: renders the locale-aware display title (user's title-language
// priority + local name_cn enrichment) and re-renders when an enrichment
// lands or the language settings change. Style/numberOfLines pass through
// untouched, so call sites keep their own typography.

import { Text, type TextProps } from 'react-native';
import type { PlatformType } from '../../libs/services/auth/types';
import {
  useAnimeDisplayTitle,
  type DisplayTitleSource,
} from '../../libs/i18n/use-display-title';

export interface AnimeTitleTextProps extends Omit<TextProps, 'children'> {
  anime: DisplayTitleSource;
  /** ID space of `anime.id`; the legacy facade is AniList-backed. */
  platform?: PlatformType;
}

export function AnimeTitleText({ anime, platform, ...rest }: AnimeTitleTextProps) {
  const title = useAnimeDisplayTitle(anime, platform);
  return <Text {...rest}>{title}</Text>;
}
