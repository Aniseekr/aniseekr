const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function expandHex(input: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (s.length === 4) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX_RE.test(s) ? s.toUpperCase() : null;
}

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const ex = expandHex(hex);
  if (!ex) return 0;
  const v = parseInt(ex.slice(1), 16);
  const r = srgbChannel((v >> 16) & 0xff);
  const g = srgbChannel((v >> 8) & 0xff);
  const b = srgbChannel(v & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = la >= lb ? la : lb;
  const lo = la >= lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

export const ON_DARK = '#FFFFFF';
export const ON_LIGHT = '#0E0A06';

// WCAG AA for normal text is 4.5:1; bold/large text (≥14pt bold) is 3:1.
// Button labels in this app are bold titleMedium/titleLarge which qualifies
// as "large" — so 3:1 is the legibility floor.
const AA_LARGE_RATIO = 3;

/**
 * Pick the foreground text color (white or near-black) that stays legible
 * on the given background. Prefers the iconic "white on accent" look and
 * only flips to dark text when white drops below WCAG AA-large (3:1) —
 * this is what guards against the "can't see the label" bug on light/warm
 * accent colors like gold, peach or pale cyan.
 */
export function readableTextOn(background: string): string {
  const whiteRatio = contrastRatio(background, ON_DARK);
  return whiteRatio >= AA_LARGE_RATIO ? ON_DARK : ON_LIGHT;
}
