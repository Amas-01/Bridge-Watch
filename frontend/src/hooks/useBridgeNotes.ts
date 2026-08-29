/**
 * useBridgeNotes – local-storage-backed hook for per-bridge operator notes.
 *
 * Notes are keyed by bridge name and stored as a JSON array so they survive
 * page refreshes without requiring a backend endpoint.
 */

import { useCallback, useEffect, useState } from "react";

export interface BridgeNote {
  id: string;
  bridgeName: string;
  content: string;
  author: string;
  createdAt: string;   // ISO-8601
  updatedAt: string;   // ISO-8601
}

const STORAGE_KEY = "bridgewatch:bridge-notes";

function readAll(): BridgeNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BridgeNote[];
  } catch {
    return [];
  }
}

function writeAll(notes: BridgeNote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function generateId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useBridgeNotes(bridgeName: string) {
  const [all, setAll] = useState<BridgeNote[]>(readAll);

  // Re-sync if another tab writes
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setAll(readAll());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const notes = all.filter((n) => n.bridgeName === bridgeName);

  const addNote = useCallback(
    (content: string, author: string) => {
      const now = new Date().toISOString();
      const note: BridgeNote = {
        id: generateId(),
        bridgeName,
        content: content.trim(),
        author,
        createdAt: now,
        updatedAt: now,
      };
      setAll((prev) => {
        const next = [...prev, note];
        writeAll(next);
        return next;
      });
    },
    [bridgeName]
  );

  const updateNote = useCallback((id: string, content: string) => {
    setAll((prev) => {
      const next = prev.map((n) =>
        n.id === id ? { ...n, content: content.trim(), updatedAt: new Date().toISOString() } : n
      );
      writeAll(next);
      return next;
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setAll((prev) => {
      const next = prev.filter((n) => n.id !== id);
      writeAll(next);
      return next;
    });
  }, []);

  return { notes, addNote, updateNote, deleteNote };
}
