import { useState } from "react";
import { useWatchlist } from "../hooks/useWatchlist";

export function WatchlistManager() {
  const {
    watchlists,
    activeListId,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    setActiveWatchlist,
    importWatchlists,
  } = useWatchlist();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [importText, setImportText] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      createWatchlist(newName.trim());
      setNewName("");
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      renameWatchlist(id, editName.trim());
      setEditingId(null);
    }
  };

  const handleExport = () => {
    const jsonStr = JSON.stringify(watchlists, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bridgewatch_watchlists.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (importText.trim()) {
      const success = importWatchlists(importText);
      if (success) {
        setImportText("");
        alert("Watchlists imported successfully!");
      } else {
        alert("Failed to import: Invalid JSON format");
      }
    }
  };

  const generateShareLink = (id: string) => {
    const list = watchlists.find(w => w.id === id);
    if (!list) return;

    const singleExport = JSON.stringify([list]);
    const base64 = btoa(singleExport);
    const url = `${window.location.origin}/watchlist?import=${encodeURIComponent(base64)}`;
    navigator.clipboard.writeText(url).then(() => {
      alert("Share link copied to clipboard!");
    });
  };

  return (
    <div className="space-y-8 bg-stellar-card p-6 rounded-lg border border-stellar-border shadow-lg">
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Your Watchlists</h2>

        <form onSubmit={handleCreate} className="flex gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New watchlist name..."
            className="flex-1 bg-stellar-dark border border-stellar-border rounded px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="px-4 py-2 bg-stellar-blue text-white rounded font-medium hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </form>

        <div className="space-y-4">
          {watchlists.map((list) => (
            <div key={list.id} className="flex items-center justify-between p-4 bg-stellar-dark rounded border border-stellar-border">
              <div className="flex items-center gap-4 flex-1">
                {editingId === list.id ? (
                  <div className="flex gap-2 flex-1 max-w-sm">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-stellar-card border border-stellar-border rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-stellar-blue"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(list.id)}
                      className="text-green-400 hover:text-green-300 text-sm font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-gray-400 hover:text-white text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-bold text-white flex items-center gap-2">
                      {list.name}
                      {list.id === activeListId && (
                        <span className="bg-stellar-blue text-xs px-2 py-0.5 rounded-full font-normal">
                          Active
                        </span>
                      )}
                    </h3>
                    <span className="text-sm text-gray-400">{list.assets.length} items</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                {list.id !== activeListId && (
                  <button
                    onClick={() => setActiveWatchlist(list.id)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Set Active
                  </button>
                )}
                <button
                  onClick={() => generateShareLink(list.id)}
                  className="text-sm text-stellar-blue hover:text-blue-300 transition-colors"
                  title="Copy share link"
                >
                  Share
                </button>
                <button
                  onClick={() => {
                    setEditingId(list.id);
                    setEditName(list.name);
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Rename
                </button>
                {watchlists.length > 1 && (
                  <button
                    onClick={() => deleteWatchlist(list.id)}
                    className="text-sm text-red-500 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-stellar-border">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">Export Data</h3>
          <p className="text-sm text-gray-400 mb-4">
            Download your watchlists as a JSON file to serve as a backup or to move to another device.
          </p>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-stellar-border text-white rounded font-medium hover:bg-gray-700 transition-colors focus:ring-2 focus:ring-stellar-blue focus:outline-none"
          >
            Export to JSON
          </button>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2">Import Data</h3>
          <form onSubmit={handleImport}>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='Paste JSON data here (e.g. [{"name": "My List", "assets": ["XLM"]}])...'
              className="w-full h-24 bg-stellar-dark border border-stellar-border rounded p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-stellar-blue mb-2 font-mono"
            />
            <button
              type="submit"
              disabled={!importText.trim()}
              className="px-4 py-2 bg-stellar-border text-white rounded font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Import JSON
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
