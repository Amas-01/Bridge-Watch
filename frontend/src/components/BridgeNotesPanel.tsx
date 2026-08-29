/**
 * BridgeNotesPanel (#494)
 *
 * Lets operators attach rich notes to a bridge for internal coordination.
 * Features:
 *  – Create / edit / delete notes
 *  – Author + timestamp on each note
 *  – Simple markdown-style **bold** and _italic_ rendering (no deps)
 *  – Access control: only the note author can edit/delete their own note
 *    (author is read from a static constant; replace with auth context as needed)
 */

import { useRef, useState } from "react";
import { useBridgeNotes } from "../hooks/useBridgeNotes";
import type { BridgeNote } from "../hooks/useBridgeNotes";

// ─── constants ────────────────────────────────────────────────────────────────

/** Replace with real auth context / user session when available. */
const CURRENT_USER = "operator";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Minimal inline formatter: **bold** → <strong>, _italic_ → <em>.
 * Returns an array of React-compatible chunks (no dangerouslySetInnerHTML).
 */
function formatContent(text: string): React.ReactNode[] {
  // Split on **…** and _…_
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function NoteCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: BridgeNote;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isOwner = note.author === CURRENT_USER;

  function handleEdit() {
    setDraft(note.content);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleSave() {
    if (draft.trim()) {
      onUpdate(note.id, draft);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setDraft(note.content);
    }
  }

  return (
    <article
      className="group rounded-lg border border-stellar-border bg-stellar-dark/30 p-4 transition-colors hover:border-stellar-blue/40"
      aria-label={`Note by ${note.author}`}
    >
      {/* header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stellar-blue/20 text-xs font-semibold text-stellar-blue uppercase">
            {note.author[0]}
          </span>
          <span className="text-sm font-medium text-white truncate">{note.author}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <time
            dateTime={note.updatedAt}
            className="text-xs text-stellar-text-secondary"
            title={note.updatedAt !== note.createdAt ? `Edited ${formatTimestamp(note.updatedAt)}` : undefined}
          >
            {formatTimestamp(note.createdAt)}
            {note.updatedAt !== note.createdAt && (
              <span className="ml-1 text-stellar-text-secondary/60">(edited)</span>
            )}
          </time>

          {isOwner && !editing && (
            <>
              <button
                type="button"
                onClick={handleEdit}
                aria-label="Edit note"
                className="ml-1 rounded p-1 text-stellar-text-secondary opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.609zm1.414 1.06a.25.25 0 00-.354 0L3.64 10.92l-.534 1.866 1.866-.534 8.433-8.433a.25.25 0 000-.354l-1.378-1.379z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onDelete(note.id)}
                aria-label="Delete note"
                className="rounded p-1 text-stellar-text-secondary opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75v1.25h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM4.997 6.5a.75.75 0 00-1.5.056l.327 8.75a.75.75 0 001.498-.056L4.997 6.5zm5.006 0a.75.75 0 011.498.056l-.328 8.75a.75.75 0 01-1.498-.056L10.003 6.5z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* body */}
      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-full rounded border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue resize-none"
            placeholder="Write your note… (**bold**, _italic_)"
            aria-label="Edit note content"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-stellar-text-secondary">
              Tip: <kbd className="rounded border border-stellar-border px-1">Ctrl+Enter</kbd> to save
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft(note.content); }}
                className="rounded border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!draft.trim()}
                className="rounded bg-stellar-blue px-3 py-1 text-xs font-medium text-white hover:bg-stellar-blue/80 disabled:opacity-40 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stellar-text-primary leading-relaxed whitespace-pre-wrap">
          {formatContent(note.content)}
        </p>
      )}
    </article>
  );
}

function ComposeForm({
  onAdd,
}: {
  onAdd: (content: string) => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onAdd(value);
    setValue("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (value.trim()) {
        onAdd(value);
        setValue("");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="bridge-note-input" className="sr-only">
        New note
      </label>
      <textarea
        id="bridge-note-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        placeholder="Add an operator note… (**bold**, _italic_)"
        className="w-full rounded-lg border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue resize-none"
        aria-label="New bridge note"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stellar-text-secondary">
          Posting as <span className="font-medium text-white">{CURRENT_USER}</span>
        </p>
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stellar-blue px-4 py-1.5 text-sm font-medium text-white hover:bg-stellar-blue/80 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" />
          </svg>
          Add note
        </button>
      </div>
    </form>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

interface BridgeNotesPanelProps {
  bridgeName: string;
}

export default function BridgeNotesPanel({ bridgeName }: BridgeNotesPanelProps) {
  const { notes, addNote, updateNote, deleteNote } = useBridgeNotes(bridgeName);

  return (
    <section
      aria-labelledby="bridge-notes-heading"
      className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2
            id="bridge-notes-heading"
            className="text-lg font-semibold text-white"
          >
            Operator Notes
          </h2>
          <p className="mt-0.5 text-sm text-stellar-text-secondary">
            Internal coordination notes for <span className="font-medium text-white">{bridgeName}</span>
          </p>
        </div>
        {notes.length > 0 && (
          <span className="rounded-full bg-stellar-blue/15 px-2.5 py-0.5 text-xs font-semibold text-stellar-blue">
            {notes.length}
          </span>
        )}
      </div>

      {/* compose */}
      <ComposeForm onAdd={(content) => addNote(content, CURRENT_USER)} />

      {/* notes list */}
      {notes.length > 0 ? (
        <div className="space-y-3" role="list" aria-label="Bridge notes">
          {[...notes].reverse().map((note) => (
            <div key={note.id} role="listitem">
              <NoteCard
                note={note}
                onUpdate={updateNote}
                onDelete={deleteNote}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-stellar-border py-8 text-center">
          <svg
            className="mx-auto mb-2 text-stellar-text-secondary"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
          <p className="text-sm text-stellar-text-secondary">No notes yet</p>
          <p className="mt-1 text-xs text-stellar-text-secondary/60">
            Add the first note above to share context with your team.
          </p>
        </div>
      )}
    </section>
  );
}
