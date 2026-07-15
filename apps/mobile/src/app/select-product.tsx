import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ProductPicker } from '@/components/product-picker';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { setPendingProductSelection } from '@/lib/product-intent';

// First screen a logged-out user sees — no marketing pages in the mobile
// app, just a direct choice before login, since which scoped email to
// authenticate with (see lib/auth.ts#scopedEmail) depends on it. See
// components/product-picker.tsx for why the card UI itself lives there
// instead of here.
export default function SelectProductScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Tistra Health
        </ThemedText>
        <ProductPicker
          headline="How will you use Tistra Health?"
          subhead="Choose the option that best fits you. You can change this later."
          onContinue={(selected) => {
            setPendingProductSelection(selected);
            router.push({ pathname: '/login', params: { product: selected } });
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
});
