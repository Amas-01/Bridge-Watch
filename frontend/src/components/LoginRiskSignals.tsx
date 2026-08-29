import React, { useState, useEffect } from "react";

interface RiskSignal {
  id: string;
  userAddress: string;
  signalType: string;
  riskLevel: string;
  detectedAt: string;
  isActive: boolean;
}

export function LoginRiskSignals() {
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSignals() {
      try {
        const response = await fetch("/api/v1/login-risk-signals/active-signals");
        const data = await response.json();
        setSignals(data.signals || []);
      } catch (error) {
        console.error("Failed to fetch risk signals:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSignals();
  }, []);

  if (loading) return <div className="text-center py-4">Loading risk signals...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Login Risk Signals</h2>
      {signals.length === 0 ? (
        <p className="text-gray-500">No active risk signals detected.</p>
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => (
            <div
              key={signal.id}
              className={`p-3 rounded border-l-4 ${
                signal.riskLevel === "critical"
                  ? "bg-red-50 border-red-500"
                  : signal.riskLevel === "high"
                    ? "bg-orange-50 border-orange-500"
                    : "bg-yellow-50 border-yellow-500"
              }`}
            >
              <div className="font-semibold">{signal.signalType}</div>
              <div className="text-sm text-gray-600">{signal.userAddress}</div>
              <div className="text-xs text-gray-500">{new Date(signal.detectedAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
