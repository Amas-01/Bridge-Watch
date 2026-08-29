import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  releaseNotes,
  TAG_COLORS,
  TAG_LABELS,
  type ReleaseTag,
} from "../content/releaseNotesData";

const ALL_TAGS: ReleaseTag[] = ["breaking", "new", "improvement", "fix", "deprecated"];

function TagBadge({ tag }: { tag: ReleaseTag }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TAG_COLORS[tag]}`}>
      {TAG_LABELS[tag]}
    </span>
  );
}

export default function ReleaseNotes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [activeTag, setActiveTag] = useState<ReleaseTag | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return releaseNotes.filter((release) => {
      const tagMatch =
        activeTag === "all" ||
        release.tags.includes(activeTag) ||
        release.entries.some((e) => e.tag === activeTag);

      if (!tagMatch) return false;
      if (!q) return true;

      return (
        release.version.includes(q) ||
        release.summary.toLowerCase().includes(q) ||
        release.entries.some(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q) ||
            (e.migrationNote?.toLowerCase().includes(q) ?? false),
        )
      );
    });
  }, [query, activeTag]);

  function handleQueryChange(value: string) {
    setQuery(value);
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("q", value);
    } else {
      next.delete("q");
    }
    setSearchParams(next, { replace: true });
  }

  function copyLink(version: string) {
    const url = new URL(window.location.href);
    url.hash = `v${version}`;
    navigator.clipboard.writeText(url.toString());
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-2">Release Notes</h1>
        <p className="text-stellar-text-secondary">
          Track product changes, API updates, and migration guidance.
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stellar-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search release notes…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="w-full rounded-lg border border-stellar-border bg-stellar-dark pl-10 pr-4 py-2 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeTag === "all"
                ? "bg-stellar-blue text-white"
                : "border border-stellar-border text-stellar-text-secondary hover:text-white"
            }`}
          >
            All
          </button>
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? "all" : tag)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTag === tag
                  ? TAG_COLORS[tag]
                  : "border border-stellar-border text-stellar-text-secondary hover:text-white"
              }`}
            >
              {TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-stellar-border bg-stellar-card p-8 text-center text-stellar-text-secondary">
          No release notes match your search.
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-stellar-border" aria-hidden="true" />
        <div className="space-y-8">
          {filtered.map((release) => (
            <div key={release.id} id={`v${release.version}`} className="relative pl-12">
              {/* Timeline dot */}
              <div
                className={`absolute left-2 top-5 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-stellar-dark flex items-center justify-center ${
                  release.tags.includes("breaking") ? "bg-red-500" : "bg-stellar-blue"
                }`}
                aria-hidden="true"
              >
                {release.tags.includes("breaking") && (
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <div className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xl font-bold text-stellar-text-primary">
                        v{release.version}
                      </h2>
                      {release.tags.map((tag) => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                    <p className="text-xs text-stellar-text-secondary mt-1">{release.date}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(release.version)}
                    title="Copy shareable link"
                    className="rounded-md p-1.5 text-stellar-text-secondary hover:text-white hover:bg-stellar-dark transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </button>
                </div>

                <p className="text-sm text-stellar-text-secondary">{release.summary}</p>

                {/* Entries */}
                <div className="space-y-4 pt-2 border-t border-stellar-border">
                  {release.entries
                    .filter((e) => activeTag === "all" || e.tag === activeTag)
                    .map((entry, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <TagBadge tag={entry.tag} />
                          <span className="text-sm font-medium text-stellar-text-primary">
                            {entry.title}
                          </span>
                        </div>
                        <p className="text-sm text-stellar-text-secondary pl-1">{entry.description}</p>
                        {entry.migrationNote && (
                          <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                            <p className="text-xs font-semibold text-red-400 mb-1">Migration note</p>
                            <p className="text-xs text-stellar-text-secondary">{entry.migrationNote}</p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
