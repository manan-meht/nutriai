import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PersonForm, type PersonFormInitialValues } from "../../../../../src/components/PersonForm";
import { EMPTY_NUTRITION_GOAL_FIELDS } from "../../../../../src/components/NutritionGoalFields";
import { apiGet } from "../../../../../src/lib/api";
import { colors } from "../../../../../src/lib/theme";

interface AdultsContactResponse {
  contact: {
    fullName: string;
    relationship?: string;
    age?: number;
    gender?: string;
    weightKg?: number;
    heightCm?: number;
    primaryNutritionGoal?: string;
    dateOfBirth?: string;
    metabolicEquationSex?: string;
    activityLevel?: string;
    resistanceTrainingStatus?: string;
    targetWeightKg?: number;
  };
}

export default function EditFamilyMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [initialValues, setInitialValues] = useState<PersonFormInitialValues | null>(null);

  useEffect(() => {
    apiGet<AdultsContactResponse>(`/adults/contacts/${id}`).then(({ contact }) => {
      setInitialValues({
        fullName: contact.fullName,
        relationship: contact.relationship ?? "",
        age: contact.age?.toString() ?? "",
        gender: contact.gender ?? "",
        weightKg: contact.weightKg?.toString() ?? "",
        heightCm: contact.heightCm?.toString() ?? "",
        goalFields: {
          ...EMPTY_NUTRITION_GOAL_FIELDS,
          primaryNutritionGoal: (contact.primaryNutritionGoal as any) ?? "",
          dateOfBirth: contact.dateOfBirth ?? "",
          metabolicEquationSex: contact.metabolicEquationSex ?? "",
          activityLevel: contact.activityLevel ?? "unknown",
          resistanceTrainingStatus: contact.resistanceTrainingStatus ?? "unknown",
          targetWeightKg: contact.targetWeightKg?.toString() ?? "",
        },
      });
    });
  }, [id]);

  if (!initialValues) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <PersonForm
      product="adults"
      mode="edit"
      personId={id}
      initialValues={initialValues}
      onSuccess={() => router.back()}
    />
  );
}
