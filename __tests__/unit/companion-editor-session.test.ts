import { describe, expect, test } from 'bun:test';
import {
  createEditorSession,
  takeEditorSession,
} from '../../libs/services/companion/cutout-editor-session';

describe('cutout editor session', () => {
  test('take returns the registered session exactly once', () => {
    const id = createEditorSession({ mode: 'import', sourceUri: 'file:///a.jpg' });
    const s = takeEditorSession(id);
    expect(s?.sourceUri).toBe('file:///a.jpg');
    expect(takeEditorSession(id)).toBeNull();
  });

  test('ids are unique', () => {
    const a = createEditorSession({ mode: 'edit', characterId: 'x' });
    const b = createEditorSession({ mode: 'edit', characterId: 'y' });
    expect(a).not.toBe(b);
    expect(takeEditorSession(b)?.characterId).toBe('y');
    expect(takeEditorSession(a)?.characterId).toBe('x');
  });

  test('unknown id returns null', () => {
    expect(takeEditorSession('nope')).toBeNull();
  });
});
