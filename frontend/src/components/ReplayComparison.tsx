import React, { useState } from "react";

interface Diff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: "added" | "removed" | "changed";
}

export function ReplayComparison() {
  const [assetCode, setAssetCode] = useState("");
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!assetCode) return;
    setLoading(true);

    try {
      const response = await fetch(
        `/api/v1/replay-comparison/snapshots?assetCode=${encodeURIComponent(assetCode)}&limit=2`
      );
      const data = await response.json();
      const snapshots = data.snapshots || [];

      if (snapshots.length >= 2) {
        const compareResponse = await fetch(
          `/api/v1/replay-comparison/diff?snapshot1Id=${snapshots[0].id}&snapshot2Id=${snapshots[1].id}`
        );
        const diffData = await compareResponse.json();
        setDiffs(diffData.diffs || []);
      }
    } catch (error) {
      console.error("Failed to compare snapshots:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Replay Comparison Diff View</h2>
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Enter asset code"
          value={assetCode}
          onChange={(e) => setAssetCode(e.target.value)}
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={handleCompare}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Comparing..." : "Compare"}
        </button>
      </div>

      {diffs.length > 0 && (
        <div className="space-y-2">
          {diffs.map((diff, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded border-l-4 border-blue-500">
              <div className="font-semibold text-sm">{diff.field}</div>
              <div className="text-xs text-gray-600">
                {diff.type === "added" && <span className="text-green-600">+ Added</span>}
                {diff.type === "removed" && <span className="text-red-600">- Removed</span>}
                {diff.type === "changed" && <span className="text-yellow-600">~ Changed</span>}
              </div>
              {diff.type === "changed" && (
                <div className="mt-1 text-xs font-mono">
                  <div className="text-red-600">- {JSON.stringify(diff.oldValue)}</div>
                  <div className="text-green-600">+ {JSON.stringify(diff.newValue)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
