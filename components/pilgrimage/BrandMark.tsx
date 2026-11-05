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

/**
 * Seekr's head is dark with an outline. On a photo the outline is always the
 * light ink, so the mark reads on both bright and dark shots (dark body on
 * light, light outline on dark). On the album page it follows the page ink.
 */
function Logo({ ink }: { ink: string }) {
  return (
    <AniseekrLogo
      variant="mark"
      height={LOGO_HEIGHT}
      interactive={false}
      still
      inkColor={ink}
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
  const ink = surface === 'photo' ? ON_DARK : (pageInk ?? ON_DARK);
  if (style === 'logo') return <Logo ink={ink} />;

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
        <Logo ink={ON_DARK} />
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
      <Logo ink={ink} />
    </View>
  );
}
