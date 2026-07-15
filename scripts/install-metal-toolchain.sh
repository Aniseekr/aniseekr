#!/usr/bin/env bash
# Xcode 26+ ships Metal as an optional component; without it, .metal shader
# compilation (Skia, vision-camera) fails with "cannot execute tool 'metal'".
# Idempotent: no-op when the Metal compiler is actually executable.
set -euo pipefail

[[ "$(uname)" == "Darwin" ]] || exit 0

# Xcode ships a `metal` launcher stub even when the optional toolchain is not
# installed, so `xcrun -f metal` alone produces a false positive. Execute the
# compiler to verify the component is actually available.
if xcrun metal --version >/dev/null 2>&1; then
  exit 0
fi

echo "Metal Toolchain not found — downloading (~700MB)…"
xcodebuild -downloadComponent MetalToolchain
