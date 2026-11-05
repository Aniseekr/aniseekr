// Renders the Aniseekr mark chosen for an exported share image. `photo` sits
// on top of the user's shot; `page` sits on the album's own background. The
// free mark is the small Seekr logo, corner-sized like Gemini's sparkle.
import { View } from 'react-native';
import { ON_DARK, ThemedText, readableTextOn } from '../themed';
import { AniseekrLogo } from '../brand/AniseekrLogo';
import { Radius } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import type { BrandMarkStyle } from '../../libs/services/pilgrimage/share-brand-mark';

const LOGO_HEIGHT = 16;

const PHOTO_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
} as const;

function Logo() {
  return (
    <AniseekrLogo
      variant="mark"
      height={LOGO_HEIGHT}
      interactive={false}
      still
      style={{ opacity: 0.9 }}
    />
  );
}

export function BrandMark({
  style,
  dateline,
  accent,
  surface,
  pageInk,
}: {
  style: BrandMarkStyle;
  /** Pre-built "date · place" line (see `buildDateline`); may be empty. */
  dateline: string;
  accent: string;
  surface: 'photo' | 'page';
  /** Ink for the `page` surface (the album's tertiary text colour). */
  pageInk?: string;
}) {
  const t = useT();
  if (style === 'none') return null;
  if (style === 'logo') return <Logo />;

  if (style === 'seal') {
    // A small stamp: the logo and 「巡禮」 inside an accent frame, tilted.
    const sealInk = readableTextOn(accent);
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          backgroundColor: accent,
          borderRadius: Radius.sm,
          paddingLeft: 2,
          paddingRight: 4,
          paddingVertical: 1,
          transform: [{ rotate: '-6deg' }],
        }}>
        <Logo />
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={{ color: sealInk, letterSpacing: 1 }}>
          {t('pilgrimage.brandMark.sealCaption')}
        </ThemedText>
      </View>
    );
  }

  // dateline: "date · place" then the logo.
  const ink = surface === 'photo' ? ON_DARK : (pageInk ?? ON_DARK);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dateline ? (
        <ThemedText
          variant="captionSmall"
          weight="700"
          numberOfLines={1}
          style={surface === 'photo' ? { color: ink, ...PHOTO_SHADOW } : { color: ink }}>
          {dateline}
        </ThemedText>
      ) : null}
      <Logo />
    </View>
  );
}
