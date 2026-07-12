import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { apiPost, apiPatch } from "../lib/api";
import { colors, radii } from "../lib/theme";
import { NutritionGoalFields, EMPTY_NUTRITION_GOAL_FIELDS, type NutritionGoalFieldsValue } from "./NutritionGoalFields";

const RELATIONSHIPS = ["Son", "Daughter", "Spouse", "Parent", "Sibling", "Friend", "Other"];

export interface PersonFormInitialValues {
  fullName?: string;
  relationship?: string;
  age?: string;
  gender?: string;
  weightKg?: string;
  heightCm?: string;
  goalFields?: NutritionGoalFieldsValue;
}

interface PersonFormProps {
  /** "adults" posts/patches to /adults/contacts; "gym" to /gym/clients.
   * Only "adults" shows the relationship field (gym clients don't have
   * one) — mirrors AddContactModal vs AddClientModal on web. */
  product: "adults" | "gym";
  mode: "add" | "edit";
  personId?: string;
  initialValues?: PersonFormInitialValues;
  /** Hides the "Myself" relationship option — passed by the caller once it
   * already has the contacts list loaded (see family/add.tsx), same as
   * hasSelfContact on web's AddContactModal. Ignored for product="gym". */
  hasSelfContact?: boolean;
  onSuccess: () => void;
}

/** Shared by the add/edit screens for both products — mirrors
 * AddContactModal/EditContactModal/AddClientModal/EditClientModal on web,
 * collapsed into one RN component since the fields are otherwise
 * identical. */
export function PersonForm({ product, mode, personId, initialValues, hasSelfContact, onSuccess }: PersonFormProps) {
  const [fullName, setFullName] = useState(initialValues?.fullName ?? "");
  const [countryCode, setCountryCode] = useState("91");
  const [whatsapp, setWhatsapp] = useState("");
  const [relationship, setRelationship] = useState(initialValues?.relationship ?? "");
  const [age, setAge] = useState(initialValues?.age ?? "");
  const [gender, setGender] = useState(initialValues?.gender ?? "");
  const [weightKg, setWeightKg] = useState(initialValues?.weightKg ?? "");
  const [heightCm, setHeightCm] = useState(initialValues?.heightCm ?? "");
  const [goalFields, setGoalFields] = useState<NutritionGoalFieldsValue>(initialValues?.goalFields ?? EMPTY_NUTRITION_GOAL_FIELDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const isSelf = product === "adults" && relationship === "self";
      const body: Record<string, unknown> = {
        fullName,
        age: age ? parseInt(age, 10) : undefined,
        gender: gender || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
        heightCm: heightCm ? parseFloat(heightCm) : undefined,
        primaryNutritionGoal: goalFields.primaryNutritionGoal || undefined,
        dateOfBirth: goalFields.dateOfBirth || undefined,
        metabolicEquationSex: goalFields.metabolicEquationSex || undefined,
        activityLevel: goalFields.activityLevel || undefined,
        resistanceTrainingStatus: goalFields.resistanceTrainingStatus || undefined,
        targetWeightKg: goalFields.targetWeightKg ? parseFloat(goalFields.targetWeightKg) : undefined,
      };
      if (product === "adults") {
        body.relationship = isSelf ? undefined : relationship || undefined;
        body.relationshipType = isSelf ? "self" : undefined;
      }

      if (mode === "add") {
        body.whatsappNumber = `+${countryCode}${whatsapp.replace(/\D/g, "")}`;
        const path = product === "adults" ? "/adults/contacts" : "/gym/clients";
        await apiPost(path, body);
      } else {
        const path = product === "adults" ? `/adults/contacts/${personId}` : `/gym/clients/${personId}`;
        await apiPatch(path, body);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>{product === "adults" ? "About them" : "Client details"}</Text>
      <Field label="Full name">
        <TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" style={styles.input} />
      </Field>

      {product === "adults" && (
        <Field label="Relationship">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {!hasSelfContact && mode === "add" && (
              <Chip label="Myself" active={relationship === "self"} onPress={() => setRelationship("self")} />
            )}
            {RELATIONSHIPS.map((r) => (
              <Chip key={r} label={r} active={relationship === r.toLowerCase()} onPress={() => setRelationship(r.toLowerCase())} />
            ))}
          </ScrollView>
        </Field>
      )}

      {mode === "add" && (
        <Field label="WhatsApp number">
          <View style={styles.phoneRow}>
            <View style={styles.countryCodeBox}>
              <Text style={styles.countryCodePrefix}>+</Text>
              <TextInput value={countryCode} onChangeText={(t) => setCountryCode(t.replace(/\D/g, ""))} maxLength={4} style={styles.countryCodeInput} />
            </View>
            <TextInput
              value={whatsapp}
              onChangeText={(t) => setWhatsapp(t.replace(/\D/g, ""))}
              placeholder="98765 43210"
              keyboardType="phone-pad"
              style={[styles.input, styles.phoneInput]}
            />
          </View>
        </Field>
      )}

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Age">
            <TextInput value={age} onChangeText={setAge} placeholder="35" keyboardType="numeric" style={styles.input} />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Gender">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {["male", "female", "other"].map((g) => (
                <Chip key={g} label={g.charAt(0).toUpperCase() + g.slice(1)} active={gender === g} onPress={() => setGender(g)} />
              ))}
            </ScrollView>
          </Field>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Weight (kg)">
            <TextInput value={weightKg} onChangeText={setWeightKg} placeholder="70" keyboardType="numeric" style={styles.input} />
          </Field>
        </View>
        <View style={styles.half}>
          <Field label="Height (cm)">
            <TextInput value={heightCm} onChangeText={setHeightCm} placeholder="170" keyboardType="numeric" style={styles.input} />
          </Field>
        </View>
      </View>

      <View style={styles.divider} />

      <NutritionGoalFields value={goalFields} onChange={setGoalFields} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={loading || !fullName.trim()}>
        {loading ? <ActivityIndicator color={colors.white} /> : (
          <Text style={styles.submitButtonText}>{mode === "add" ? "Add" : "Save"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  phoneRow: { flexDirection: "row", gap: 8 },
  countryCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
  },
  countryCodePrefix: { fontSize: 14, color: colors.textSecondary },
  countryCodeInput: { width: 32, fontSize: 14, color: colors.textPrimary, padding: 8 },
  phoneInput: { flex: 1 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  error: { color: colors.error, marginTop: 16, fontSize: 13 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonText: { color: colors.white, fontSize: 15, fontWeight: "700" },
});
