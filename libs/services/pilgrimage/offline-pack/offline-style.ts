// Turns the online OpenFreeMap style into one that reads only from the
// on-device pack directory, so the map renders with no network at all.

export interface StyleLayerLike {
  id: string;
  type: string;
  source?: string;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StyleLike {
  version: number;
  sprite?: string;
  glyphs?: string;
  sources: Record<string, Record<string, unknown>>;
  layers: StyleLayerLike[];
  [key: string]: unknown;
}

/** Required OpenFreeMap attribution (openfreemap.org, "Attribution"). */
export const OFFLINE_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';

/**
 * Glyph ranges stored per font: Latin, Latin extended, Greek, Cyrillic (OSM
 * names in Japan include some — seen near Kakegawa on device), general
 * punctuation, letterlike symbols, CJK symbols + kana, fullwidth forms. CJK
 * ideographs are drawn by MapLibre's local ideograph rasterizer, so their ~80
 * ranges per font are not needed.
 */
export const OFFLINE_GLYPH_RANGES = [
  '0-255',
  '256-511',
  '768-1023',
  '1024-1279',
  '8192-8447',
  '8448-8703',
  '12288-12543',
  '65280-65535',
];

/** Directory-safe font name; the offline style references fonts by it. */
export function offlineFontDir(fontName: string): string {
  return fontName.replace(/[^A-Za-z0-9]+/g, '-');
}

/** Every font name the style's symbol layers use, as listed in the style. */
export function styleFonts(style: StyleLike): string[] {
  const fonts = new Set<string>();
  for (const layer of style.layers) {
    const value = layer.layout?.['text-font'];
    if (Array.isArray(value)) {
      for (const f of value) if (typeof f === 'string') fonts.add(f);
    }
  }
  return [...fonts];
}

/** Sprite base name (`…/sprites/ofm_f384/ofm` → `ofm`). */
export function spriteName(style: StyleLike): string | null {
  if (typeof style.sprite !== 'string') return null;
  const name = style.sprite.split('/').pop();
  return name && /^[A-Za-z0-9_-]+$/.test(name) ? name : null;
}

export function buildOfflineStyle(online: StyleLike, rootUri: string): StyleLike {
  const keptSources: StyleLike['sources'] = {};
  for (const [id, source] of Object.entries(online.sources)) {
    if (source.type !== 'vector') continue;
    keptSources[id] = {
      type: 'vector',
      tiles: [`${rootUri}/tiles/{z}/{x}/{y}.pbf`],
      minzoom: 0,
      maxzoom: 14,
      attribution: OFFLINE_ATTRIBUTION,
    };
  }
  const layers = online.layers
    .filter((layer) => !layer.source || layer.source in keptSources)
    .map((layer) => {
      const font = layer.layout?.['text-font'];
      if (!Array.isArray(font)) return { ...layer };
      return {
        ...layer,
        layout: {
          ...layer.layout,
          'text-font': font.map((f) => (typeof f === 'string' ? offlineFontDir(f) : f)),
        },
      };
    });
  const sprite = spriteName(online);
  const style: StyleLike = {
    ...online,
    sources: keptSources,
    layers,
    glyphs: `${rootUri}/glyphs/{fontstack}/{range}.pbf`,
  };
  if (sprite) style.sprite = `${rootUri}/sprites/${sprite}`;
  else delete style.sprite;
  return style;
}
