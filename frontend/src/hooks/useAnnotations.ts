import React from "react";
import type { UserProfile } from "../context/AuthContext";

export interface Annotation {
  id: string;
  report_id: string;
  section_id: string;
  author: { name: string; role?: string; id?: string };
  content: string;
  created_at: string; // ISO
  updated_at?: string; // ISO
  is_edited?: boolean;
}

// Local mock API — replace with real API integration
function fakeApiDelay<T>(result: T, ms = 500) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(result), ms));
}

export function useAnnotations(reportId: string) {
  const [annotations, setAnnotations] = React.useState<Annotation[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    // Mock initial load
    setLoading(true);
    fakeApiDelay<Annotation[]>([
      {
        id: "anno-001",
        report_id: reportId,
        section_id: "fee-revenue-breakdown",
        author: { name: "Sarah Chen", role: "Lead Auditor", id: "u-1" },
        content:
          "The 12% spike here correlates directly with the transient volume anomaly on the Ethereum-Stellar corridor at ledger 49202.",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        is_edited: true,
      },
    ]).then((rows) => {
      setAnnotations(rows);
      setLoading(false);
    });
  }, [reportId]);

  async function createAnnotation(payload: Omit<Annotation, "id" | "created_at" | "updated_at" | "is_edited">, currentUser: UserProfile) {
    setLoading(true);
    const newAnno: Annotation = {
      ...payload,
      id: `anno-${Math.random().toString(36).slice(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: undefined,
      is_edited: false,
      author: { name: currentUser.name, role: currentUser.roles.join(", "), id: currentUser.id },
    };
    await fakeApiDelay(true, 400);
    setAnnotations((s) => [newAnno, ...s]);
    setLoading(false);
    return newAnno;
  }

  async function updateAnnotation(id: string, newContent: string) {
    setLoading(true);
    await fakeApiDelay(true, 300);
    setAnnotations((s) =>
      s.map((a) => (a.id === id ? { ...a, content: newContent, updated_at: new Date().toISOString(), is_edited: true } : a))
    );
    setLoading(false);
  }

  async function deleteAnnotation(id: string) {
    setLoading(true);
    await fakeApiDelay(true, 300);
    setAnnotations((s) => s.filter((a) => a.id !== id));
    setLoading(false);
  }

  return {
    annotations,
    loading,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    setAnnotations,
  } as const;
}
