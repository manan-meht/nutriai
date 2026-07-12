import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PersonForm, type PersonFormInitialValues } from "../../../../../src/components/PersonForm";
import { EMPTY_NUTRITION_GOAL_FIELDS } from "../../../../../src/components/NutritionGoalFields";
import { apiGet } from "../../../../../src/lib/api";
import { colors } from "../../../../../src/lib/theme";

interface GymClientResponse {
  client: {
    fullName: string;
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

export default function EditClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [initialValues, setInitialValues] = useState<PersonFormInitialValues | null>(null);

  useEffect(() => {
    apiGet<GymClientResponse>(`/gym/clients/${id}`).then(({ client }) => {
      setInitialValues({
        fullName: client.fullName,
        age: client.age?.toString() ?? "",
        gender: client.gender ?? "",
        weightKg: client.weightKg?.toString() ?? "",
        heightCm: client.heightCm?.toString() ?? "",
        goalFields: {
          ...EMPTY_NUTRITION_GOAL_FIELDS,
          primaryNutritionGoal: (client.primaryNutritionGoal as any) ?? "",
          dateOfBirth: client.dateOfBirth ?? "",
          metabolicEquationSex: client.metabolicEquationSex ?? "",
          activityLevel: client.activityLevel ?? "unknown",
          resistanceTrainingStatus: client.resistanceTrainingStatus ?? "unknown",
          targetWeightKg: client.targetWeightKg?.toString() ?? "",
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
      product="gym"
      mode="edit"
      personId={id}
      initialValues={initialValues}
      onSuccess={() => router.back()}
    />
  );
}
