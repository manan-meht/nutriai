import AsyncStorage from "@react-native-async-storage/async-storage";

export type Product = "adults" | "gym";

const STORAGE_KEY = "selectedProduct";

// Persists the user's product choice from the selection screen through
// login and into the dashboard, so a screen deep in the (app) group
// doesn't need it threaded through as a route param. AsyncStorage (not
// component state) so it survives a cold app restart with an existing
// session — the selection screen otherwise only ever runs once per login.
export async function getSelectedProduct(): Promise<Product | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return value === "adults" || value === "gym" ? value : null;
}

export async function setSelectedProduct(product: Product): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, product);
}

export async function clearSelectedProduct(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
