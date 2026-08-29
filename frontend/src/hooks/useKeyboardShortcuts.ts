import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../theme/useTheme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShortcutScope = "global" | "modal" | "search";

export interface ShortcutDefinition {
  key: string;
  /** Use "mod" for Ctrl (Windows/Linux) or Cmd (Mac) */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category: "Navigation" | "Actions" | "UI";
  scope?: ShortcutScope;
  /** Prevent firing when an input/textarea is focused */
  ignoreInInputs?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  onOpenHelp?: () => void;
  onOpenSearch?: () => void;
}

// ---------------------------------------------------------------------------
// Shortcut registry (source of truth shared with ShortcutHelp)
// ---------------------------------------------------------------------------

export const SHORTCUTS: ShortcutDefinition[] = [
  // Navigation
  { key: "g d", description: "Go to Dashboard", category: "Navigation", ignoreInInputs: true },
  { key: "g b", description: "Go to Bridges", category: "Navigation", ignoreInInputs: true },
  { key: "g a", description: "Go to Analytics", category: "Navigation", ignoreInInputs: true },
  { key: "g t", description: "Go to Transactions", category: "Navigation", ignoreInInputs: true },
  { key: "g w", description: "Go to Watchlist", category: "Navigation", ignoreInInputs: true },
  { key: "g s", description: "Go to Settings", category: "Navigation", ignoreInInputs: true },
  { key: "g h", description: "Go to Help", category: "Navigation", ignoreInInputs: true },
  // Actions
  { key: "k", mod: true, description: "Open search", category: "Actions" },
  { key: "/", description: "Focus search", category: "Actions", ignoreInInputs: true },
  { key: "Escape", description: "Close modal / dismiss", category: "Actions" },
  // UI
  { key: "t", description: "Toggle theme (dark / light)", category: "UI", ignoreInInputs: true },
  { key: "?", shift: true, description: "Show keyboard shortcuts", category: "UI", ignoreInInputs: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}

function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKeyboardShortcuts({
  enabled = true,
  onOpenHelp,
  onOpenSearch,
}: UseKeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const { toggle: toggleTheme } = useTheme();

  // Sequence state for two-key combos like "g d"
  const pendingSequenceRef = useRef<string | null>(null);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSequence = useCallback(() => {
    if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    pendingSequenceRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Never intercept modifier-only keypresses
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;

      // --------------- Mod+K: open search ---------------
      if (e.key === "k" && (isMac() ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        onOpenSearch?.();
        clearSequence();
        return;
      }

      // --------------- Escape: close / dismiss ---------------
      if (e.key === "Escape") {
        clearSequence();
        return; // Let the active modal/overlay handle Escape via its own listener
      }

      // --------------- Ignore when typing in inputs ---------------
      if (isInputFocused()) {
        // "/" is special: focus search even from inputs is handled by GlobalSearch
        return;
      }

      // --------------- "/" : focus search ---------------
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenSearch?.();
        clearSequence();
        return;
      }

      // --------------- "?" : show help ---------------
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        onOpenHelp?.();
        clearSequence();
        return;
      }

      // --------------- "t" : toggle theme ---------------
      if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleTheme();
        clearSequence();
        return;
      }

      // --------------- Two-key "g X" sequences ---------------
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pendingSequenceRef.current = "g";
        // Auto-clear after 1.5s so stray "g" presses don't block future input
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = setTimeout(clearSequence, 1500);
        return;
      }

      if (pendingSequenceRef.current === "g") {
        clearSequence();
        e.preventDefault();
        switch (e.key) {
          case "d": navigate("/dashboard"); break;
          case "b": navigate("/bridges"); break;
          case "a": navigate("/analytics"); break;
          case "t": navigate("/transactions"); break;
          case "w": navigate("/watchlist"); break;
          case "s": navigate("/settings"); break;
          case "h": navigate("/help"); break;
        }
      }
    },
    [enabled, navigate, toggleTheme, onOpenHelp, onOpenSearch, clearSequence]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    };
  }, [handleKeyDown]);

  return { shortcuts: SHORTCUTS };
}
