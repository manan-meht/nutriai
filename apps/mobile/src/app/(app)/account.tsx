import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

// Account settings, and the only place an account can be deleted.
//
// Exists because App Store guideline 5.1.1(v) requires deletion to be
// initiable inside the app. Before this the app had no account screen at
// all and the website offered only a mailto: link, which does not satisfy
// it and is a poor experience regardless.
//
// The deletion is real and immediate, not a request queued for someone to
// action. Two things guard it: the consequences are listed before the
// control, and the person has to type DELETE. A single destructive tap on
// a phone is too easy.

export default function AccountScreen() {
  const theme = useTheme();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirm.trim().toUpperCase() === 'DELETE' && !deleting;

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await api.deleteMyAccount();
      // The session is dead server-side; clear it locally so the app does
      // not sit on a token for an account that no longer exists.
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This removes your account and your data. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Account' }} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable
            style={[styles.button, { borderColor: theme.backgroundSelected }]}
            onPress={() => supabase.auth.signOut()}
            disabled={deleting}
          >
            <ThemedText style={styles.buttonText}>Sign out</ThemedText>
          </Pressable>

          <ThemedView type="backgroundElement" style={styles.divider} />

          <ThemedText type="subtitle" style={styles.heading}>
            Delete your account
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            This permanently deletes your account and the data in it — the people you
            track, their profiles, and every meal photo and log. It cannot be undone.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            Billing and transaction records are kept for up to seven years, as our
            privacy policy explains, because we are required to keep them.
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Type DELETE to confirm
          </ThemedText>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={theme.textSecondary}
            editable={!deleting}
          />

          {error && (
            <ThemedText type="small" style={[styles.body, { color: '#D32F2F' }]}>
              {error}
            </ThemedText>
          )}

          <Pressable
            style={[styles.button, styles.destructive, !canDelete && styles.disabled]}
            onPress={confirmDelete}
            disabled={!canDelete}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.destructiveText}>Delete my account</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  heading: { marginTop: Spacing.two },
  body: { lineHeight: 20 },
  label: { marginTop: Spacing.two },
  divider: { height: 1, marginVertical: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16 },
  destructive: { backgroundColor: '#D32F2F', borderColor: '#D32F2F' },
  destructiveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
