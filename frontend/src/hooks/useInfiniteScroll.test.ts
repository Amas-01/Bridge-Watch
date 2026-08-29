import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useInfiniteScroll } from "./useInfiniteScroll";

describe("useInfiniteScroll", () => {
  it("should initialize with empty data", () => {
    const fetchData = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchData, enabled: false }),
    );

    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it("should load initial data when enabled", async () => {
    const mockData = [{ id: 1 }, { id: 2 }];
    const fetchData = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchData, pageSize: 20 }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchData).toHaveBeenCalledWith(0, 20);
  });

  it("should handle errors gracefully", async () => {
    const error = new Error("Failed to fetch");
    const fetchData = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchData, onError }),
    );

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(onError).toHaveBeenCalledWith(error);
  });

  it("should reset data when reset is called", async () => {
    const mockData = [{ id: 1 }];
    const fetchData = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useInfiniteScroll({ fetchData }));

    await waitFor(() => {
      expect(result.current.data.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(fetchData).toHaveBeenCalledTimes(2);
    });
  });
});
