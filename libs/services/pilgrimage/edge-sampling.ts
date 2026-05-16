export function edgeShaderSampleStep(_width: number, _height: number): readonly [number, number] {
  // RuntimeEffect `xy` is in local pixel coordinates because the image shader is
  // drawn into a same-sized surface. Sobel neighbors therefore need a one-pixel
  // offset, not normalized UV texel sizes.
  return [1, 1] as const;
}
