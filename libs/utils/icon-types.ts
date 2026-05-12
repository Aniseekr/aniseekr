/**
 * Vector-icons name unions, re-exported for ergonomic typing.
 *
 * Use these instead of `string` or `any` whenever a value flows into an
 * `<Ionicons name=…>` (or sibling) prop. Untyped icon names defeat
 * autocomplete and silently render nothing on a typo — `'star-outline'` is
 * valid; `'star-outlined'` is not, and TypeScript should catch it.
 *
 * For values that come from a dynamic source (DB row, user-created folder),
 * narrow at the boundary instead of casting at every call site.
 */

import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type FontAwesome5 from '@expo/vector-icons/FontAwesome5';

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];
export type MaterialIconsName = ComponentProps<typeof MaterialIcons>['name'];
export type FontAwesome5Name = ComponentProps<typeof FontAwesome5>['name'];

/**
 * Coerce a stored/dynamic string into an `IoniconsName`. The vector-icons
 * union is too large to enumerate at runtime; an unknown name simply renders
 * a missing glyph. This keeps the cast in one place so call sites don't
 * sprinkle `as any` to satisfy the `name` prop.
 */
export const asIoniconsName = (value: string): IoniconsName => value as IoniconsName;
