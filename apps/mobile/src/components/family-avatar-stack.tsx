import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme';

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Overlapping avatar row for the family summary strip — mirrors the web
 * dashboard's FamilyAvatarStack.tsx. `onAdd` renders a trailing "+" button,
 * shown only when the account can actually add another person. */
export function FamilyAvatarStack({
  people,
  onAdd,
}: {
  people: Array<{ id: string; fullName: string; photoUrl?: string }>;
  onAdd?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {people.slice(0, 4).map((p, i) => (
        <View key={p.id} style={[styles.avatarRing, { borderColor: theme.background }, i > 0 && styles.avatarOverlap]}>
          {p.photoUrl ? (
            <Image source={{ uri: p.photoUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" style={styles.avatarText}>
                {initialsFor(p.fullName)}
              </ThemedText>
            </View>
          )}
        </View>
      ))}
      {onAdd && (
        <Pressable
          onPress={onAdd}
          style={[styles.avatarRing, styles.addButton, styles.avatarOverlap, { backgroundColor: theme.primary, borderColor: theme.background }]}
        >
          <ThemedText type="default" style={styles.addButtonText}>
            +
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  avatarOverlap: { marginLeft: -10 },
  avatar: { width: '100%', height: '100%', borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontWeight: '700' },
  addButton: { alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 20, lineHeight: 22 },
});
