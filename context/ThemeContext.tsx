import React, { createContext, use, useCallback, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import type { AppIconName } from '../libs/brand/app-icon';
import { kvGet, kvSet } from '../libs/services/storage/app-storage';
import {
  THEME_CUSTOM_ACCENT_KEY,
  THEME_GRANDFATHERED_KEY,
  THEME_ID_KEY,
  THEME_INCREASE_CONTRAST_KEY,
  THEME_MODE_KEY,
  THEME_RECENT_ACCENTS_KEY,
  THEME_TINT_INTENSITY_KEY,
} from '../libs/services/storage/keys';

const MAX_RECENT_ACCENTS = 6;

export type ThemeMode = 'light' | 'dark' | 'auto';
export type TintIntensity = 'subtle' | 'balanced' | 'vivid';
const TINT_INTENSITY_VALUES: Record<TintIntensity, number> = {
  subtle: 0.25,
  balanced: 0.5,
  vivid: 0.85,
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeHex(input: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (s.length === 4) {
    // expand #abc -> #aabbcc
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return HEX_RE.test(s) ? s.toUpperCase() : null;
}

function adjustHex(hex: string, percent: number): string {
  const m = HEX_RE.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  const f = percent / 100;
  const adj = (c: number) => (f >= 0 ? c + (255 - c) * f : c + c * f);
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`.toUpperCase();
}

export interface AccentPreset {
  name: string;
  hex: string;
}
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Orange', hex: '#FF9900' },
  { name: 'Red', hex: '#FF3B30' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Green', hex: '#32D74B' },
  { name: 'Cyan', hex: '#00BCD4' },
  { name: 'Blue', hex: '#007AFF' },
  { name: 'Purple', hex: '#AF52DE' },
  { name: 'Pink', hex: '#E8A0BF' },
];

export interface AccentGradient {
  id: 'sunset' | 'ocean' | 'bloom';
  name: string;
  subtitle: string;
  colors: [string, string];
}
export const ACCENT_GRADIENTS: AccentGradient[] = [
  { id: 'sunset', name: 'Sunset', subtitle: 'Orange → Red', colors: ['#FF9900', '#FF3B30'] },
  { id: 'ocean', name: 'Ocean', subtitle: 'Cyan → Blue', colors: ['#00BCD4', '#007AFF'] },
  { id: 'bloom', name: 'Bloom', subtitle: 'Purple → Pink', colors: ['#AF52DE', '#E8A0BF'] },
];

export type ThemeId =
  | 'aniseeker'
  | 'cyberpunk'
  | 'midnight'
  | 'forest'
  | 'ocean'
  | 'attackOnTitan'
  | 'sunset'
  | 'candy'
  | 'washi'
  | 'screentone'
  | 'twilight'
  | 'yozakura'
  | 'cel'
  | 'natsuzora';

export interface ThemeStatus {
  success: string;
  warning: string;
  error: string;
  info: string;
}

/** Tiled texture drawn inside `ThemedSurface`; see `components/themed/SkinTexture.tsx`. */
export type SkinTextureKind = 'washi' | 'halftone' | 'grain' | 'scanline' | 'petals' | 'clouds';
/**
 * Card edge: `ink` = full-ink manga panel line, `seal` = vermilion-seal frame
 * in the accent, `glass` = soft accent-tinted hairline.
 */
export type SkinEdge = 'ink' | 'glass' | 'seal';
/** Display faces bundled for skins (all OFL); resolved in `constants/DesignSystem` `SkinFont`. */
export type SkinFontId = 'serif' | 'comic' | 'retro';

/**
 * The non-colour half of a premium theme. Optional: free themes have none and
 * render exactly as before. Read through the themed primitives
 * (`ThemedSurface`, `ThemedText` display/headline variants, `chartRamp`) —
 * screens never branch on it.
 */
export interface ThemeSkin {
  texture: {
    kind: SkinTextureKind;
    /** Tint source: ink = text.primary, accent = accent, paper = background.primary. */
    tone: 'ink' | 'accent' | 'paper';
    opacity: number;
  };
  /** Latin display face for display/headline text; CJK keeps the system face. */
  displayFont?: SkinFontId;
  edge: SkinEdge;
  /** Five chart colours, in collection-status order (watching → dropped). */
  chartRamp: readonly [string, string, string, string, string];
  /** Matching alternate app icon (`app/(setting)/app-icon.tsx`). */
  appIcon?: AppIconName;
}

export interface ThemePalette {
  id: ThemeId;
  name: string;
  isPremium?: boolean;
  skin?: ThemeSkin;
  accent: string;
  accentLight: string;
  accentDark: string;
  secondary: string;
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  glassBorder: string;
  gradient: [string, string, ...string[]];
  status: ThemeStatus;
}

// System-level semantic colors. Themes inherit these unless they override —
// shipped as a single source so ThemedText/Button can read theme.status.error
// instead of hardcoding hex per call site.
const DEFAULT_STATUS: ThemeStatus = {
  success: '#30D158',
  warning: '#FF9F0A',
  error: '#FF453A',
  info: '#0A84FF',
};

// Seekr the mascot is artwork, not UI: his body, headband and lemon eye stay
// the same under every theme (same values as the v6 landing brand.json).
export const SEEKR_COLORS = {
  body: '#0B0C10',
  band: '#2A2D36',
  eye: '#1B1E28',
  iris: '#FFD966',
  outline: '#F4F1EA',
  shine: '#FFFFFF',
} as const;

export const THEMES: Record<ThemeId, ThemePalette> = {
  aniseeker: {
    id: 'aniseeker',
    name: 'Aniseekr',
    accent: '#FF9F0A',
    accentLight: '#FFB340',
    accentDark: '#E08E09',
    secondary: '#BF5AF2',
    background: {
      primary: '#080808',
      secondary: '#1C1C1E',
      tertiary: '#2C2C2E',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(235, 235, 245, 0.6)',
      tertiary: 'rgba(235, 235, 245, 0.3)',
    },
    glassBorder: 'rgba(255, 255, 255, 0.10)',
    gradient: ['#0F0F10', '#1C1C1E', '#0F0F10'],
    status: DEFAULT_STATUS,
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    isPremium: true,
    accent: '#FF2A6D',
    accentLight: '#FF6BA0',
    accentDark: '#D81E5B',
    secondary: '#05D9E8',
    background: {
      primary: '#0A0014',
      secondary: '#150024',
      tertiary: '#1F0033',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(231, 198, 255, 0.7)',
      tertiary: 'rgba(231, 198, 255, 0.4)',
    },
    glassBorder: 'rgba(255, 42, 109, 0.18)',
    gradient: ['#0A0014', '#150024', '#0A0014'],
    status: { ...DEFAULT_STATUS, info: '#05D9E8' },
    skin: {
      texture: { kind: 'scanline', tone: 'accent', opacity: 0.08 },
      edge: 'glass',
      chartRamp: ['#FF2A6D', '#05D9E8', '#B967FF', '#FFE66D', '#7A5CFF'],
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    accent: '#5E5CE6',
    accentLight: '#7D7CFF',
    accentDark: '#4845B3',
    secondary: '#64D2FF',
    background: {
      primary: '#070712',
      secondary: '#101025',
      tertiary: '#1A1A33',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(220, 220, 240, 0.65)',
      tertiary: 'rgba(220, 220, 240, 0.35)',
    },
    glassBorder: 'rgba(94, 92, 230, 0.18)',
    gradient: ['#070712', '#101025', '#070712'],
    status: { ...DEFAULT_STATUS, info: '#64D2FF' },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    accent: '#10B981',
    accentLight: '#34D399',
    accentDark: '#059669',
    secondary: '#A3E635',
    background: {
      primary: '#06120A',
      secondary: '#0E2018',
      tertiary: '#143025',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(220, 245, 230, 0.65)',
      tertiary: 'rgba(220, 245, 230, 0.35)',
    },
    glassBorder: 'rgba(16, 185, 129, 0.18)',
    gradient: ['#06120A', '#0E2018', '#06120A'],
    status: DEFAULT_STATUS,
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    accent: '#06B6D4',
    accentLight: '#67E8F9',
    accentDark: '#0891B2',
    secondary: '#8B5CF6',
    background: {
      primary: '#04101A',
      secondary: '#0A1F30',
      tertiary: '#0F2D44',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(220, 240, 255, 0.65)',
      tertiary: 'rgba(220, 240, 255, 0.35)',
    },
    glassBorder: 'rgba(6, 182, 212, 0.18)',
    gradient: ['#04101A', '#0A1F30', '#04101A'],
    status: DEFAULT_STATUS,
  },
  attackOnTitan: {
    id: 'attackOnTitan',
    // Display name only: the id stays `attackOnTitan` so saved prefs resolve.
    name: 'Frontier',
    isPremium: true,
    accent: '#8B4513',
    accentLight: '#C68642',
    accentDark: '#5D2E0E',
    secondary: '#A8B5A0',
    background: {
      primary: '#0E0A06',
      secondary: '#1A130C',
      tertiary: '#241B11',
    },
    text: {
      primary: '#F5E6D3',
      secondary: 'rgba(245, 230, 211, 0.65)',
      tertiary: 'rgba(245, 230, 211, 0.35)',
    },
    glassBorder: 'rgba(198, 134, 66, 0.20)',
    gradient: ['#0E0A06', '#1A130C', '#0E0A06'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'grain', tone: 'ink', opacity: 0.08 },
      edge: 'ink',
      chartRamp: ['#C68642', '#A8B5A0', '#8B4513', '#E0C9A6', '#6E7B67'],
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    accent: '#FB923C',
    accentLight: '#FDBA74',
    accentDark: '#EA580C',
    secondary: '#EC4899',
    background: {
      primary: '#180A06',
      secondary: '#28140C',
      tertiary: '#3A1D11',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 230, 215, 0.65)',
      tertiary: 'rgba(255, 230, 215, 0.35)',
    },
    glassBorder: 'rgba(251, 146, 60, 0.20)',
    gradient: ['#180A06', '#28140C', '#180A06'],
    status: DEFAULT_STATUS,
  },
  candy: {
    id: 'candy',
    name: 'Candy',
    accent: '#F472B6',
    accentLight: '#F9A8D4',
    accentDark: '#DB2777',
    secondary: '#A78BFA',
    background: {
      primary: '#180614',
      secondary: '#26092A',
      tertiary: '#36103D',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 220, 240, 0.65)',
      tertiary: 'rgba(255, 220, 240, 0.35)',
    },
    glassBorder: 'rgba(244, 114, 182, 0.20)',
    gradient: ['#180614', '#26092A', '#180614'],
    status: DEFAULT_STATUS,
  },

  // ── Premium pack (2026-11). Original palettes, no third-party IP. ──
  washi: {
    id: 'washi',
    name: 'Washi',
    isPremium: true,
    accent: '#D9452F',
    accentLight: '#E8735F',
    accentDark: '#B23422',
    secondary: '#C9A35A',
    background: {
      primary: '#15120E',
      secondary: '#201B15',
      tertiary: '#2C261E',
    },
    text: {
      primary: '#F3ECDD',
      secondary: 'rgba(243, 236, 221, 0.66)',
      tertiary: 'rgba(243, 236, 221, 0.38)',
    },
    glassBorder: 'rgba(217, 69, 47, 0.22)',
    gradient: ['#15120E', '#1E1913', '#15120E'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'washi', tone: 'ink', opacity: 0.09 },
      displayFont: 'serif',
      edge: 'seal',
      chartRamp: ['#D9452F', '#3F6E8C', '#C9A35A', '#7C8F4E', '#8A8178'],
      appIcon: 'Washi',
    },
  },
  screentone: {
    id: 'screentone',
    name: 'Screentone',
    isPremium: true,
    accent: '#0091C2',
    accentLight: '#3DB4DE',
    accentDark: '#006F96',
    secondary: '#B5B5B0',
    background: {
      primary: '#0B0B0B',
      secondary: '#161616',
      tertiary: '#222222',
    },
    text: {
      primary: '#F4F4F0',
      secondary: 'rgba(244, 244, 240, 0.64)',
      tertiary: 'rgba(244, 244, 240, 0.36)',
    },
    glassBorder: 'rgba(244, 244, 240, 0.16)',
    gradient: ['#0B0B0B', '#141414', '#0B0B0B'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'halftone', tone: 'ink', opacity: 0.12 },
      displayFont: 'comic',
      edge: 'ink',
      chartRamp: ['#0091C2', '#A6A6A6', '#6E6E6E', '#C9C9C9', '#4A4A4A'],
      appIcon: 'Screentone',
    },
  },
  twilight: {
    id: 'twilight',
    name: 'Twilight Platform',
    isPremium: true,
    accent: '#FF8A3D',
    accentLight: '#FFAD73',
    accentDark: '#E06A1F',
    secondary: '#9A7BFF',
    background: {
      primary: '#150E24',
      secondary: '#211634',
      tertiary: '#2D1F45',
    },
    text: {
      primary: '#FFF2E8',
      secondary: 'rgba(255, 242, 232, 0.66)',
      tertiary: 'rgba(255, 242, 232, 0.38)',
    },
    glassBorder: 'rgba(255, 138, 61, 0.20)',
    gradient: ['#2A1430', '#1C1230', '#150E24'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'scanline', tone: 'accent', opacity: 0.07 },
      edge: 'glass',
      chartRamp: ['#FF8A3D', '#FF5E7A', '#C25BD6', '#8A6CFF', '#4F5BD5'],
      appIcon: 'Twilight',
    },
  },
  yozakura: {
    id: 'yozakura',
    name: 'Yozakura',
    isPremium: true,
    accent: '#F28DB7',
    accentLight: '#F8B5D1',
    accentDark: '#D9648F',
    secondary: '#8FA6FF',
    background: {
      primary: '#0A0F26',
      secondary: '#121A38',
      tertiary: '#1B254C',
    },
    text: {
      primary: '#F8EEF4',
      secondary: 'rgba(248, 238, 244, 0.66)',
      tertiary: 'rgba(248, 238, 244, 0.38)',
    },
    glassBorder: 'rgba(242, 141, 183, 0.20)',
    gradient: ['#0A0F26', '#141B3C', '#0A0F26'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'petals', tone: 'accent', opacity: 0.16 },
      displayFont: 'serif',
      edge: 'glass',
      chartRamp: ['#F28DB7', '#8FA6FF', '#C9B6FF', '#FFD6E6', '#5C6BC0'],
      appIcon: 'Yozakura',
    },
  },
  cel: {
    id: 'cel',
    name: 'Cel',
    isPremium: true,
    accent: '#FF6B57',
    accentLight: '#FF9A8A',
    accentDark: '#E04A37',
    secondary: '#3BB8A6',
    background: {
      primary: '#191A2C',
      secondary: '#24253D',
      tertiary: '#30324F',
    },
    text: {
      primary: '#FBF3E2',
      secondary: 'rgba(251, 243, 226, 0.66)',
      tertiary: 'rgba(251, 243, 226, 0.38)',
    },
    glassBorder: 'rgba(251, 243, 226, 0.16)',
    gradient: ['#191A2C', '#22233A', '#191A2C'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'grain', tone: 'ink', opacity: 0.1 },
      displayFont: 'retro',
      edge: 'ink',
      chartRamp: ['#FF6B57', '#3BB8A6', '#F2C14E', '#7B6CD9', '#5AA9E6'],
      appIcon: 'Cel',
    },
  },
  natsuzora: {
    id: 'natsuzora',
    name: 'Natsuzora',
    isPremium: true,
    accent: '#2F8FF5',
    accentLight: '#6DB1FF',
    accentDark: '#1A6FD1',
    secondary: '#FFD24D',
    background: {
      primary: '#06182E',
      secondary: '#0D2542',
      tertiary: '#153356',
    },
    text: {
      primary: '#F4FAFF',
      secondary: 'rgba(244, 250, 255, 0.68)',
      tertiary: 'rgba(244, 250, 255, 0.38)',
    },
    glassBorder: 'rgba(109, 177, 255, 0.22)',
    gradient: ['#0B2A4D', '#081F3A', '#06182E'],
    status: DEFAULT_STATUS,
    skin: {
      texture: { kind: 'clouds', tone: 'paper', opacity: 0.7 },
      edge: 'glass',
      chartRamp: ['#2F8FF5', '#FFD24D', '#6DD3C7', '#9FB7FF', '#FF8F6B'],
      appIcon: 'Natsuzora',
    },
  },
};

const THEME_LIST: ThemePalette[] = Object.values(THEMES);

/** Chart colours for free themes — the collection-status colours stats always used. */
const DEFAULT_CHART_RAMP: ThemeSkin['chartRamp'] = [
  DEFAULT_STATUS.success,
  DEFAULT_STATUS.info,
  '#5E5CE6',
  DEFAULT_STATUS.warning,
  DEFAULT_STATUS.error,
];

/** Five chart colours for the active theme: the skin's ramp, else the default. */
export function chartRamp(theme: ThemePalette): ThemeSkin['chartRamp'] {
  return theme.skin?.chartRamp ?? DEFAULT_CHART_RAMP;
}

/**
 * Grandfathering. Until 1.3.0 `PREMIUM_ENABLED` was off and everyone counted
 * as Pro, so people may already sit on a premium theme they never paid for.
 * The first launch that runs this records that theme once (or '' when the
 * saved theme is free); after that the record never changes. Returns the
 * value to store: `recorded` untouched when the migration already ran.
 */
export function resolveGrandfatheredTheme(
  storedThemeId: string | null,
  recorded: string | null
): string {
  if (recorded !== null) return recorded;
  if (storedThemeId && storedThemeId in THEMES && THEMES[storedThemeId as ThemeId].isPremium) {
    return storedThemeId;
  }
  return '';
}

/**
 * Whether a theme can be picked: free themes, any theme for Pro, the theme in
 * use right now (never lock someone out of what they are looking at), and the
 * one grandfathered premium theme.
 */
export function isThemeUnlocked(
  palette: ThemePalette,
  opts: { isPro: boolean; activeThemeId: ThemeId; grandfatheredThemeId: string }
): boolean {
  return (
    !palette.isPremium ||
    opts.isPro ||
    palette.id === opts.activeThemeId ||
    palette.id === opts.grandfatheredThemeId
  );
}

// Light-mode surfaces per theme — accent / accentLight / accentDark / secondary
// / status stay shared with the dark palette, so the theme still has a single
// identity. Only background / text / glassBorder / gradient swap.
interface SurfacePalette {
  background: ThemePalette['background'];
  text: ThemePalette['text'];
  glassBorder: string;
  gradient: ThemePalette['gradient'];
}

const LIGHT_TEXT_NEUTRAL = {
  primary: '#0E0E12',
  secondary: 'rgba(15,15,22,0.62)',
  tertiary: 'rgba(15,15,22,0.40)',
};

const THEME_LIGHT_SURFACES: Record<ThemeId, SurfacePalette> = {
  aniseeker: {
    background: { primary: '#FFFBF3', secondary: '#FFF3DF', tertiary: '#FFE9C7' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(15,15,22,0.10)',
    gradient: ['#FFFEFA', '#FFF5E4', '#FFFEFA'],
  },
  cyberpunk: {
    background: { primary: '#FFF5F8', secondary: '#FCE5EE', tertiary: '#F9D2DF' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(255, 42, 109, 0.20)',
    gradient: ['#FFF9FB', '#FCE7EF', '#FFF9FB'],
  },
  midnight: {
    background: { primary: '#F5F5FE', secondary: '#E7E7FB', tertiary: '#D8D8F6' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(94, 92, 230, 0.20)',
    gradient: ['#F9F9FF', '#E8E8FB', '#F9F9FF'],
  },
  forest: {
    background: { primary: '#F1FAF6', secondary: '#DFF4EA', tertiary: '#C8ECD9' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(16, 185, 129, 0.20)',
    gradient: ['#F6FBF8', '#E1F5EC', '#F6FBF8'],
  },
  ocean: {
    background: { primary: '#F0FAFD', secondary: '#DBF3FA', tertiary: '#BFE9F4' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(6, 182, 212, 0.20)',
    gradient: ['#F4FBFE', '#DEF4FA', '#F4FBFE'],
  },
  attackOnTitan: {
    background: { primary: '#FBF5EC', secondary: '#F2E6CF', tertiary: '#E8D5B0' },
    text: {
      primary: '#26190A',
      secondary: 'rgba(38,25,10,0.62)',
      tertiary: 'rgba(38,25,10,0.40)',
    },
    glassBorder: 'rgba(139, 69, 19, 0.22)',
    gradient: ['#FDFAF3', '#F1E5CD', '#FDFAF3'],
  },
  sunset: {
    background: { primary: '#FFF6EE', secondary: '#FFE7D2', tertiary: '#FFD4B0' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(251, 146, 60, 0.22)',
    gradient: ['#FFFAF4', '#FFE9D3', '#FFFAF4'],
  },
  candy: {
    background: { primary: '#FFF3F9', secondary: '#FDE2F0', tertiary: '#FACEE2' },
    text: LIGHT_TEXT_NEUTRAL,
    glassBorder: 'rgba(244, 114, 182, 0.22)',
    gradient: ['#FFF8FB', '#FEE5F2', '#FFF8FB'],
  },
  washi: {
    background: { primary: '#F5EFE1', secondary: '#ECE3CF', tertiary: '#E1D5BA' },
    text: {
      primary: '#1C1813',
      secondary: 'rgba(28,24,19,0.64)',
      tertiary: 'rgba(28,24,19,0.42)',
    },
    glassBorder: 'rgba(178, 52, 34, 0.24)',
    gradient: ['#F8F3E7', '#EEE6D3', '#F8F3E7'],
  },
  screentone: {
    background: { primary: '#FFFFFF', secondary: '#F1F1EE', tertiary: '#E3E3DE' },
    text: {
      primary: '#0B0B0B',
      secondary: 'rgba(11,11,11,0.64)',
      tertiary: 'rgba(11,11,11,0.42)',
    },
    glassBorder: 'rgba(11,11,11,0.18)',
    gradient: ['#FFFFFF', '#F3F3F0', '#FFFFFF'],
  },
  twilight: {
    background: { primary: '#FFF3EA', secondary: '#FCE2D4', tertiary: '#F3D0C8' },
    text: {
      primary: '#1F1430',
      secondary: 'rgba(31,20,48,0.64)',
      tertiary: 'rgba(31,20,48,0.42)',
    },
    glassBorder: 'rgba(154, 123, 255, 0.24)',
    gradient: ['#FFE9DA', '#FBEAF0', '#EFE6FF'],
  },
  yozakura: {
    background: { primary: '#FFF5F9', secondary: '#FBE5EE', tertiary: '#F4D2E0' },
    text: {
      primary: '#141A3A',
      secondary: 'rgba(20,26,58,0.64)',
      tertiary: 'rgba(20,26,58,0.42)',
    },
    glassBorder: 'rgba(217, 100, 143, 0.24)',
    gradient: ['#FFF9FB', '#FBE7F0', '#FFF9FB'],
  },
  cel: {
    background: { primary: '#FBF3E2', secondary: '#F3E5C8', tertiary: '#E9D6AE' },
    text: {
      primary: '#191A2C',
      secondary: 'rgba(25,26,44,0.64)',
      tertiary: 'rgba(25,26,44,0.42)',
    },
    glassBorder: 'rgba(25,26,44,0.20)',
    gradient: ['#FDF8EC', '#F4E7CB', '#FDF8EC'],
  },
  natsuzora: {
    background: { primary: '#F2F8FF', secondary: '#DFEEFF', tertiary: '#C9E1FF' },
    text: {
      primary: '#0A2240',
      secondary: 'rgba(10,34,64,0.64)',
      tertiary: 'rgba(10,34,64,0.42)',
    },
    glassBorder: 'rgba(47, 143, 245, 0.24)',
    gradient: ['#CFE6FF', '#EAF4FF', '#FFFFFF'],
  },
};

interface ThemeContextValue {
  theme: ThemePalette;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => Promise<void>;
  hydrated: boolean;
  themes: ThemePalette[];
  customAccent: string | null;
  setCustomAccent: (hex: string | null) => Promise<void>;
  recentAccents: string[];
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  /**
   * Resolved mode after auto → OS scheme. Consumers that need to pick e.g. a
   * BlurView tint should read this, not {@link themeMode}.
   */
  effectiveMode: 'light' | 'dark';
  tintIntensity: TintIntensity;
  setTintIntensity: (t: TintIntensity) => Promise<void>;
  increaseContrast: boolean;
  setIncreaseContrast: (v: boolean) => Promise<void>;
  /** Premium theme kept from the free era ('' = none). See {@link resolveGrandfatheredTheme}. */
  grandfatheredThemeId: string;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface StoredTheme {
  themeId: ThemeId;
  customAccent: string | null;
  recentAccents: string[];
  themeMode: ThemeMode;
  tintIntensity: TintIntensity;
  increaseContrast: boolean;
  grandfatheredThemeId: string;
}

/**
 * Synchronously read the persisted theme from MMKV. Used to seed the provider
 * state on the first frame so the app paints in the user's theme immediately —
 * no flash of the default palette while an async read resolves.
 */
function readStoredTheme(): StoredTheme {
  const result: StoredTheme = {
    themeId: 'aniseeker',
    customAccent: null,
    recentAccents: [],
    themeMode: 'dark',
    tintIntensity: 'balanced',
    increaseContrast: false,
    grandfatheredThemeId: '',
  };
  try {
    const storedTheme = kvGet(THEME_ID_KEY);
    if (storedTheme && storedTheme in THEMES) result.themeId = storedTheme as ThemeId;

    const recorded = kvGet(THEME_GRANDFATHERED_KEY);
    result.grandfatheredThemeId = resolveGrandfatheredTheme(storedTheme, recorded);
    if (recorded === null) kvSet(THEME_GRANDFATHERED_KEY, result.grandfatheredThemeId);

    const storedAccent = kvGet(THEME_CUSTOM_ACCENT_KEY);
    if (storedAccent) {
      const norm = normalizeHex(storedAccent);
      if (norm) result.customAccent = norm;
    }

    const storedRecent = kvGet(THEME_RECENT_ACCENTS_KEY);
    if (storedRecent) {
      try {
        const parsed = JSON.parse(storedRecent) as unknown;
        if (Array.isArray(parsed)) {
          result.recentAccents = parsed
            .map((v) => (typeof v === 'string' ? normalizeHex(v) : null))
            .filter((v): v is string => !!v)
            .slice(0, MAX_RECENT_ACCENTS);
        }
      } catch {
        // ignore corrupt JSON
      }
    }

    const storedMode = kvGet(THEME_MODE_KEY);
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'auto') {
      result.themeMode = storedMode;
    }

    const storedTint = kvGet(THEME_TINT_INTENSITY_KEY);
    if (storedTint === 'subtle' || storedTint === 'balanced' || storedTint === 'vivid') {
      result.tintIntensity = storedTint;
    }

    const storedContrast = kvGet(THEME_INCREASE_CONTRAST_KEY);
    if (storedContrast === 'true' || storedContrast === 'false') {
      result.increaseContrast = storedContrast === 'true';
    }
  } catch {
    // ignore — fall back to defaults
  }
  return result;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Seed synchronously from MMKV so the very first paint is in the user's
  // theme. MMKV is memory-mapped so this is essentially free — the read
  // happens during `useState`'s lazy initialiser and never flips on the user.
  const [bootstrap] = useState(() => readStoredTheme());
  const [themeId, setThemeId] = useState<ThemeId>(bootstrap.themeId);
  const [customAccent, setCustomAccentState] = useState<string | null>(bootstrap.customAccent);
  const [recentAccents, setRecentAccentsState] = useState<string[]>(bootstrap.recentAccents);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(bootstrap.themeMode);
  const [tintIntensity, setTintIntensityState] = useState<TintIntensity>(bootstrap.tintIntensity);
  const [increaseContrast, setIncreaseContrastState] = useState<boolean>(
    bootstrap.increaseContrast
  );
  const systemScheme = useColorScheme();

  const setTheme = useCallback(async (id: ThemeId) => {
    if (!(id in THEMES)) return;
    setThemeId(id);
    // Switching theme means "use this palette's accent". Drop any previously
    // chosen custom accent so the new palette's accent actually takes effect —
    // otherwise the theme card swatch and the live accent get out of sync.
    setCustomAccentState(null);
    try {
      kvSet(THEME_ID_KEY, id);
      kvSet(THEME_CUSTOM_ACCENT_KEY, '');
    } catch {
      // best-effort persistence; in-memory fallback already updated
    }
  }, []);

  const setCustomAccent = useCallback(async (hex: string | null) => {
    if (hex === null) {
      setCustomAccentState(null);
      try {
        kvSet(THEME_CUSTOM_ACCENT_KEY, '');
      } catch {
        // best-effort
      }
      return;
    }
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setCustomAccentState(normalized);
    let nextRecent: string[] = [];
    setRecentAccentsState((prev) => {
      nextRecent = [normalized, ...prev.filter((c) => c !== normalized)].slice(
        0,
        MAX_RECENT_ACCENTS
      );
      return nextRecent;
    });
    try {
      kvSet(THEME_CUSTOM_ACCENT_KEY, normalized);
      kvSet(THEME_RECENT_ACCENTS_KEY, JSON.stringify(nextRecent));
    } catch {
      // best-effort
    }
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      kvSet(THEME_MODE_KEY, mode);
    } catch {
      // best-effort
    }
  }, []);

  const setTintIntensity = useCallback(async (t: TintIntensity) => {
    setTintIntensityState(t);
    try {
      kvSet(THEME_TINT_INTENSITY_KEY, t);
    } catch {
      // best-effort
    }
  }, []);

  const setIncreaseContrast = useCallback(async (v: boolean) => {
    setIncreaseContrastState(v);
    try {
      kvSet(THEME_INCREASE_CONTRAST_KEY, v ? 'true' : 'false');
    } catch {
      // best-effort
    }
  }, []);

  const effectiveMode: 'light' | 'dark' =
    themeMode === 'auto' ? (systemScheme === 'light' ? 'light' : 'dark') : themeMode;

  const resolvedTheme = useMemo<ThemePalette>(() => {
    const base = THEMES[themeId];
    const tint = TINT_INTENSITY_VALUES[tintIntensity];
    // Start from the dark palette, then swap surfaces for light mode.
    let next: ThemePalette = customAccent
      ? {
          ...base,
          accent: customAccent,
          accentLight: adjustHex(customAccent, 25),
          accentDark: adjustHex(customAccent, -25),
        }
      : base;
    if (effectiveMode === 'light') {
      const lightSurfaces = THEME_LIGHT_SURFACES[themeId];
      next = {
        ...next,
        background: lightSurfaces.background,
        text: lightSurfaces.text,
        glassBorder: lightSurfaces.glassBorder,
        gradient: lightSurfaces.gradient,
      };
    }
    if (!increaseContrast && tintIntensity === 'balanced') return next;
    // High-contrast border has to flip with mode — bright white doesn't read
    // against a pale background, and near-black doesn't read against a dark one.
    const highContrastBorder =
      effectiveMode === 'light' ? 'rgba(15,15,22,0.32)' : 'rgba(255,255,255,0.22)';
    return {
      ...next,
      accentLight: adjustHex(next.accent, 10 + tint * 30),
      glassBorder: increaseContrast ? highContrastBorder : next.glassBorder,
      text: increaseContrast
        ? {
            ...next.text,
            secondary: next.text.primary,
          }
        : next.text,
    };
  }, [themeId, customAccent, tintIntensity, increaseContrast, effectiveMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      themeId,
      setTheme,
      hydrated: true,
      themes: THEME_LIST,
      customAccent,
      setCustomAccent,
      recentAccents,
      themeMode,
      setThemeMode,
      effectiveMode,
      tintIntensity,
      setTintIntensity,
      increaseContrast,
      setIncreaseContrast,
      grandfatheredThemeId: bootstrap.grandfatheredThemeId,
    }),
    [
      bootstrap.grandfatheredThemeId,
      resolvedTheme,
      themeId,
      setTheme,
      customAccent,
      setCustomAccent,
      recentAccents,
      themeMode,
      setThemeMode,
      effectiveMode,
      tintIntensity,
      setTintIntensity,
      increaseContrast,
      setIncreaseContrast,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) {
    // Safe default for components rendered outside provider (e.g., tests)
    return {
      theme: THEMES.aniseeker,
      themeId: 'aniseeker',
      setTheme: async () => {},
      hydrated: true,
      themes: THEME_LIST,
      customAccent: null,
      setCustomAccent: async () => {},
      recentAccents: [],
      themeMode: 'dark',
      setThemeMode: async () => {},
      effectiveMode: 'dark',
      tintIntensity: 'balanced',
      setTintIntensity: async () => {},
      increaseContrast: false,
      setIncreaseContrast: async () => {},
      grandfatheredThemeId: '',
    };
  }
  return ctx;
}
