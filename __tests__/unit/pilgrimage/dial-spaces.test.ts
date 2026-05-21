import { describe, expect, it } from 'bun:test';
import {
  buildDialLayout,
  clampToContinuous,
  isIslandTap,
  rubberBandResistance,
  ISLAND_CHIP_PX,
  ISLAND_GAP_PX,
  RUBBER_BAND_FACTOR,
} from '../../../libs/services/pilgrimage/dial-spaces';

describe('buildDialLayout', () => {
  it('standalone-switch + active=wide: island holds 0.5 targeting ultra-wide', () => {
    // Pixel 8 / S20FE shape. Active session is the wide device whose
    // [minZoom, maxZoom] = [1, 10] (or [0.67, 20] on Pixel logical). The
    // dial's continuous strip covers that range; 0.5 is tappable only via
    // the island, which when tapped requests an ultra-wide session swap.
    const layout = buildDialLayout({
      activeLens: 'wide',
      strategy: 'standalone-switch',
      hasStandaloneUltraWide: true,
      continuousStops: [1, 3],
      stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
      activeMinZoom: 1,
      activeMaxZoom: 10,
    });
    expect(layout.islandChip).not.toBeNull();
    expect(layout.islandChip?.stop).toBe(0.5);
    expect(layout.islandChip?.targetLens).toBe('ultra-wide');
    expect(layout.continuousStartPx).toBe(ISLAND_CHIP_PX + ISLAND_GAP_PX);
    expect(layout.continuousMinZoom).toBe(1);
  });

  it('standalone-switch + active=ultra-wide: island holds 1.0 targeting wide', () => {
    // After tapping the 0.5 island and the session swapping to the
    // standalone ultra-wide, the dial flips: the continuous strip now
    // covers the uw device's range (typically [0.5, ~0.95]) and the
    // island swaps to 1.0 so the user can tap their way back.
    const layout = buildDialLayout({
      activeLens: 'ultra-wide',
      strategy: 'standalone-switch',
      hasStandaloneUltraWide: true,
      continuousStops: [0.5],
      stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
      activeMinZoom: 0.5,
      activeMaxZoom: 0.95,
    });
    expect(layout.islandChip?.stop).toBe(1);
    expect(layout.islandChip?.targetLens).toBe('wide');
    expect(layout.continuousMinZoom).toBe(0.5);
    expect(layout.continuousMaxZoom).toBe(0.95);
  });

  it('wide-only cohort: no island chip, dial is single-pillar continuous', () => {
    // Pixel 6a: only the wide standalone exists. Dial renders [1, max]
    // continuous, no island chip — Rule 8 forbids inventing a 0.5 target
    // when no hardware reaches there.
    const layout = buildDialLayout({
      activeLens: 'wide',
      strategy: 'wide-only',
      hasStandaloneUltraWide: false,
      continuousStops: [1, 3],
      stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
      activeMinZoom: 1,
      activeMaxZoom: 8,
    });
    expect(layout.islandChip).toBeNull();
    expect(layout.continuousStartPx).toBe(0);
  });

  it('logical cohort: no island chip, continuous starts at 0', () => {
    // iOS Triple-Camera / Xiaomi true-0.5 logical: dial is a single
    // continuous strip from 0.5 to maxZoom. No island chip.
    const layout = buildDialLayout({
      activeLens: 'wide',
      strategy: 'logical',
      hasStandaloneUltraWide: false,
      continuousStops: [0.5, 1, 3],
      stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
      activeMinZoom: 0.5,
      activeMaxZoom: 30,
    });
    expect(layout.islandChip).toBeNull();
    expect(layout.continuousStartPx).toBe(0);
    expect(layout.continuousMinZoom).toBe(0.5);
  });
});

describe('clampToContinuous', () => {
  const wideLayout = buildDialLayout({
    activeLens: 'wide',
    strategy: 'standalone-switch',
    hasStandaloneUltraWide: true,
    continuousStops: [1, 3],
    stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
    activeMinZoom: 1,
    activeMaxZoom: 10,
  });

  it('values inside the continuous range pass through unchanged', () => {
    expect(clampToContinuous(1.5, wideLayout)).toBe(1.5);
    expect(clampToContinuous(8, wideLayout)).toBe(8);
  });

  it('values below continuousMinZoom snap to the wall (escapement)', () => {
    // Drag-attempt to 0.6 on Pixel 8 wide-active session: the dial freezes
    // at 1.0 (the wall). The actual swap to ultra-wide only happens via
    // an island tap, not a drag.
    expect(clampToContinuous(0.6, wideLayout)).toBe(1);
    expect(clampToContinuous(0.5, wideLayout)).toBe(1);
  });

  it('values above continuousMaxZoom snap to the upper edge', () => {
    expect(clampToContinuous(15, wideLayout)).toBe(10);
  });

  it('non-finite zoom resolves to continuousMinZoom (defensive)', () => {
    expect(clampToContinuous(Number.NaN, wideLayout)).toBe(1);
    expect(clampToContinuous(Number.POSITIVE_INFINITY, wideLayout)).toBe(10);
  });
});

describe('rubberBandResistance', () => {
  it('applies the default 0.18 damping factor', () => {
    expect(rubberBandResistance(100)).toBeCloseTo(18, 5);
    expect(rubberBandResistance(-50)).toBeCloseTo(-9, 5);
  });

  it('honours a caller-supplied factor', () => {
    expect(rubberBandResistance(100, 0.5)).toBeCloseTo(50, 5);
  });

  it('returns 0 for non-finite input', () => {
    expect(rubberBandResistance(Number.NaN)).toBe(0);
  });

  it('exposes the default factor as a constant', () => {
    expect(RUBBER_BAND_FACTOR).toBeCloseTo(0.18, 5);
  });
});

describe('isIslandTap', () => {
  const islandLayout = buildDialLayout({
    activeLens: 'wide',
    strategy: 'standalone-switch',
    hasStandaloneUltraWide: true,
    continuousStops: [1, 3],
    stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
    activeMinZoom: 1,
    activeMaxZoom: 10,
  });
  const noIslandLayout = buildDialLayout({
    activeLens: 'wide',
    strategy: 'logical',
    hasStandaloneUltraWide: false,
    continuousStops: [0.5, 1, 3],
    stopZoom: { 0.5: 0.5, 1: 1, 2: 2, 3: 3 },
    activeMinZoom: 0.5,
    activeMaxZoom: 30,
  });

  it('returns true when touch is within tolerance of the chip centre', () => {
    const chipPx = islandLayout.islandChip!.px;
    expect(isIslandTap(chipPx, islandLayout)).toBe(true);
    expect(isIslandTap(chipPx + 20, islandLayout)).toBe(true);
    expect(isIslandTap(chipPx - 20, islandLayout)).toBe(true);
  });

  it('returns false when touch is well outside the chip', () => {
    const chipPx = islandLayout.islandChip!.px;
    expect(isIslandTap(chipPx + 100, islandLayout)).toBe(false);
  });

  it('returns false when there is no island chip on the layout', () => {
    expect(isIslandTap(0, noIslandLayout)).toBe(false);
    expect(isIslandTap(22, noIslandLayout)).toBe(false);
  });
});
