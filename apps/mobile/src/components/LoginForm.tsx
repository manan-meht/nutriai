import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { scopedEmail } from "../lib/auth";
import { signInWithOAuthProvider } from "../lib/oauth";
import { colors, radii } from "../lib/theme";
import { GoogleIcon, FacebookIcon } from "./BrandIcons";

interface LoginFormProps {
  /** Determines the account scoping via scopedEmail() — "adults" for both
   * Self and Family (they share the same underlying account tag; only the
   * post-login workspace.plan tells them apart, see app/_layout.tsx),
   * "gym" for Coach. */
  scopeAs: "adults" | "gym";
  subtitle: string;
}

// Shared by app/login/self.tsx, app/login/family.tsx, and
// app/login/coach.tsx — those are deliberately separate route files/flows
// per product (even though Self and Family's login logic is identical
// today), but the actual form UI is one component so a fix or style change
// doesn't need to be repeated three times.
export function LoginForm({ scopeAs, subtitle }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: scopedEmail(email.trim(), scopeAs),
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

  async function handleOAuth(provider: "google" | "facebook") {
    setError(null);
    setOauthLoading(provider);
    try {
      await signInWithOAuthProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tistra Health</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <Pressable
        style={styles.oauthButton}
        onPress={() => handleOAuth("google")}
        disabled={loading || !!oauthLoading}
      >
        {oauthLoading === "google" ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <>
            <GoogleIcon />
            <Text style={styles.oauthButtonText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={styles.oauthButton}
        onPress={() => handleOAuth("facebook")}
        disabled={loading || !!oauthLoading}
      >
        {oauthLoading === "facebook" ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <>
            <FacebookIcon />
            <Text style={styles.oauthButtonText}>Continue with Facebook</Text>
          </>
        )}
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

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

      <Pressable style={styles.button} onPress={handleLogin} disabled={loading || !!oauthLoading}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.white },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4, color: colors.textPrimary },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: 32 },
  oauthButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
    backgroundColor: colors.white,
  },
  oauthButtonText: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 10, fontSize: 13, color: colors.textMeta },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  error: { color: colors.error, marginBottom: 12 },
});
