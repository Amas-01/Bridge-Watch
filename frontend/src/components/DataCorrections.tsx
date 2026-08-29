import React, { useState, useEffect } from "react";

interface Correction {
  id: string;
  dataType: string;
  entityId: string;
  reason: string;
  status: string;
  requestedAt: string;
}

export function DataCorrections() {
  const [corrections, setPendingCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCorrections() {
      try {
        const response = await fetch("/api/v1/data-corrections/pending");
        const data = await response.json();
        setPendingCorrections(data.corrections || []);
      } catch (error) {
        console.error("Failed to fetch corrections:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCorrections();
  }, []);

  if (loading) return <div className="text-center py-4">Loading corrections...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Pending Data Corrections</h2>
      {corrections.length === 0 ? (
        <p className="text-gray-500">No pending corrections.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Data Type</th>
                <th className="px-4 py-2 text-left font-semibold">Entity ID</th>
                <th className="px-4 py-2 text-left font-semibold">Reason</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Requested</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((correction) => (
                <tr key={correction.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{correction.dataType}</td>
                  <td className="px-4 py-2 font-mono text-xs">{correction.entityId}</td>
                  <td className="px-4 py-2">{correction.reason}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                      {correction.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(correction.requestedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
