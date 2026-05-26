// Standalone companion composer entry (Track D Phase 1 of the composer
// pipeline plan: docs/superpowers/plans/2026-05-26-composer-pipeline.md).
//
// This route lets the user import / pick a character and place it atop a
// chosen background image. Capture writes the composed image to the user's
// camera roll. The compare-screen integration (overlay chip on the camera
// HUD) is a Phase 1B follow-up.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../components/themed';
import { Radius, Spacing, bottomPad } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { CharacterPickerSheet } from '../../components/companion/CharacterPickerSheet';
import { CharacterLayer } from '../../components/companion/CharacterLayer';
import type { CharacterEntry } from '../../libs/services/companion/character-library';
import { subjectLifter } from '../../libs/services/companion/subject-lifter';
import {
  DEFAULT_SHADOW,
  deriveCharacterTint,
  IDENTITY_CHARACTER_TINT,
} from '../../libs/services/companion/character-lighting';
import { analyzeImage } from '../../libs/services/pilgrimage/scene-analysis-skia';

export default function CompanionScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const styles = makeStyles(theme);
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);

  const [bgUri, setBgUri] = useState<string | null>(null);
  const [character, setCharacter] = useState<CharacterEntry | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tintEnabled, setTintEnabled] = useState(true);
  const [shadowEnabled, setShadowEnabled] = useState(true);
  const [tintMatrix, setTintMatrix] = useState<number[] | null>(null);
  const stageRef = useRef<View>(null);

  // Phase 2 — derive character tint from the bg whenever either changes.
  useEffect(() => {
    if (!bgUri || !character || !tintEnabled) {
      setTintMatrix(null);
      return;
    }
    let cancelled = false;
    Promise.all([analyzeImage(bgUri), analyzeImage(character.cutoutUri)]).then(([bg, ch]) => {
      if (cancelled) return;
      const m = deriveCharacterTint(bg, ch);
      setTintMatrix(m === IDENTITY_CHARACTER_TINT ? null : m);
    });
    return () => {
      cancelled = true;
    };
  }, [bgUri, character, tintEnabled]);

  const stageW = winW - Spacing.md * 2;
  const stageH = Math.min(winH * 0.6, stageW * 1.4);

  const flashToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const handlePickBackground = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      flashToast('Photo library access denied');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    setBgUri(picked.assets[0].uri);
  }, [flashToast]);

  const handleCapture = useCallback(async () => {
    if (!stageRef.current) return;
    hapticsBridge.success();
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        flashToast('Media access denied');
        return;
      }
      const uri = await captureRef(stageRef.current, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      await MediaLibrary.saveToLibraryAsync(uri);
      flashToast('Saved to camera roll');
    } catch (err) {
      console.warn('companion capture failed', err);
      flashToast('Capture failed');
    }
  }, [flashToast]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText variant="titleLarge" weight="700">
              Companion
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              {subjectLifter.isSupported() ? 'Auto cutout ready' : 'No background removal yet'}
            </ThemedText>
          </View>
          <Pressable
            onPress={handleCapture}
            hitSlop={14}
            disabled={!bgUri || !character}
            accessibilityRole="button"
            accessibilityLabel="Save composition"
            style={({ pressed }) => [
              styles.headerBtn,
              { opacity: !bgUri || !character ? 0.4 : pressed ? 0.6 : 1 },
            ]}>
            <Ionicons name="download" size={20} color={theme.text.primary} />
          </Pressable>
        </View>

        <View style={styles.stageWrap}>
          <View
            ref={stageRef}
            collapsable={false}
            style={[
              styles.stage,
              {
                width: stageW,
                height: stageH,
                borderColor: theme.glassBorder,
                backgroundColor: theme.background.secondary,
              },
            ]}>
            {bgUri ? (
              <ExpoImage
                source={{ uri: bgUri }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            ) : (
              <Pressable
                onPress={handlePickBackground}
                accessibilityRole="button"
                accessibilityLabel="Pick a background image"
                style={styles.bgPlaceholder}>
                <Ionicons name="image-outline" size={36} color={theme.text.secondary} />
                <ThemedText variant="bodyMedium" tone="secondary" weight="600">
                  Pick a background
                </ThemedText>
              </Pressable>
            )}
            {character ? (
              <CharacterLayer
                cutoutUri={character.cutoutUri}
                intrinsicW={character.intrinsicW}
                intrinsicH={character.intrinsicH}
                parentSize={{ width: stageW, height: stageH }}
                onLongPress={() => setPickerOpen(true)}
                tintMatrix={tintMatrix}
                shadow={shadowEnabled ? DEFAULT_SHADOW : null}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.lightingRow}>
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              setTintEnabled((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Toggle character lighting match"
            accessibilityState={{ selected: tintEnabled }}
            style={({ pressed }) => [
              styles.lightingChip,
              {
                backgroundColor: tintEnabled ? accent : theme.background.secondary,
                borderColor: tintEnabled ? accent : theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons
              name="color-wand-outline"
              size={14}
              color={tintEnabled ? accentFg : theme.text.primary}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: tintEnabled ? accentFg : theme.text.primary }}>
              Tint
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              setShadowEnabled((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Toggle character shadow"
            accessibilityState={{ selected: shadowEnabled }}
            style={({ pressed }) => [
              styles.lightingChip,
              {
                backgroundColor: shadowEnabled ? accent : theme.background.secondary,
                borderColor: shadowEnabled ? accent : theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons
              name="ellipse"
              size={12}
              color={shadowEnabled ? accentFg : theme.text.primary}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: shadowEnabled ? accentFg : theme.text.primary }}>
              Shadow
            </ThemedText>
          </Pressable>
        </View>

        <View style={[styles.footer, { paddingBottom: bottomPad(insets) }]}>
          <Pressable
            onPress={handlePickBackground}
            accessibilityRole="button"
            accessibilityLabel="Change background"
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons name="image" size={18} color={theme.text.primary} />
            <ThemedText variant="bodySmall" weight="700">
              {bgUri ? 'Change' : 'Background'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick character"
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: accent,
                borderColor: accent,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons name="person-add" size={18} color={accentFg} />
            <ThemedText variant="bodySmall" weight="700" style={{ color: accentFg }}>
              {character ? 'Swap character' : 'Pick character'}
            </ThemedText>
          </Pressable>
        </View>

        {toast ? (
          <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 120 }]}>
            <View
              style={[
                styles.toast,
                { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
              ]}>
              <ThemedText variant="bodySmall" weight="700">
                {toast}
              </ThemedText>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      <CharacterPickerSheet
        visible={pickerOpen}
        selectedId={character?.id ?? null}
        onSelect={(entry) => {
          setCharacter(entry);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
    stageWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.md,
    },
    stage: {
      borderRadius: Radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    bgPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    footer: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
    },
    lightingRow: {
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
    },
    lightingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    footerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      borderRadius: 999,
      borderWidth: 1,
    },
    toastWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    toast: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
    },
  });
}

