import React from "react";
import { useAnnotations, type Annotation } from "../../hooks/useAnnotations";
import { AnnotationCard } from "./AnnotationCard";
import { useAuth } from "../../context/AuthContext";

interface Props {
  reportId: string;
  onJumpToSection?: (sectionId: string) => void;
}

export const ReportAnnotationsPanel: React.FC<Props> = ({ reportId, onJumpToSection }) => {
  const { annotations, loading, createAnnotation, updateAnnotation, deleteAnnotation } = useAnnotations(reportId);
  const { user } = useAuth();

  const [newSection, setNewSection] = React.useState("");
  const [newContent, setNewContent] = React.useState("");
  const [localBusy, setLocalBusy] = React.useState(false);

  const grouped = React.useMemo(() => {
    // Group by section_id preserving insertion order by newest first
    const m = new Map<string, Annotation[]>();
    for (const a of annotations) {
      const arr = m.get(a.section_id) ?? [];
      arr.push(a);
      m.set(a.section_id, arr);
    }
    return m;
  }, [annotations]);

  const handleCreate = async () => {
    if (!user) return;
    if (!newSection || !newContent.trim()) return;
    setLocalBusy(true);
    await createAnnotation({ report_id: reportId, section_id: newSection, content: newContent, author: { name: user.name } }, user);
    setNewContent("");
    setNewSection("");
    setLocalBusy(false);
  };

  return (
    <aside className="w-full md:w-96 bg-slate-50 dark:bg-slate-900 border-l">
      <div className="p-4">
        <h3 className="text-lg font-semibold">Annotations</h3>
        <p className="text-sm text-slate-500">Attach contextual notes to report sections for collaboration.</p>

        <div className="mt-4">
          <label className="text-xs text-slate-600">Section ID</label>
          <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="e.g. fee-revenue-breakdown" className="w-full mt-1 p-2 border rounded bg-white dark:bg-slate-800" />
          <label className="text-xs text-slate-600 mt-2 block">Note</label>
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Write a short note..." className="w-full mt-1 p-2 border rounded bg-white dark:bg-slate-800" />
          <div className="mt-2 flex justify-end">
            <button disabled={localBusy || !user} onClick={handleCreate} className="px-3 py-1 rounded bg-stellar-blue text-white disabled:opacity-50">Add Note</button>
          </div>
        </div>

        <div className="mt-6">
          {loading && <div className="text-sm text-slate-500">Loading annotations…</div>}

          {!loading && annotations.length === 0 && <div className="text-sm text-slate-500">No annotations yet for this report.</div>}

          <div className="space-y-3 mt-3">
            {Array.from(grouped.entries()).map(([sectionId, items]) => (
              <div key={sectionId}>
                <div className="flex items-center justify-between px-2 py-1 bg-white dark:bg-slate-800 rounded">
                  <div className="text-sm font-medium">{sectionId}</div>
                  <div className="text-xs text-slate-400">{items.length} note{items.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="mt-2 space-y-2">
                  {items.map((a) => (
                    <AnnotationCard key={a.id} annotation={a} onEdit={updateAnnotation} onDelete={deleteAnnotation} onJumpToSection={onJumpToSection} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default ReportAnnotationsPanel;
