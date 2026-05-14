// Platform-specific share deep links.
//
// Background: React Native's native Share sheet works for most cases, but for
// Instagram Stories / Twitter / LINE the user expects a one-tap path that
// lands in the right composer with the image attached and the caption
// pre-filled. We can't pass caption through the share sheet to IG/LINE, so the
// reliable strategy is:
//
//   1. Save the captured image to the camera roll (already done before this
//      helper is called).
//   2. Copy the caption to the system clipboard.
//   3. Open a platform-specific deep link if installed; fall back to the OS
//      share sheet so nothing is lost.
//
// We do NOT pretend any of these deep links can attach a file URI — iOS
// sandboxing and the public schemes simply don't allow it. The honest UX is
// "image is in your camera roll, caption copied, paste it in".

import { Linking, Share } from 'react-native';

type ClipboardModule = {
  setStringAsync(value: string): Promise<unknown>;
};

let clipboardModule: ClipboardModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboardModule = require('expo-clipboard');
} catch {
  clipboardModule = null;
}

export type SharePlatform = 'instagram' | 'twitter' | 'line' | 'system';

export type ShareIntentInput = {
  imageUri: string;
  caption: string;
};

export type ShareIntentResult = {
  platform: SharePlatform;
  delivered: 'native' | 'web' | 'sheet' | 'failed';
  captionCopied: boolean;
};

async function copyCaption(caption: string): Promise<boolean> {
  if (!clipboardModule?.setStringAsync) return false;
  try {
    await clipboardModule.setStringAsync(caption);
    return true;
  } catch {
    return false;
  }
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function fallbackShareSheet({
  imageUri,
  caption,
}: ShareIntentInput): Promise<'sheet' | 'failed'> {
  try {
    const result = await Share.share({ url: imageUri, message: caption });
    if (result.action === Share.dismissedAction) return 'failed';
    return 'sheet';
  } catch {
    return 'failed';
  }
}

export async function shareToInstagram(input: ShareIntentInput): Promise<ShareIntentResult> {
  const captionCopied = await copyCaption(input.caption);
  // Opening the Stories camera so the user can pick the saved image from the
  // gallery roll. There is no public URL scheme that attaches a file directly.
  const opened =
    (await tryOpen('instagram://story-camera')) || (await tryOpen('instagram://camera'));
  if (opened) return { platform: 'instagram', delivered: 'native', captionCopied };
  const sheet = await fallbackShareSheet(input);
  return { platform: 'instagram', delivered: sheet, captionCopied };
}

export async function shareToTwitter(input: ShareIntentInput): Promise<ShareIntentResult> {
  const captionCopied = await copyCaption(input.caption);
  const encoded = encodeURIComponent(input.caption);
  // Prefer the in-app composer if X is installed; web intent works everywhere.
  const opened =
    (await tryOpen(`twitter://post?message=${encoded}`)) ||
    (await tryOpen(`https://twitter.com/intent/tweet?text=${encoded}`));
  if (opened) return { platform: 'twitter', delivered: 'web', captionCopied };
  const sheet = await fallbackShareSheet(input);
  return { platform: 'twitter', delivered: sheet, captionCopied };
}

export async function shareToLine(input: ShareIntentInput): Promise<ShareIntentResult> {
  const captionCopied = await copyCaption(input.caption);
  const encoded = encodeURIComponent(input.caption);
  // LINE accepts text-only share via this URL on both iOS and Android.
  const opened = await tryOpen(`https://line.me/R/share?text=${encoded}`);
  if (opened) return { platform: 'line', delivered: 'web', captionCopied };
  const sheet = await fallbackShareSheet(input);
  return { platform: 'line', delivered: sheet, captionCopied };
}

export async function shareToSystem(input: ShareIntentInput): Promise<ShareIntentResult> {
  const captionCopied = await copyCaption(input.caption);
  const sheet = await fallbackShareSheet(input);
  return { platform: 'system', delivered: sheet, captionCopied };
}

export function buildShareCaption(parts: {
  sceneName: string;
  animeTitle?: string | null;
  episode?: string | null;
  matchScore?: number | null;
  locationText?: string | null;
}): string {
  const lines: string[] = [];
  const heading = parts.animeTitle ? `${parts.animeTitle} · ${parts.sceneName}` : parts.sceneName;
  lines.push(heading);
  if (parts.episode) lines.push(`EP ${parts.episode}`);
  if (parts.matchScore != null) lines.push(`Match ${parts.matchScore}%`);
  if (parts.locationText) lines.push(`📍 ${parts.locationText}`);
  lines.push('');
  const tags = ['#animepilgrimage', '#anipilgrimage', '#aniseekr'];
  if (parts.animeTitle) {
    const slug = parts.animeTitle.replace(/[^A-Za-z0-9]+/g, '');
    if (slug.length > 0) tags.unshift(`#${slug}`);
  }
  lines.push(tags.join(' '));
  return lines.join('\n');
}
