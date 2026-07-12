import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii } from "../src/lib/theme";

type ProductKey = "self" | "family" | "coach";

const OPTIONS: Array<{
  key: ProductKey;
  image: number;
  title: string;
  subtitle: string;
  route: "/login/self" | "/login/family" | "/login/coach";
}> = [
  {
    key: "self",
    image: require("../assets/onboarding/self.png"),
    title: "For myself",
    subtitle: "Track my meals, habits, and progress.",
    route: "/login/self",
  },
  {
    key: "family",
    image: require("../assets/onboarding/family.png"),
    title: "For my family",
    subtitle: "Support a parent, partner, or child.",
    route: "/login/family",
  },
  {
    key: "coach",
    image: require("../assets/onboarding/coach.png"),
    title: "For my clients",
    subtitle: "Use Tistra Health as a coach, trainer, or gym.",
    route: "/login/coach",
  },
];

// First screen a logged-out user sees — no marketing pages in the mobile
// app, just a direct choice before login. Self and Family both lead to
// the "adults" product's login (see app/login/self.tsx and
// app/login/family.tsx — they share the same account scoping, only the
// copy differs; which dashboard area a session lands in afterward is
// decided by workspace.plan, see app/_layout.tsx), Coach to the "gym"
// product's login.
//
// Layout ported from stitch/stitch_app_design/{ios_default_state,
// android_dark_theme_pressed} (radio-select illustrated cards, sticky
// disabled-until-selected Continue footer) — kept the app's existing
// purple theme instead of that mockup's own color/type system, see
// src/lib/theme.ts.
export default function SelectProductScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<ProductKey | null>(null);

  const selectedOption = OPTIONS.find((o) => o.key === selected);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tistra Health</Text>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>How will you use Tistra Health?</Text>
        <Text style={styles.subhead}>Choose the option that best fits you. You can change this later.</Text>

        {OPTIONS.map((option) => {
          const active = option.key === selected;
          return (
            <Pressable
              key={option.key}
              style={[styles.card, active && styles.cardActive]}
              onPress={() => setSelected(option.key)}
            >
              <View style={styles.imageWrap}>
                <Image source={option.image} style={styles.image} resizeMode="contain" />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{option.title}</Text>
                  <Text style={styles.cardSubtitle}>{option.subtitle}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.continueButton, !selectedOption && styles.continueButtonDisabled]}
          disabled={!selectedOption}
          onPress={() => selectedOption && router.push(selectedOption.route)}
        >
          <Text style={[styles.continueText, !selectedOption && styles.continueTextDisabled]}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, paddingTop: 56 },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, textAlign: "center", marginBottom: 12 },
  scroll: { paddingHorizontal: 24, paddingBottom: 24 },
  headline: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, marginBottom: 8, lineHeight: 30 },
  subhead: { fontSize: 15, color: colors.textSecondary, marginBottom: 24, lineHeight: 21 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 16,
    backgroundColor: colors.white,
  },
  cardActive: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  imageWrap: {
    width: "100%",
    height: 140,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  image: { width: "75%", height: "75%" },
  cardBody: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardText: { flex: 1, paddingRight: 16 },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.textPrimary, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  radio: {
    marginTop: 2,
    height: 24,
    width: 24,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioDot: { height: 10, width: 10, borderRadius: radii.full, backgroundColor: colors.white },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  continueButton: { backgroundColor: colors.primary, borderRadius: radii.full, paddingVertical: 16, alignItems: "center" },
  continueButtonDisabled: { backgroundColor: colors.border },
  continueText: { fontSize: 15, fontWeight: "700", color: colors.white },
  continueTextDisabled: { color: colors.textMeta },
});
