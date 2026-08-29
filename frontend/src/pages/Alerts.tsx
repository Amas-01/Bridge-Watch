import CompactAlertList from "../components/alerts/CompactAlertList";

export default function Alerts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Alerts</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Dense alert list — more rows visible at once with sort controls and bulk actions.
        </p>
      </div>
      <CompactAlertList />
    </div>
  );
}
