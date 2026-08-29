import { describe, it, expect, vi } from "vitest";
import { SHORTCUTS } from "./useKeyboardShortcuts";

// ---------------------------------------------------------------------------
// SHORTCUTS registry tests (pure data — no DOM/React needed)
// ---------------------------------------------------------------------------

describe("SHORTCUTS registry", () => {
  it("has at least one shortcut in every category", () => {
    const cats = new Set(SHORTCUTS.map((s) => s.category));
    expect(cats.has("Navigation")).toBe(true);
    expect(cats.has("Actions")).toBe(true);
    expect(cats.has("UI")).toBe(true);
  });

  it("defines Escape in Actions", () => {
    const esc = SHORTCUTS.find((s) => s.key === "Escape");
    expect(esc).toBeDefined();
    expect(esc?.category).toBe("Actions");
  });

  it("defines Ctrl/Cmd+K search shortcut", () => {
    const search = SHORTCUTS.find((s) => s.key === "k" && s.mod === true);
    expect(search).toBeDefined();
    expect(search?.category).toBe("Actions");
  });

  it("defines theme toggle shortcut", () => {
    const theme = SHORTCUTS.find((s) => s.key === "t" && !s.mod);
    expect(theme).toBeDefined();
    expect(theme?.category).toBe("UI");
  });

  it("defines help shortcut with shift modifier", () => {
    const help = SHORTCUTS.find((s) => s.key === "?" && s.shift);
    expect(help).toBeDefined();
  });

  it("all navigation shortcuts ignore inputs", () => {
    const navShortcuts = SHORTCUTS.filter((s) => s.category === "Navigation");
    navShortcuts.forEach((s) => {
      expect(s.ignoreInInputs).toBe(true);
    });
  });

  it("has no duplicate key+mod+shift combinations", () => {
    const seen = new Set<string>();
    for (const s of SHORTCUTS) {
      const id = `${s.key}|${!!s.mod}|${!!s.shift}|${!!s.alt}`;
      expect(seen.has(id), `Duplicate shortcut: ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it("covers all 7 navigation routes", () => {
    const navKeys = SHORTCUTS.filter((s) => s.category === "Navigation").map(
      (s) => s.key
    );
    // "g d", "g b", "g a", "g t", "g w", "g s", "g h"
    expect(navKeys).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Custom event integration tests (DOM-level, no React)
// ---------------------------------------------------------------------------

describe("bridgewatch:open-search custom event", () => {
  it("dispatches and is received by event listener", () => {
    const listener = vi.fn();
    window.addEventListener("bridgewatch:open-search", listener);
    window.dispatchEvent(new CustomEvent("bridgewatch:open-search"));
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("bridgewatch:open-search", listener);
  });
});

describe("bridgewatch:open-shortcuts custom event", () => {
  it("dispatches and is received by event listener", () => {
    const listener = vi.fn();
    window.addEventListener("bridgewatch:open-shortcuts", listener);
    window.dispatchEvent(new CustomEvent("bridgewatch:open-shortcuts"));
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("bridgewatch:open-shortcuts", listener);
  });
});
