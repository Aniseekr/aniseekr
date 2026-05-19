// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Keep test scaffolding and CLI scripts out of the production bundle —
// they import from `bun:test` and use `import.meta.dir` which Hermes can't compile.
const blocked = [
  /\/__tests__\/.*/,
  /\/test-setup\.ts$/,
  /\/scripts\/check-spec-traceability\.ts$/,
  /\/spec\/.*/,
];
const existing = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existing)
  ? [...existing, ...blocked]
  : existing
    ? [existing, ...blocked]
    : blocked;

module.exports = withNativewind(config);
