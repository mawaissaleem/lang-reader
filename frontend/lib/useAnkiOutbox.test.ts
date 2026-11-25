// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchAnkiConnected: vi.fn(async () => true),
  fetchAnkiPending: vi.fn(async () => 3),
  syncAnki: vi.fn(),
  pullAnki: vi.fn(),
}));

import { pullAnki, syncAnki } from "@/lib/api";
import { useAnkiOutbox } from "@/lib/useAnkiOutbox";
import useStore from "@/store/useStore";

const loadUserWords = vi.fn();

beforeEach(() => {
  vi.mocked(syncAnki).mockReset();
  vi.mocked(pullAnki).mockReset();
  loadUserWords.mockReset();
  useStore.setState({ sidePanelOpen: true, loadUserWords } as never);
});

describe("useAnkiOutbox", () => {
  it("sync updates the pending count and shows the result", async () => {
    vi.mocked(syncAnki).mockResolvedValue({
      sent: 2,
      failed: 1,
      pending: 1,
    } as never);
    const { result } = renderHook(() => useAnkiOutbox());
    await waitFor(() => expect(result.current.pending).toBe(3));

    await act(() => result.current.sync());

    expect(result.current.pending).toBe(1);
    expect(result.current.message).toBe("Sent 2, 1 rejected by Anki");
    expect(result.current.syncing).toBe(false);
  });

  it("pull keeps its message when the words reload fails", async () => {
    vi.mocked(pullAnki).mockResolvedValue({ changed: 2, checked: 5 } as never);
    loadUserWords.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAnkiOutbox());

    await act(() => result.current.pull());

    expect(loadUserWords).toHaveBeenCalledWith();
    expect(result.current.message).toBe("2 of 5 words updated from Anki");
  });

  it("a failed sync shows the error text", async () => {
    vi.mocked(syncAnki).mockRejectedValue(new Error("Anki is closed"));
    const { result } = renderHook(() => useAnkiOutbox());

    await act(() => result.current.sync());

    expect(result.current.message).toBe("Anki is closed");
  });
});
