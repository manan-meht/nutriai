import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

// No-op subscribe — hydration status never changes after mount, so there's
// nothing to notify on. This is the standard useSyncExternalStore trick
// for an "has the client mounted yet" flag (used the same way by
// usehooks-ts's useIsClient, etc.): avoids ever calling setState from
// inside an effect body just to flip a hydration flag, which the previous
// useState+useEffect version did.
function subscribe(): () => void {
  return () => {};
}

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true, // client snapshot: always hydrated once this runs in the browser
    () => false // server snapshot: never hydrated during SSR
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
