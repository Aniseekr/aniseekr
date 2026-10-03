import { useState, useCallback, useRef, useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CollectionFloatingActionBar } from '../CollectionFloatingActionBar';
import { ShareImageRenderer } from '../ShareImageRenderer';
import { ShareListEditor } from '../ShareListEditor';
import { ThemedText, readableTextOn } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { LocalDB } from '../../../libs/db';
import { UserRepository } from '../../../libs/repositories/user-repository';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { useT } from '../../../libs/i18n';
import {
  buildShareTemplate,
  type ShareSourceItem,
  type ShareTemplateBuild,
  type ShareTemplate,
  type ShareEntry,
} from '../../../libs/services/collection/share-templates';

export function LibraryShareMode({ active, onClose }: { active: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const t = useT();
  const [shareSource, setShareSource] = useState<ShareSourceItem[]>([]);
  const [shareBuild, setShareBuild] = useState<ShareTemplateBuild | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const rendererRef = useRef<View>(null);
  useEffect(() => {
    let cancelled = false;
    UserRepository.getProfile()
      .then((profile) => {
        if (!cancelled && profile?.username) {
          setUsername(profile.username);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadShareSource = useCallback(async () => {
    try {
      const db = await LocalDB.getDatabase();
      const rows = await db.getAllAsync<{
        anime_id: string;
        title: string | null;
        image_url: string | null;
        score: number | null;
        started_at: number | null;
        completed_at: number | null;
        status: string | null;
      }>(
        'SELECT anime_id, title, image_url, score, started_at, completed_at, status FROM user_anime'
      );
      const items: ShareSourceItem[] = rows.flatMap((r) => {
        if (!r.title) return [];
        const ts = r.completed_at ?? r.started_at ?? null;
        return [
          {
            id: r.anime_id,
            title: r.title,
            coverUrl: r.image_url || undefined,
            score: typeof r.score === 'number' ? r.score : undefined,
            year: ts ? new Date(ts).getFullYear() : undefined,
            status: r.status ?? undefined,
          },
        ];
      });
      setShareSource(items);
    } catch (error) {
      console.error('Failed to load share source:', error);
      setShareSource([]);
    }
  }, []);

  useEffect(() => {
    if (active) void loadShareSource();
  }, [active, loadShareSource]);

  const handleSelectTemplate = useCallback(
    (template: ShareTemplate) => {
      const build = buildShareTemplate(template.id, shareSource, { username });
      setShareBuild(build);
      setShareError(null);
      if (template.needsManualPick) {
        setEditorOpen(true);
      }
    },
    [shareSource, username]
  );

  const handleSaveEntries = useCallback(
    (entries: ShareEntry[]) => {
      if (!shareBuild) return;
      setShareBuild({ ...shareBuild, entries });
      setEditorOpen(false);
    },
    [shareBuild]
  );

  const handleCancelShare = useCallback(() => {
    onClose();
    setShareBuild(null);
    setEditorOpen(false);
    setShareError(null);
  }, [onClose]);

  const handleConfirmShare = useCallback(async () => {
    if (!shareBuild) {
      setShareError(t('tabs.collectionScreen.share.pickTemplate'));
      return;
    }
    if (shareBuild.entries.length === 0) {
      setShareError(t('tabs.collectionScreen.share.addAtLeastOne'));
      return;
    }
    if (!rendererRef.current) {
      setShareError(t('tabs.collectionScreen.share.rendererNotReady'));
      return;
    }
    setCapturing(true);
    setShareError(null);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const uri = await captureRef(rendererRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      hapticsBridge.success();
      await Share.share(
        {
          url: uri,
          message: t('tabs.collectionScreen.share.myTemplateOnAniseekr', {
            template: t(shareBuild.template.titleKey),
          }),
          title: `Aniseekr · ${t(shareBuild.template.titleKey)}`,
        },
        {
          dialogTitle: t('tabs.collectionScreen.share.dialogTitle', {
            template: t(shareBuild.template.titleKey),
          }),
        }
      );
    } catch (error) {
      console.error('Share capture failed:', error);
      setShareError(t('tabs.collectionScreen.share.couldNotRender'));
    } finally {
      setCapturing(false);
    }
  }, [shareBuild, t]);

  if (!active) return null;

  return (
    <>
      <CollectionFloatingActionBar
        mode="share"
        selectedCount={shareBuild?.entries.length ?? 0}
        selectedTemplateId={shareBuild?.template.id ?? null}
        capturing={capturing}
        onSelectTemplate={handleSelectTemplate}
        onConfirmShare={handleConfirmShare}
        onCancelShare={handleCancelShare}
      />
      {shareError ? (
        <View
          pointerEvents="none"
          style={[styles.errorBanner, { backgroundColor: theme.status.error }]}>
          <ThemedText
            variant="bodySmall"
            weight="600"
            style={{ color: readableTextOn(theme.status.error) }}>
            {shareError}
          </ThemedText>
        </View>
      ) : null}
      <ShareListEditor
        visible={editorOpen}
        build={shareBuild}
        source={shareSource}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveEntries}
      />
      {shareBuild ? (
        <View pointerEvents="none" style={styles.offscreenRenderer}>
          <ShareImageRenderer ref={rendererRef} build={shareBuild} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  offscreenRenderer: { position: 'absolute', left: -10000, top: -10000, width: 1080, height: 1920 },
  errorBanner: {
    position: 'absolute',
    bottom: 200,
    left: Spacing.md,
    right: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
});
