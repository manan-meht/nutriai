import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { scopedEmail } from "../src/lib/auth";
import { getSelectedProduct, type Product } from "../src/lib/product";

const PRODUCT_COPY: Record<Product, string> = {
  adults: "Sign in to your family account",
  gym: "Sign in to your coaching account",
};

export default function LoginScreen() {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSelectedProduct().then((p) => {
      if (!p) {
        // Arrived at /login directly without picking a product first
        // (e.g. deep link, or a cold start mid-flow) — send them back.
        router.replace("/select-product");
      } else {
        setProduct(p);
      }
    });
  }, [router]);

  async function handleLogin() {
    if (!product) return;
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: scopedEmail(email.trim(), product),
        password,
      });
      if (error) throw error;
      // Navigation on success is handled by the auth-state listener in
      // app/_layout.tsx, not here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!product) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tistra Health</Text>
      <Text style={styles.subtitle}>{PRODUCT_COPY[product]}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4, color: "#111" },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#6750A4",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#c00", marginBottom: 12 },
});
