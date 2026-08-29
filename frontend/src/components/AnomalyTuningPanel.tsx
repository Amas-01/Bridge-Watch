import { FormEvent, useState } from "react";
import {
  createAnomalyTuningOverride,
  deleteAnomalyTuningOverride,
  getAnomalyTuning,
  updateAnomalyTuning,
  type AnomalyTuningOverride,
  type AnomalyTuningProfile,
} from "../services/api";

function defaultExpiry(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AnomalyTuningPanel() {
  const [apiKey, setApiKey] = useState("");
  const [profile, setProfile] = useState<AnomalyTuningProfile | null>(null);
  const [overrides, setOverrides] = useState<AnomalyTuningOverride[]>([]);
  const [deviationMultiplier, setDeviationMultiplier] = useState(3);
  const [slidingWindowSize, setSlidingWindowSize] = useState(20);
  const [assetCode, setAssetCode] = useState("*");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await getAnomalyTuning(apiKey);
      setProfile(data.profile);
      setOverrides(data.overrides);
      setDeviationMultiplier(data.profile.deviation_multiplier);
      setSlidingWindowSize(data.profile.sliding_window_size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load anomaly tuning");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await updateAnomalyTuning(apiKey, { deviationMultiplier, slidingWindowSize });
      setProfile(data.profile);
      setMessage("Tuning profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update anomaly tuning");
    } finally {
      setBusy(false);
    }
  };

  const createOverride = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await createAnomalyTuningOverride(apiKey, {
        assetCode: assetCode.trim() || "*",
        reason,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setOverrides((current) => [...current, data.override]);
      setReason("");
      setMessage("Temporary silence created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create temporary silence");
    } finally {
      setBusy(false);
    }
  };

  const removeOverride = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await deleteAnomalyTuningOverride(apiKey, id);
      setOverrides((current) => current.filter((override) => override.id !== id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove temporary silence");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-stellar-border bg-stellar-card p-6" aria-labelledby="anomaly-tuning-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="anomaly-tuning-title" className="text-xl font-semibold text-white">Anomaly Detection Tuning</h2>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Adjust rolling baselines and schedule temporary silences. Admin configuration scope is required.
          </p>
        </div>
        <div className="flex w-full gap-2 lg:w-auto">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Admin API key"
            aria-label="Admin API key"
            className="min-w-0 flex-1 rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white lg:w-64"
          />
          <button type="button" onClick={load} disabled={!apiKey || busy} className="rounded-md bg-stellar-blue px-4 py-2 font-medium text-white disabled:opacity-50">
            Load
          </button>
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-stellar-text-secondary" role="status">{message}</p>}

      {profile && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <form onSubmit={saveProfile} className="space-y-4 rounded-md border border-stellar-border p-4">
            <h3 className="font-semibold text-white">Rolling baseline</h3>
            <label className="block text-sm text-stellar-text-secondary">
              Deviation multiplier
              <input type="number" min="0.1" max="20" step="0.1" value={deviationMultiplier} onChange={(event) => setDeviationMultiplier(Number(event.target.value))} className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-stellar-text-secondary">
              Sliding window (observations)
              <input type="number" min="3" max="1000" value={slidingWindowSize} onChange={(event) => setSlidingWindowSize(Number(event.target.value))} className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
            </label>
            <button disabled={busy} className="rounded-md bg-stellar-blue px-4 py-2 font-medium text-white disabled:opacity-50">Save tuning</button>
          </form>

          <form onSubmit={createOverride} className="space-y-4 rounded-md border border-stellar-border p-4">
            <h3 className="font-semibold text-white">Temporary silence</h3>
            <label className="block text-sm text-stellar-text-secondary">
              Asset code (* for all)
              <input value={assetCode} onChange={(event) => setAssetCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-stellar-text-secondary">
              Expires at
              <input type="datetime-local" required value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-stellar-text-secondary">
              Reason
              <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
            </label>
            <button disabled={busy} className="rounded-md bg-stellar-blue px-4 py-2 font-medium text-white disabled:opacity-50">Silence anomalies</button>
          </form>
        </div>
      )}

      {overrides.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-white">Active silences</h3>
          <ul className="mt-3 space-y-2">
            {overrides.map((override) => (
              <li key={override.id} className="flex flex-col gap-2 rounded-md border border-stellar-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-stellar-text-secondary">
                  <strong className="text-white">{override.asset_code}</strong> · {override.reason} · until {new Date(override.expires_at).toLocaleString()}
                </span>
                <button type="button" disabled={busy} onClick={() => removeOverride(override.id)} className="text-left text-red-400 hover:text-red-300 disabled:opacity-50">Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
