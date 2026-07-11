import { View, ActivityIndicator } from "react-native";

// The bare root path has no real screen of its own — app/_layout.tsx's
// session-check effect redirects away from here to /select-product or
// /(app)/<tier> almost immediately. Without this file, Expo Router 404s
// ("page could not be found") on a cold launch at "/" in the brief window
// before that redirect fires, most visible launching via a custom-scheme
// deep link (dev client, or the app icon directly) rather than through
// Expo Go's own entry flow.
export default function RootIndex() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#6750A4" />
    </View>
  );
}
