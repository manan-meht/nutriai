/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  // react-native's useColorScheme returns 'light' | 'dark' | null — null
  // when the system preference isn't available yet. The previous code
  // compared against 'unspecified', which it never returns, so null fell
  // straight through to Colors[null] === undefined and every caller threw
  // on its first property access.
  const scheme = useColorScheme();

  return Colors[scheme ?? 'light'];
}
