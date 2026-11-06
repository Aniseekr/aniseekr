import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { CollectionFolder } from '../../../types';
import {
  collectionService,
  type FolderAnimeWithProgress,
} from '../../../libs/services/collection/collection-service';
import { trackingService } from '../../../libs/services/tracking/tracking-service';

export const LIBRARY_STATUSES = [
  'watching',
  'wishlist',
  'completed',
  'favorites',
  'dropped',
] as const;
export type LibrarySelection = (typeof LIBRARY_STATUSES)[number] | 'custom';

type Snapshot = {
  folders: CollectionFolder[] | null;
  items: Record<string, FolderAnimeWithProgress[]>;
};
// Only successful resources enter this sync mirror. Re-entry paints real content immediately.
let snapshot: Snapshot = { folders: null, items: {} };
type State = Snapshot & {
  selected: LibrarySelection | null;
  foldersError: boolean;
  itemErrors: Record<string, boolean>;
  refreshing: boolean;
};
type Action =
  | { type: 'folders'; folders: CollectionFolder[]; selected: LibrarySelection }
  | { type: 'items'; id: string; items: FolderAnimeWithProgress[] }
  | { type: 'foldersError' }
  | { type: 'itemError'; id: string }
  | { type: 'select'; selected: LibrarySelection }
  | { type: 'refresh'; refreshing: boolean };

function defaultSelection(folders: CollectionFolder[]): LibrarySelection {
  return (
    LIBRARY_STATUSES.find((status) =>
      folders.some((folder) => folder.folderType === status && folder.animeCount > 0)
    ) ?? 'watching'
  );
}
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'folders':
      return {
        ...state,
        folders: action.folders,
        selected: state.selected ?? action.selected,
        foldersError: false,
      };
    case 'items':
      return {
        ...state,
        items: { ...state.items, [action.id]: action.items },
        itemErrors: { ...state.itemErrors, [action.id]: false },
      };
    case 'foldersError':
      return { ...state, foldersError: true };
    case 'itemError':
      return { ...state, itemErrors: { ...state.itemErrors, [action.id]: true } };
    case 'select':
      return { ...state, selected: action.selected };
    case 'refresh':
      return { ...state, refreshing: action.refreshing };
  }
}

export function useLibrary() {
  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({
    ...snapshot,
    selected: snapshot.folders ? defaultSelection(snapshot.folders) : null,
    foldersError: false,
    itemErrors: {},
    refreshing: false,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const requests = useRef({ folders: 0, items: new Map<string, number>(), refresh: 0 });
  const loadItems = useCallback(async (id: string) => {
    const request = (requests.current.items.get(id) ?? 0) + 1;
    requests.current.items.set(id, request);
    try {
      const items = await collectionService.getFolderAnimeWithProgress(id);
      if (requests.current.items.get(id) !== request) return;
      snapshot = { ...snapshot, items: { ...snapshot.items, [id]: items } };
      dispatch({ type: 'items', id, items });
    } catch (error) {
      if (requests.current.items.get(id) !== request) return;
      console.error('Failed to load library items:', error);
      dispatch({ type: 'itemError', id });
    }
  }, []);
  const reload = useCallback(async () => {
    const request = ++requests.current.folders;
    try {
      const folders = await collectionService.getFolders();
      if (requests.current.folders !== request) return;
      snapshot = { ...snapshot, folders };
      const selected = stateRef.current.selected ?? defaultSelection(folders);
      dispatch({ type: 'folders', folders, selected });
      const folder = folders.find((item) => item.folderType === selected && item.isSystemFolder);
      if (folder) await loadItems(folder.id);
    } catch (error) {
      if (requests.current.folders !== request) return;
      console.error('Failed to load library folders:', error);
      dispatch({ type: 'foldersError' });
    }
  }, [loadItems]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void reload();
    }, [reload])
  );
  useEffect(
    () =>
      trackingService.onTrackedIdsChange(() => {
        void reload();
      }),
    [reload]
  );

  const selected = state.selected ?? 'watching';
  const folderId = state.folders?.find(
    (folder) => folder.isSystemFolder && folder.folderType === selected
  )?.id;
  const select = useCallback(
    (selection: LibrarySelection) => {
      dispatch({ type: 'select', selected: selection });
      const id = stateRef.current.folders?.find(
        (folder) => folder.isSystemFolder && folder.folderType === selection
      )?.id;
      if (id) void loadItems(id);
    },
    [loadItems]
  );
  const refresh = useCallback(async () => {
    const request = ++requests.current.refresh;
    dispatch({ type: 'refresh', refreshing: true });
    await reload();
    if (requests.current.refresh === request) dispatch({ type: 'refresh', refreshing: false });
  }, [reload]);
  const items = folderId ? state.items[folderId] : undefined;
  const error = state.foldersError || !!(folderId && state.itemErrors[folderId]);
  const ready = state.folders !== null && (selected === 'custom' || items !== undefined);
  return {
    folders: state.folders,
    selected,
    items,
    error,
    ready,
    refreshing: state.refreshing,
    select,
    reload,
    refresh,
  };
}
