import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii } from "../src/lib/theme";

// First screen a logged-out user sees — no marketing pages in the mobile
// app, just a direct choice before login. Self and Family both lead to
// the "adults" product's login (see app/login/self.tsx and
// app/login/family.tsx — they share the same account scoping, only the
// copy differs; which dashboard area a session lands in afterward is
// decided by workspace.plan, see app/_layout.tsx), Coach to the "gym"
// product's login.
export default function SelectProductScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tistra Health</Text>
      <Text style={styles.subtitle}>Who's tracking?</Text>

      <Pressable style={styles.card} onPress={() => router.push("/login/self")}>
        <Text style={styles.cardEmoji}>🙋</Text>
        <Text style={styles.cardTitle}>Self</Text>
        <Text style={styles.cardSubtitle}>Track your own meals and habits.</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => router.push("/login/family")}>
        <Text style={styles.cardEmoji}>👨‍👩‍👧</Text>
        <Text style={styles.cardTitle}>Family</Text>
        <Text style={styles.cardSubtitle}>Track meals for a partner, parent, or child.</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => router.push("/login/coach")}>
        <Text style={styles.cardEmoji}>💪</Text>
        <Text style={styles.cardTitle}>Gym & Coach</Text>
        <Text style={styles.cardSubtitle}>Track nutrition for your clients.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.white },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4, color: colors.textPrimary, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: 32, textAlign: "center" },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 20,
    marginBottom: 16,
  },
  cardEmoji: { fontSize: 32, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: "600", color: colors.textPrimary, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: colors.textSecondary },
});
