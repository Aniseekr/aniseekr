// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('node:path');
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
  // Project-local spec/ only. The node_modules negative lookahead is required —
  // some packages (e.g. @react-native-google-signin) ship runtime code under a
  // `spec/` folder; a bare /\/spec\// blocks their TurboModule specs and breaks
  // the build with "Unable to resolve module ../spec/NativeGoogleSignin.js".
  /^(?!.*\/node_modules\/).*\/spec\//,
  // RNRepo's prebuilt-framework cache (@rnrepo/expo-config-plugin). A native
  // build rewrites it under node_modules mid-session and the file watcher
  // crashes on the half-written tree ("TreeFS: Failed to make parent directory").
  /\/\.rnrepo-cache\//,
];
const existing = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existing)
  ? [...existing, ...blocked]
  : existing
    ? [existing, ...blocked]
    : blocked;

// react-native-css swaps every `react-native` import for its own facade so
// className works, but the facade lists only some exports (no
// NativeComponentRegistry, EventEmitter, …). expo-modules-core 58 calls
// NativeComponentRegistry.get at module load, so the release build died
// before the first frame and sat on the splash (TestFlight 1.3.0 (43)).
// Packages never take className, so they get the real react-native; app
// code keeps the facade.
const baseResolveRequest = config.resolver.resolveRequest;
const nativewindConfig = withNativewind(config);
const cssResolveRequest = nativewindConfig.resolver.resolveRequest;
nativewindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native' && context.originModulePath.includes(`${path.sep}node_modules${path.sep}`)) {
    return (baseResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  }
  return cssResolveRequest(context, moduleName, platform);
};

module.exports = nativewindConfig;
