import React from "react";
import { useRelativeTime } from "../../hooks/useRelativeTime";
import { useAuth } from "../../context/AuthContext";
import { TrashIcon, PencilSquareIcon, CheckIcon } from "@heroicons/react/24/outline";

import { ConfirmationModal } from "../ops/ConfirmationModal";

import type { Annotation } from "../../hooks/useAnnotations";

interface Props {
  annotation: Annotation;
  onEdit: (id: string, newContent: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onJumpToSection?: (sectionId: string) => void;
}

export const AnnotationCard: React.FC<Props> = ({ annotation, onEdit, onDelete, onJumpToSection }) => {
  const { user, hasRole } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(annotation.content);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const canModify = Boolean(
    user && (user.id === annotation.author.id || hasRole("Admin") || hasRole("Lead Auditor") || hasRole("SuperAdmin"))
  );

  const { text: relative } = useRelativeTime(annotation.updated_at ?? annotation.created_at);

  React.useEffect(() => setValue(annotation.content), [annotation.content]);

  const initials = annotation.author.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="p-3 border rounded bg-white dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium">{initials}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{annotation.author.name} <span className="text-xs text-slate-400">• {annotation.author.role}</span></div>
              <div className="text-xs text-slate-400">{relative}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onJumpToSection && onJumpToSection(annotation.section_id)}
                className="text-xs text-stellar-blue underline"
              >
                View section
              </button>

              {canModify && !editing && (
                <button onClick={() => setEditing(true)} className="p-1 text-slate-500 hover:text-slate-700">
                  <PencilSquareIcon className="w-4 h-4" />
                </button>
              )}

              {canModify && (
                <button onClick={() => setConfirmOpen(true)} className="p-1 text-red-500 hover:text-red-700">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-2">
            {!editing ? (
              <div className="text-sm whitespace-pre-wrap">{annotation.content} {annotation.is_edited && <span className="text-xs text-slate-400">[EDITED]</span>}</div>
            ) : (
              <div className="flex gap-2">
                <textarea value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 p-2 border rounded bg-slate-50 dark:bg-slate-700" />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      await onEdit(annotation.id, value);
                      setEditing(false);
                    }}
                    className="p-2 bg-emerald-600 text-white rounded"
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setValue(annotation.content); setEditing(false); }} className="p-2 bg-slate-200 rounded">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal open={confirmOpen} title="Delete annotation" description="Type DELETE to confirm deletion." confirmationPhrase="DELETE" onCancel={() => setConfirmOpen(false)} onConfirm={() => { onDelete(annotation.id); setConfirmOpen(false); }} />
    </div>
  );
};
