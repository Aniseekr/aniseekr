# Edge Overlay Intensity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Edge intensity levels so the pilgrimage camera can show Edge+ low intensity with a faint reference image, plus stronger Mid and High edge treatments.

**Architecture:** Keep Edge intensity as camera-screen state and pass it into the existing overlay controls, edge-image hook, and overlay renderer. Put pure intensity configuration in a small service helper so behavior is covered by unit tests without booting Skia or React Native.

**Tech Stack:** Expo React Native, TypeScript, `expo-image`, `@shopify/react-native-skia`, Bun test.

---

## File Structure

- Create `libs/services/pilgrimage/edge-overlay.ts`: owns `EdgeIntensity`, labels, ordered values, and mapping to edge threshold, edge ink opacity, and faint source-image opacity.
- Create `__tests__/unit/pilgrimage/edge-overlay.test.ts`: pure unit tests for intensity mapping.
- Modify `hooks/useEdgeOrSketch.ts`: accept `edgeIntensity` and pass threshold/ink opacity to `useEdgeImage`.
- Modify `components/pilgrimage/camera/OverlayLayer.tsx`: render a faint reference image behind Edge when configured and use it as fallback if edge generation fails.
- Modify `components/pilgrimage/camera/chips/OverlayControls.tsx`: show the Edge intensity selector only when Edge mode is selected.
- Modify `app/(tabs)/pilgrimage/compare/[spotId].tsx`: own `edgeIntensity` state and wire props through controls and overlay.

---

### Task 1: Edge Intensity Config

**Files:**

- Create: `libs/services/pilgrimage/edge-overlay.ts`
- Test: `__tests__/unit/pilgrimage/edge-overlay.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  getEdgeOverlayConfig,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';

describe('edge overlay intensity', () => {
  it('exposes low, mid, and high in UI order', () => {
    expect(EDGE_INTENSITIES).toEqual(['low', 'mid', 'high']);
  });

  it('maps low to Edge+ with a faint reference backdrop', () => {
    expect(edgeIntensityLabel('low')).toBe('Edge+');
    expect(getEdgeOverlayConfig('low')).toEqual({
      threshold: 0.12,
      inkOpacity: 0.72,
      sourceOpacity: 0.18,
    });
  });

  it('maps mid and high to progressively stronger edge-only overlays', () => {
    const mid = getEdgeOverlayConfig('mid');
    const high = getEdgeOverlayConfig('high');

    expect(edgeIntensityLabel('mid')).toBe('Edge');
    expect(edgeIntensityLabel('high')).toBe('Edge Max');
    expect(mid.sourceOpacity).toBe(0);
    expect(high.sourceOpacity).toBe(0);
    expect(high.inkOpacity).toBeGreaterThan(mid.inkOpacity);
    expect(high.threshold).toBeLessThan(mid.threshold);
  });

  it('falls back to low for unknown persisted values', () => {
    expect(getEdgeOverlayConfig('other' as EdgeIntensity)).toEqual(getEdgeOverlayConfig('low'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/edge-overlay.test.ts`
Expected: FAIL because `libs/services/pilgrimage/edge-overlay.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type EdgeIntensity = 'low' | 'mid' | 'high';

export const EDGE_INTENSITIES: readonly EdgeIntensity[] = ['low', 'mid', 'high'] as const;

export interface EdgeOverlayConfig {
  threshold: number;
  inkOpacity: number;
  sourceOpacity: number;
}

const CONFIG: Record<EdgeIntensity, EdgeOverlayConfig> = {
  low: { threshold: 0.12, inkOpacity: 0.72, sourceOpacity: 0.18 },
  mid: { threshold: 0.18, inkOpacity: 1, sourceOpacity: 0 },
  high: { threshold: 0.1, inkOpacity: 1, sourceOpacity: 0 },
};

const LABEL: Record<EdgeIntensity, string> = {
  low: 'Edge+',
  mid: 'Edge',
  high: 'Edge Max',
};

export function isEdgeIntensity(value: unknown): value is EdgeIntensity {
  return value === 'low' || value === 'mid' || value === 'high';
}

export function getEdgeOverlayConfig(value: EdgeIntensity): EdgeOverlayConfig {
  return CONFIG[isEdgeIntensity(value) ? value : 'low'];
}

export function edgeIntensityLabel(value: EdgeIntensity): string {
  return LABEL[isEdgeIntensity(value) ? value : 'low'];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/edge-overlay.test.ts`
Expected: PASS.

---

### Task 2: Hook and Render Wiring

**Files:**

- Modify: `hooks/useEdgeOrSketch.ts`
- Modify: `components/pilgrimage/camera/OverlayLayer.tsx`

- [ ] **Step 1: Extend `useEdgeOrSketch`**

Add an `edgeIntensity: EdgeIntensity` input, compute `getEdgeOverlayConfig(edgeIntensity)`, pass `threshold` and `inkOpacity` to `useEdgeImage`, and return `sourceOpacity` with the image state.

- [ ] **Step 2: Render Edge source backdrop and fallback**

In `OverlayLayer`, add `edgeSourceOpacity: number`. For `mode === 'edge'`, render the reference `ExpoImage` behind the Skia edge image when `edgeSourceOpacity > 0`. If edge generation fails and `edgeSourceOpacity > 0`, keep that faint reference image visible instead of showing a blank overlay.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: no TypeScript errors from changed props or hook return types.

---

### Task 3: Camera Controls

**Files:**

- Modify: `components/pilgrimage/camera/chips/OverlayControls.tsx`
- Modify: `app/(tabs)/pilgrimage/compare/[spotId].tsx`

- [ ] **Step 1: Add `EdgeIntensity` props to controls**

Extend `OverlayControlsProps` with:

```ts
edgeIntensity: EdgeIntensity;
onSelectEdgeIntensity: (intensity: EdgeIntensity) => void;
```

Render the intensity row only when `mode === 'edge'`, using `EDGE_INTENSITIES` and `edgeIntensityLabel`.

- [ ] **Step 2: Wire camera state**

In `CompareCaptureScreen`, add:

```ts
const [edgeIntensity, setEdgeIntensity] = useState<EdgeIntensity>('low');
```

Pass `edgeIntensity` to `useEdgeOrSketch`, `OverlayLayer`, and `OverlayControls`.

- [ ] **Step 3: Run focused verification**

Run:

```bash
bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/edge-overlay.test.ts
bun run typecheck
```

Expected: both commands pass.
