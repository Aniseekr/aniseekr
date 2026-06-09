/* eslint-env node */
const { withGradleProperties } = require('@expo/config-plugins');

// R8 (enableMinifyInReleaseBuilds) OOMs at the template default of -Xmx2048m
// on this app's dependency graph. Raise the Gradle daemon heap so minified
// release builds survive prebuild regeneration of gradle.properties.
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

const withGradleJvmHeap = (config) => {
  return withGradleProperties(config, (modConfig) => {
    const props = modConfig.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
    );
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    modConfig.modResults = props;
    return modConfig;
  });
};

module.exports = withGradleJvmHeap;
