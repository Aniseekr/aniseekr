/* eslint-env node */
const { withGradleProperties } = require('@expo/config-plugins');

// R8 (enableMinifyInReleaseBuilds) OOMs at the template default of -Xmx2048m
// on this app's dependency graph. Raise the Gradle daemon heap so minified
// release builds survive prebuild regeneration of gradle.properties.
//
// The 4g heap plus parallel CMake/clang across every ABI got the daemon
// OOM-killed on the default EAS worker after SDK 58 (RN 0.88). Drop the
// 32-bit x86 ABI (emulator-only; Play doesn't need it) and cap Gradle
// workers so peak memory fits.
const PROPS = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.workers.max': '3',
  reactNativeArchitectures: 'armeabi-v7a,arm64-v8a,x86_64',
};

const withGradleJvmHeap = (config) => {
  return withGradleProperties(config, (modConfig) => {
    const props = modConfig.modResults.filter(
      (item) => !(item.type === 'property' && item.key in PROPS)
    );
    for (const [key, value] of Object.entries(PROPS)) {
      props.push({ type: 'property', key, value });
    }
    modConfig.modResults = props;
    return modConfig;
  });
};

module.exports = withGradleJvmHeap;
