import { ActivityIndicator, Image, type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';

export function LoadingState() {
  return (
    <ThemedView style={styles.centered}>
      <ActivityIndicator />
    </ThemedView>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ThemedView style={styles.centered}>
      <ThemedText type="default" style={styles.text}>
        {message}
      </ThemedText>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <ThemedText style={styles.retryText}>Try again</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export function EmptyState({
  title,
  message,
  action,
  image,
}: {
  title?: string;
  message: string;
  // Either an external link (opens in the system browser) or an in-app
  // action (e.g. navigate to an add screen) — the add/edit screens use
  // onPress, everything else so far has used href.
  action?: { label: string } & ({ href: `https://${string}` } | { onPress: () => void });
  // Optional illustration shown above the title, in a soft circular frame —
  // only worth the visual weight for a "first-run" empty state (e.g. no
  // family members added yet), not for transient/error-adjacent states.
  image?: ImageSourcePropType;
}) {
  return (
    <ThemedView style={styles.centered}>
      {image && (
        <View style={styles.illustrationWrap}>
          <View style={styles.illustrationHalo} />
          <Image source={image} style={styles.illustration} resizeMode="cover" alt="" />
        </View>
      )}
      {title && (
        <ThemedText type="subtitle" style={styles.emptyTitle}>
          {title}
        </ThemedText>
      )}
      <ThemedText type="default" themeColor="textSecondary" style={styles.text}>
        {message}
      </ThemedText>
      {action && 'href' in action && (
        <ExternalLink href={action.href} style={styles.retryButton}>
          <ThemedText style={styles.retryText}>{action.label}</ThemedText>
        </ExternalLink>
      )}
      {action && 'onPress' in action && (
        <Pressable style={styles.retryButton} onPress={action.onPress}>
          <ThemedText style={styles.retryText}>{action.label}</ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  illustrationWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  illustrationHalo: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#5715CE',
    opacity: 0.12,
  },
  illustration: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: '#F1EEF4',
  },
  text: {
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#5715CE',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
