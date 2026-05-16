// Platform-specific share deep links.
//
// Background: social apps vary in what they accept from public URL schemes.
// Instagram Stories cannot receive an arbitrary file URI through its public
// scheme, and React Native's built-in Share API ignores `url` on Android. The
// reliable strategy is:
//
//   1. Save the captured image to the camera roll before opening anything.
//   2. Copy the caption to the system clipboard.
//   3. Use expo-sharing for image file shares, or open Instagram after saving
//      so the user can pick the saved image from the gallery.
//
// We do NOT pretend any of these deep links can attach a file URI — iOS
// sandboxing and the public schemes simply don't allow it. The honest UX is
// "image is in your camera roll, caption copied, pick it from Photos if the
// target app needs a manual attachment step".

import { Linking, Platform, Share } from 'react-native';

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

type SharingModule = {
  isAvailableAsync?: () => Promise<boolean>;
  shareAsync(
    url: string,
    options?: { dialogTitle?: string; mimeType?: string; UTI?: string }
  ): Promise<unknown>;
};

let sharingModule: SharingModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharingModule = require('expo-sharing');
} catch {
  sharingModule = null;
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

export type SavedImageShareResult<T> =
  | { status: 'shared'; uri: string; result: T }
  | { status: 'capture-failed' | 'save-failed'; uri?: string };

export async function saveShareImage({
  captureImage,
  saveImage,
}: {
  captureImage: () => Promise<string | null>;
  saveImage: (uri: string) => Promise<unknown>;
}): Promise<
  { status: 'saved'; uri: string } | { status: 'capture-failed' | 'save-failed'; uri?: string }
> {
  const uri = await captureImage();
  if (!uri) return { status: 'capture-failed' };

  try {
    await saveImage(uri);
  } catch {
    return { status: 'save-failed', uri };
  }

  return { status: 'saved', uri };
}

export async function shareSavedImage<T>({
  captureImage,
  saveImage,
  shareImage,
}: {
  captureImage: () => Promise<string | null>;
  saveImage: (uri: string) => Promise<unknown>;
  shareImage: (uri: string) => Promise<T>;
}): Promise<SavedImageShareResult<T>> {
  const saved = await saveShareImage({ captureImage, saveImage });
  if (saved.status !== 'saved') return saved;

  return { status: 'shared', uri: saved.uri, result: await shareImage(saved.uri) };
}

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
    if (sharingModule?.shareAsync) {
      const available = sharingModule.isAvailableAsync
        ? await sharingModule.isAvailableAsync()
        : true;
      if (available) {
        await sharingModule.shareAsync(imageUri, {
          dialogTitle: 'Share image',
          mimeType: 'image/png',
          UTI: 'public.png',
        });
        return 'sheet';
      }
    }

    if (Platform.OS === 'android') return 'failed';

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
  const sheet = await fallbackShareSheet(input);
  return { platform: 'twitter', delivered: sheet, captionCopied };
}

export async function shareToLine(input: ShareIntentInput): Promise<ShareIntentResult> {
  const captionCopied = await copyCaption(input.caption);
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
