import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { appleSignInAvailable } from '@/lib/apple-auth';
import { Spacing } from '@/constants/theme';

/**
 * Apple's own button, rendered with their component rather than a
 * look-alike: guideline 4.8 and the Human Interface Guidelines both
 * require Apple's mark, wording and styling, and a hand-built one is a
 * rejection.
 *
 * Renders nothing off iOS and nothing on an iOS version that cannot present
 * the sheet, so Android is untouched.
 */
export function AppleSignInButton({
  mode,
  onPress,
  loading,
  disabled,
  colorScheme,
}: {
  /** "signIn" or "signUp" — Apple varies the wording, and using the wrong
   *  one on a create-account screen reads as a bug to a reviewer. */
  mode: 'signIn' | 'signUp';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  colorScheme: 'light' | 'dark';
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    appleSignInAvailable().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  if (loading) {
    return (
      <View style={[styles.button, styles.loading]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        mode === 'signUp'
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
      }
      // Inverted against the app's scheme, which is what Apple's guidance
      // asks for: the button must contrast with the background it sits on.
      buttonStyle={
        colorScheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={12}
      style={[styles.button, disabled && styles.disabled]}
      onPress={disabled ? () => {} : onPress}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 48,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
