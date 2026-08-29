import IncidentHeatmap from "../components/IncidentHeatmap";

export default function Incidents() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Incident Heatmap</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Visual overview of incident clustering across assets and time.
        </p>
      </div>
      <IncidentHeatmap />
    </div>
  );
}
