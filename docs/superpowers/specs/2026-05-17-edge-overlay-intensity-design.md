# Edge Overlay Intensity Design

## Context

The pilgrimage camera overlay currently has three modes: Anime, Sketch, and Edge. Edge renders only a generated Skia edge image. While that can be useful for precise alignment, it can feel empty or too stark because it does not show the original reference image underneath.

## Goal

Make Edge easier to use by adding intensity levels:

- Low: `Edge+`, a positioning-friendly mode that shows a faint reference image plus light edge lines.
- Mid: `Edge`, a clearer outline mode close to the current behavior.
- High: `Edge Max`, a stronger outline mode with heavier contrast.

The existing overlay opacity slider remains separate. Opacity controls the whole overlay. Edge intensity controls the generated edge treatment and whether the faint original image is included.

## UX

When the user selects Edge in the overlay controls, show a compact `Low / Mid / High` selector below the mode row. Low is labeled `Edge+` in user-facing state where space permits.

Default Edge intensity is Low, because the requested primary use case is alignment with both a faint image and edge lines. Users can raise intensity when the reference image is visually busy or the lines are too subtle.

If Edge generation fails, the overlay falls back to a faint original reference image rather than rendering nothing. The current loading state remains visible while generation is in progress.

## Implementation Shape

Add an `EdgeIntensity` value owned by the camera screen and passed to:

- `OverlayControls`, to render and update the intensity selector.
- `useEdgeOrSketch`, to configure edge generation.
- `OverlayLayer`, to optionally render the faint original image behind the Skia edge image.

Edge generation should keep using the existing cache key pattern, extended by threshold and ink opacity values. Sketch behavior should not change.

## Testing

Add focused unit coverage for pure edge-intensity configuration helpers: Low, Mid, and High should map to explicit threshold, line opacity, and source-image backdrop opacity values.

Manual verification should cover:

- Edge Low shows a faint reference image plus edge lines.
- Edge Mid/High show progressively stronger edges.
- Opacity slider still affects the whole overlay.
- Edge failure falls back to a faint reference image instead of a blank overlay.
