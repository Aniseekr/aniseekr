// In-memory hand-off between the screen that opens the cutout editor and the
// editor route. Expo Router params are strings, so the picked-image draft and
// the onDone callback travel through this registry instead; the route carries
// only the session id. Sessions are single-use (taken once on editor mount).

import type { CharacterEntry } from './character-library';

export interface CutoutEditorSession {
  mode: 'import' | 'edit';
  /** import mode — uri of the freshly picked asset. */
  sourceUri?: string;
  /** edit mode — id of the existing entry to re-edit. */
  characterId?: string;
  displayName?: string;
  groupId?: string;
  angleLabel?: string;
  /** Called once: saved entry, or null when the editor was cancelled. */
  onDone?: (entry: CharacterEntry | null) => void;
}

let nextId = 1;
const sessions = new Map<string, CutoutEditorSession>();

export function createEditorSession(session: CutoutEditorSession): string {
  const id = `cutout_${nextId++}`;
  sessions.set(id, session);
  return id;
}

export function takeEditorSession(id: string): CutoutEditorSession | null {
  const s = sessions.get(id) ?? null;
  sessions.delete(id);
  return s;
}
