import { PeopleDashboard } from "../../../src/components/PeopleDashboard";

export default function CoachDashboardScreen() {
  return (
    <PeopleDashboard
      workspacePath="/gym/workspace"
      listPath="/gym/clients"
      listKey="clients"
      emptyLabel="No clients added yet."
      detailRouteBase="/(app)/coach/person"
    />
  );
}
