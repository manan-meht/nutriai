const { withProjectBuildGradle } = require('@expo/config-plugins');

// expo-dynamic-app-icon's own android/build.gradle (v1.2.0, unmaintained
// since compileSdkVersion default 31) hardcodes Java/Kotlin compile target
// 11, while the rest of this project's native modules compile against 17 —
// the Kotlin Gradle plugin treats that mismatch as a hard build failure
// ("Inconsistent JVM Target Compatibility Between Java and Kotlin Tasks"),
// not just a warning, on the Kotlin/Gradle versions this Expo SDK pulls in.
// Rather than patching that one module's build.gradle (which prebuild would
// overwrite/regenerate from node_modules on every build anyway), this
// forces every subproject's Java/Kotlin compile tasks to target 17
// uniformly — the standard workaround for a stale third-party Expo module
// lagging behind the app's own JVM target. Safe to apply broadly since 17
// is already what every other module in this project compiles against.
const GRADLE_SNIPPET = `
// Injected by withConsistentKotlinJvmTarget.js (see apps/mobile/plugins) —
// forces every subproject's Kotlin/Java compile tasks to JVM target 17,
// working around expo-dynamic-app-icon's own build.gradle hardcoding 11.
// tasks.withType(...).configureEach is already a lazy, deferred API — it
// configures each task at task-creation time regardless of when this block
// itself runs — so this deliberately does NOT wrap it in afterEvaluate.
// (An earlier version did wrap it in subprojects { afterEvaluate { ... } },
// which crashed with "Cannot run Project.afterEvaluate(Closure) when the
// project is already evaluated" — Expo's own autolinking settings-plugin
// had already finished evaluating at least one subproject by the time this
// root build.gradle got to this line, so registering a new afterEvaluate
// hook on it was too late. configureEach has no such timing dependency.)
subprojects {
  tasks.withType(JavaCompile).configureEach {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions {
      jvmTarget = "17"
    }
  }
}
`;

module.exports = function withConsistentKotlinJvmTarget(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      if (!config.modResults.contents.includes('withConsistentKotlinJvmTarget.js')) {
        config.modResults.contents += GRADLE_SNIPPET;
      }
    } else {
      throw new Error('withConsistentKotlinJvmTarget: expected a Groovy root build.gradle, got ' + config.modResults.language);
    }
    return config;
  });
};
