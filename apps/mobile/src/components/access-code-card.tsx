import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AccessCodeResult } from '@/lib/api';

interface AccessCodeCardProps {
  personName: string;
  onGenerate: (ttlHours: 1 | 24) => Promise<AccessCodeResult>;
  onRegenerate: (ttlHours: 1 | 24) => Promise<AccessCodeResult>;
  onRevoke: () => Promise<{ ok: boolean }>;
}

/** Mobile equivalent of the web dashboard's AccessCodeCard (see
 * src/components/shared/dashboard/AccessCodeCard.tsx) — same "Temporary
 * Access Code" feature, generate/regenerate/revoke, same one-time-display
 * rule for the plaintext code. "Copy WhatsApp message" opens the native
 * share sheet instead of a clipboard copy, since that's the more natural
 * mobile equivalent (lets the person pick WhatsApp, SMS, or anything else
 * directly rather than switching apps to paste). */
export function AccessCodeCard({ personName, onGenerate, onRegenerate, onRevoke }: AccessCodeCardProps) {
  const theme = useTheme();
  const [result, setResult] = useState<AccessCodeResult | null>(null);
  const [ttlHours, setTtlHours] = useState<1 | 24>(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(action: (ttlHours: 1 | 24) => Promise<AccessCodeResult>) {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      setResult(await action(ttlHours));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    try {
      await onRevoke();
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!result) return;
    await Clipboard.setStringAsync(result.code);
    setCopied(true);
  }

  async function shareWhatsAppMessage() {
    if (!result) return;
    await Share.share({
      message: `Hi ${personName}! Here's your Tistra Health access code: ${result.formattedCode}. Go to tistrahealth.com/my-progress, enter your WhatsApp number and this code to view your dashboard. It works once and expires soon.`,
    });
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Generate access code</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
        Create a temporary code so {personName} can open their private Tistra Health dashboard.
      </ThemedText>

      {!result && (
        <>
          <View style={styles.ttlRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Expires in
            </ThemedText>
            {([24, 1] as const).map((hours) => (
              <Pressable
                key={hours}
                onPress={() => setTtlHours(hours)}
                style={[styles.ttlPill, { borderColor: theme.textSecondary }, ttlHours === hours && { backgroundColor: theme.backgroundSelected, borderColor: theme.primary }]}
              >
                <ThemedText type="small">{hours === 24 ? '24 hours' : '1 hour'}</ThemedText>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => run(onGenerate)} disabled={loading} style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="default" style={styles.primaryButtonText}>Generate access code</ThemedText>}
          </Pressable>
        </>
      )}

      {result && (
        <View style={styles.resultBlock}>
          <ThemedText type="code" style={styles.codeText}>
            {result.formattedCode}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.expiryText}>
            This code works once and expires {new Date(result.expiresAt).toLocaleString()}. Only share it with {personName}.
          </ThemedText>

          <View style={styles.row}>
            <Pressable onPress={copyCode} style={[styles.secondaryButton, { borderColor: theme.textSecondary }]}>
              <ThemedText type="small">{copied ? 'Copied!' : 'Copy code'}</ThemedText>
            </Pressable>
            <Pressable onPress={shareWhatsAppMessage} style={[styles.secondaryButton, { borderColor: theme.textSecondary }]}>
              <ThemedText type="small">Share message</ThemedText>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable onPress={() => run(onRegenerate)} disabled={loading} style={[styles.secondaryButton, { borderColor: theme.textSecondary, opacity: loading ? 0.6 : 1 }]}>
              <ThemedText type="small">Regenerate code</ThemedText>
            </Pressable>
            <Pressable onPress={handleRevoke} disabled={loading} style={[styles.secondaryButton, styles.revokeButton, { opacity: loading ? 0.6 : 1 }]}>
              <ThemedText type="small" style={styles.revokeText}>Revoke code</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {error && (
        <ThemedText type="small" style={styles.errorText}>
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.two },
  description: { marginBottom: Spacing.one },
  ttlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  ttlPill: { borderWidth: 1, borderRadius: Spacing.four, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  primaryButton: { borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  resultBlock: { gap: Spacing.two, alignItems: 'center' },
  codeText: { fontSize: 28, letterSpacing: 4, fontWeight: '700' },
  expiryText: { textAlign: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two, width: '100%' },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  revokeButton: { borderColor: '#C0392B' },
  revokeText: { color: '#C0392B' },
  errorText: { color: '#C0392B' },
});
