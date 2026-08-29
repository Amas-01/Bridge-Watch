import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBridgeNotes, type BridgeNote } from "./useBridgeNotes";

const STORAGE_KEY = "bridgewatch:bridge-notes";

describe("useBridgeNotes", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("fetching notes", () => {
    it("should return empty array when no notes exist", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));
      expect(result.current.notes).toEqual([]);
    });

    it("should fetch notes for specific bridge", () => {
      const mockNotes: BridgeNote[] = [
        {
          id: "note_1",
          bridgeName: "Bridge-A",
          content: "Test note",
          author: "John",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockNotes));

      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));
      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0].content).toBe("Test note");
    });

    it("should filter notes by bridge name", () => {
      const mockNotes: BridgeNote[] = [
        {
          id: "note_1",
          bridgeName: "Bridge-A",
          content: "Note for A",
          author: "John",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "note_2",
          bridgeName: "Bridge-B",
          content: "Note for B",
          author: "Jane",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockNotes));

      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));
      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0].bridgeName).toBe("Bridge-A");
    });

    it("should handle corrupted localStorage data gracefully", () => {
      localStorage.setItem(STORAGE_KEY, "invalid json");
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));
      expect(result.current.notes).toEqual([]);
    });

    it("should sync notes across multiple hooks", () => {
      const { result: resultA } = renderHook(() => useBridgeNotes("Bridge-A"));
      const { result: resultB } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        resultA.current.addNote("New note", "Author");
      });

      expect(resultA.current.notes).toHaveLength(1);
      expect(resultB.current.notes).toHaveLength(1);
    });
  });

  describe("posting new notes", () => {
    it("should add a new note", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("Test content", "TestAuthor");
      });

      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0].content).toBe("Test content");
      expect(result.current.notes[0].author).toBe("TestAuthor");
      expect(result.current.notes[0].bridgeName).toBe("Bridge-A");
    });

    it("should generate unique note IDs", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("Note 1", "Author");
        result.current.addNote("Note 2", "Author");
      });

      expect(result.current.notes).toHaveLength(2);
      expect(result.current.notes[0].id).not.toBe(result.current.notes[1].id);
    });

    it("should trim whitespace from note content", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("  Content with spaces  ", "Author");
      });

      expect(result.current.notes[0].content).toBe("Content with spaces");
    });

    it("should skip empty notes", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("", "Author");
      });

      expect(result.current.notes).toHaveLength(0);
    });

    it("should set correct timestamps on new notes", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));
      const before = new Date();

      act(() => {
        result.current.addNote("Test", "Author");
      });

      const after = new Date();
      const note = result.current.notes[0];
      const created = new Date(note.createdAt);
      const updated = new Date(note.updatedAt);

      expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(created.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(updated).toEqual(created);
    });

    it("should persist notes to localStorage", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("Persist me", "Author");
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].content).toBe("Persist me");
    });
  });

  describe("note deletion state updates", () => {
    it("should delete a note by ID", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      act(() => {
        result.current.addNote("Note to delete", "Author");
        noteId = result.current.notes[0].id;
      });

      act(() => {
        result.current.deleteNote(noteId);
      });

      expect(result.current.notes).toHaveLength(0);
    });

    it("should not affect other notes when deleting one", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let idToDelete: string;
      act(() => {
        result.current.addNote("Note 1", "Author");
        result.current.addNote("Note 2", "Author");
        idToDelete = result.current.notes[0].id;
      });

      act(() => {
        result.current.deleteNote(idToDelete);
      });

      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0].content).toBe("Note 2");
    });

    it("should handle deleting non-existent note gracefully", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("Existing note", "Author");
      });

      act(() => {
        result.current.deleteNote("non-existent-id");
      });

      expect(result.current.notes).toHaveLength(1);
    });

    it("should persist deletion to localStorage", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      act(() => {
        result.current.addNote("Delete me", "Author");
        noteId = result.current.notes[0].id;
      });

      act(() => {
        result.current.deleteNote(noteId);
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      expect(stored).toHaveLength(0);
    });

    it("should delete multiple notes sequentially", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      const ids: string[] = [];
      act(() => {
        result.current.addNote("Note 1", "Author");
        result.current.addNote("Note 2", "Author");
        result.current.addNote("Note 3", "Author");
        ids.push(...result.current.notes.map((n) => n.id));
      });

      act(() => {
        result.current.deleteNote(ids[0]);
        result.current.deleteNote(ids[2]);
      });

      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0].content).toBe("Note 2");
    });
  });

  describe("note updates", () => {
    it("should update note content", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      act(() => {
        result.current.addNote("Original content", "Author");
        noteId = result.current.notes[0].id;
      });

      act(() => {
        result.current.updateNote(noteId, "Updated content");
      });

      expect(result.current.notes[0].content).toBe("Updated content");
    });

    it("should trim whitespace from updated content", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      act(() => {
        result.current.addNote("Original", "Author");
        noteId = result.current.notes[0].id;
      });

      act(() => {
        result.current.updateNote(noteId, "  Updated  ");
      });

      expect(result.current.notes[0].content).toBe("Updated");
    });

    it("should update the updatedAt timestamp", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      let originalUpdatedAt: string;
      act(() => {
        result.current.addNote("Note", "Author");
        noteId = result.current.notes[0].id;
        originalUpdatedAt = result.current.notes[0].updatedAt;
      });

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      act(() => {
        result.current.updateNote(noteId, "Updated");
      });

      const newUpdatedAt = result.current.notes[0].updatedAt;
      expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it("should preserve createdAt timestamp on update", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      let createdAt: string;
      act(() => {
        result.current.addNote("Note", "Author");
        noteId = result.current.notes[0].id;
        createdAt = result.current.notes[0].createdAt;
      });

      act(() => {
        result.current.updateNote(noteId, "Updated");
      });

      expect(result.current.notes[0].createdAt).toBe(createdAt);
    });

    it("should persist updates to localStorage", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      let noteId: string;
      act(() => {
        result.current.addNote("Original", "Author");
        noteId = result.current.notes[0].id;
      });

      act(() => {
        result.current.updateNote(noteId, "Updated content");
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      expect(stored[0].content).toBe("Updated content");
    });
  });

  describe("edge cases", () => {
    it("should handle notes with special characters", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("Content with @#$%^&*() symbols", "Author");
      });

      expect(result.current.notes[0].content).toBe(
        "Content with @#$%^&*() symbols"
      );
    });

    it("should handle very long note content", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));
      const longContent = "A".repeat(10000);

      act(() => {
        result.current.addNote(longContent, "Author");
      });

      expect(result.current.notes[0].content.length).toBe(10000);
    });

    it("should maintain data integrity across multiple operations", () => {
      const { result } = renderHook(() => useBridgeNotes("Bridge-A"));

      act(() => {
        result.current.addNote("Note 1", "Author1");
        result.current.addNote("Note 2", "Author2");
        result.current.addNote("Note 3", "Author3");
      });

      expect(result.current.notes).toHaveLength(3);

      const id2 = result.current.notes[1].id;

      act(() => {
        result.current.updateNote(result.current.notes[0].id, "Updated 1");
        result.current.deleteNote(id2);
        result.current.addNote("Note 4", "Author4");
      });

      expect(result.current.notes).toHaveLength(3);
      expect(result.current.notes.map((n) => n.content)).toEqual([
        "Updated 1",
        "Note 3",
        "Note 4",
      ]);
    });
  });
});
