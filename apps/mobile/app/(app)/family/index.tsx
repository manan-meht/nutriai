import { PeopleDashboard } from "../../../src/components/PeopleDashboard";

export default function FamilyDashboardScreen() {
  return (
    <PeopleDashboard
      workspacePath="/adults/workspace"
      listPath="/adults/contacts"
      listKey="contacts"
      emptyLabel="No one added yet."
      detailRouteBase="/(app)/family/person"
    />
  );
}
