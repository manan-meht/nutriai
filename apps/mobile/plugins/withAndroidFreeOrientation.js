const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// Lets Android decide the orientation, while iOS stays portrait.
//
// Play Console flags `android:screenOrientation="portrait"` on MainActivity:
// from Android 16 the OS ignores orientation and resizability restrictions on
// large screens anyway, so a tablet or unfolded foldable WILL rotate the app
// whether the manifest asks for portrait or not. Better to opt in and lay out
// for it than to have the restriction overridden.
//
// This can't be done through app.json's `orientation` setting, which is
// cross-platform: @expo/config-plugins' iOS handler writes
// UISupportedInterfaceOrientations by spreading its derived value OVER
// whatever ios.infoPlist specifies (see its setOrientation), so an explicit
// infoPlist override cannot win. Setting `orientation: "default"` would
// therefore unlock rotation on iOS too — on a phone-only app
// (supportsTablet: false) that was designed and shipped portrait.
//
// So `orientation` stays "portrait" for iOS's sake and this strips the
// attribute on Android only. Removing it entirely rather than writing
// "unspecified" leaves the platform default in place, which is the same
// behaviour and one less thing asserted in the manifest.
//
// Only MainActivity is ours to change. The other activity Play lists,
// com.google.mlkit...GmsBarcodeScanningDelegateActivity, is declared by
// Google's code-scanner library, which expo-dev-launcher pulls in with a
// plain `implementation` so it lands in release builds too. Excluding it
// means excluding expo-dev-client from autolinking, which is a global
// package.json setting and would break development builds — left alone
// deliberately; it is unreachable in a production build.

const SCREEN_ORIENTATION = 'android:screenOrientation';

module.exports = function withAndroidFreeOrientation(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    delete mainActivity.$[SCREEN_ORIENTATION];
    return config;
  });
};
