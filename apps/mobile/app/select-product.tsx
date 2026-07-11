import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { setSelectedProduct, type Product } from "../src/lib/product";

// First screen a logged-out user sees — no marketing pages in the mobile
// app, just a direct choice before login, matching the two products the
// mobile-api actually serves (see apps/mobile-api).
export default function SelectProductScreen() {
  const router = useRouter();

  async function choose(product: Product) {
    await setSelectedProduct(product);
    router.push("/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tistra Health</Text>
      <Text style={styles.subtitle}>Who's tracking?</Text>

      <Pressable style={styles.card} onPress={() => choose("adults")}>
        <Text style={styles.cardEmoji}>🙋</Text>
        <Text style={styles.cardTitle}>Family / Self</Text>
        <Text style={styles.cardSubtitle}>Track your own meals, or a family member's.</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => choose("gym")}>
        <Text style={styles.cardEmoji}>💪</Text>
        <Text style={styles.cardTitle}>Gym & Coach</Text>
        <Text style={styles.cardSubtitle}>Track nutrition for your clients.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4, color: "#111", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 32, textAlign: "center" },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#faf9fc",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardEmoji: { fontSize: 32, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: "600", color: "#111", marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: "#666" },
});
