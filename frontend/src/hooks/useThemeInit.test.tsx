import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useThemeInit, useThemeClasses } from "./useThemeInit";
import { useThemeStore } from "../stores";

function createMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useThemeInit", () => {
  beforeEach(() => {
    useThemeStore.setState(useThemeStore.getInitialState(), true);
    window.matchMedia = createMatchMedia(false) as unknown as typeof window.matchMedia;
  });

  it("should return the current theme on mount", () => {
    const { result } = renderHook(() => useThemeInit());

    expect(result.current).toBeDefined();
    expect(result.current.isDark).toBeDefined();
    expect(typeof result.current.toggle).toBe("function");
    expect(typeof result.current.setMode).toBe("function");
  });

  it("should apply theme on mount", () => {
    const spy = vi.spyOn(useThemeStore.getState(), "applyTheme");

    renderHook(() => useThemeInit());

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should call setMode to change the theme", async () => {
    const { result } = renderHook(() => useThemeInit());

    expect(result.current.isDark).toBe(true);

    act(() => {
      result.current.setMode("light");
    });

    expect(useThemeStore.getState().resolvedMode).toBe("light");
  });

  it("should set up a system theme listener when mode is system", () => {
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { unmount } = renderHook(() => useThemeInit());

    expect(addEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("should not set up system listener when mode is light", () => {
    const addEventListenerSpy = vi.fn();

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    useThemeStore.setState({ mode: "light" });

    renderHook(() => useThemeInit());

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it("should update resolvedMode when system prefers dark", () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | undefined;

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, handler: (e: MediaQueryListEvent) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    useThemeStore.setState({ mode: "system", resolvedMode: "light" });

    renderHook(() => useThemeInit());

    act(() => {
      changeHandler!({ matches: true } as MediaQueryListEvent);
    });

    expect(useThemeStore.getState().resolvedMode).toBe("dark");
  });

  it("should update resolvedMode when system prefers light", () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | undefined;

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, handler: (e: MediaQueryListEvent) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    useThemeStore.setState({ mode: "system", resolvedMode: "dark" });

    renderHook(() => useThemeInit());

    act(() => {
      changeHandler!({ matches: false } as MediaQueryListEvent);
    });

    expect(useThemeStore.getState().resolvedMode).toBe("light");
  });
});

describe("useThemeClasses", () => {
  beforeEach(() => {
    useThemeStore.setState(useThemeStore.getInitialState(), true);
  });

  it("should return theme class based on resolvedMode", () => {
    useThemeStore.setState({ resolvedMode: "dark" });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.themeClass).toBe("theme-dark");
  });

  it("should return light theme class", () => {
    useThemeStore.setState({ resolvedMode: "light" });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.themeClass).toBe("theme-light");
  });

  it("should return font size class", () => {
    useThemeStore.setState({
      font: { family: "Inter", size: "lg", lineHeight: "normal" },
    });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.fontSizeClass).toBe("text-lg");
  });

  it("should return density class", () => {
    useThemeStore.setState({ density: "compact" });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.densityClass).toBe("density-compact");
  });

  it("should return reduce-motion when animations disabled", () => {
    useThemeStore.setState({ animationsEnabled: false, reducedMotion: false });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.animationClass).toBe("reduce-motion");
  });

  it("should return reduce-motion when reducedMotion is true", () => {
    useThemeStore.setState({ animationsEnabled: true, reducedMotion: true });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.animationClass).toBe("reduce-motion");
  });

  it("should return empty animation class when animations enabled and no reduced motion", () => {
    useThemeStore.setState({ animationsEnabled: true, reducedMotion: false });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.animationClass).toBe("");
  });

  it("should return line height class", () => {
    useThemeStore.setState({
      font: { family: "Inter", size: "md", lineHeight: "relaxed" },
    });
    const { result } = renderHook(() => useThemeClasses());

    expect(result.current.lineHeightClass).toBe("leading-relaxed");
  });
});
