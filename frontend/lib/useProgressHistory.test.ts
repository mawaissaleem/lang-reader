// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ fetchProgressHistory: vi.fn() }));

import { fetchProgressHistory } from "@/lib/api";
import { useProgressHistory } from "@/lib/useProgressHistory";

const counts = (today: number) =>
  ({ today, goal: 25, streak: { current: 1, longest: 1 } }) as never;

describe("useProgressHistory", () => {
  it("refetches when returning from the reader so a save moves the count", async () => {
    vi.mocked(fetchProgressHistory)
      .mockResolvedValueOnce(counts(3))
      .mockResolvedValueOnce(counts(4));
    const { result, rerender } = renderHook(
      ({ paused }) => useProgressHistory(paused),
      { initialProps: { paused: false } },
    );
    await waitFor(() => expect(result.current.history?.today).toBe(3));
    rerender({ paused: true });
    rerender({ paused: false });
    await waitFor(() => expect(result.current.history?.today).toBe(4));
  });

  it("refresh refetches on demand, e.g. after marking an entry known", async () => {
    vi.mocked(fetchProgressHistory)
      .mockResolvedValueOnce(counts(3))
      .mockResolvedValueOnce(counts(9));
    const { result } = renderHook(() => useProgressHistory(false));
    await waitFor(() => expect(result.current.history?.today).toBe(3));
    await act(() => result.current.refresh());
    expect(result.current.history?.today).toBe(9);
  });
});
