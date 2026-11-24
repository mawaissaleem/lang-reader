// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  fetchLibrary: vi.fn(),
  fetchLibraryProgress: vi.fn(async () => ({})),
  fetchEntryText: vi.fn(async () => "text"),
  fetchSubtitleCues: vi.fn(),
  renameEntry: vi.fn(),
  deleteEntry: vi.fn(),
  fetchUserWords: vi.fn(async () => []),
  fetchTranslatorPriority: vi.fn(async () => []),
  fetchAnkiConnected: vi.fn(async () => true),
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/VideoReader", () => ({
  default: ({ url }: { url: string }) => <div data-testid="video">{url}</div>,
}));
vi.mock("@/components/TextDisplay", () => ({
  default: () => <div data-testid="plain" />,
}));
vi.mock("@/components/SidePanel", () => ({ default: () => null }));
vi.mock("@/components/AddTextDialog", () => ({ default: () => null }));
vi.mock("@/components/ImportYouTubeDialog", () => ({ default: () => null }));

import { fetchEntryText, fetchLibrary, fetchSubtitleCues } from "@/lib/api";
import useStore from "@/store/useStore";
import LibraryPage from "./page";

const entries = [
  {
    type: "video",
    id: 1,
    title: "Clip",
    word_count: 5,
    language: "de",
    created_at: "2026-01-01",
    source: "youtube",
  },
  {
    type: "text",
    id: 2,
    title: "Essay",
    word_count: 5,
    language: "de",
    created_at: "2026-01-01",
    source: "manual",
  },
] as never;

afterEach(cleanup);

describe("LibraryPage", () => {
  it("ignores a cues response that arrives after Back", async () => {
    vi.mocked(fetchLibrary).mockResolvedValue(entries);
    let late!: (v: { url: string; cues: never[] }) => void;
    vi.mocked(fetchSubtitleCues).mockReturnValue(
      new Promise((r) => (late = r as typeof late)),
    );
    render(<LibraryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Clip" }));
    fireEvent.click(await screen.findByText(/Library/));
    fireEvent.click(await screen.findByRole("button", { name: "Open Essay" }));
    await screen.findByTestId("plain");
    late({
      url: "https://youtu.be/x",
      cues: [{ start: 0, end: 1, text: "hi" }] as never,
    });
    await new Promise((r) => setTimeout(r, 20));
    await waitFor(() => expect(screen.queryByTestId("video")).toBeNull());
  });

  it("ignores a text response that arrives after Back", async () => {
    vi.mocked(fetchLibrary).mockResolvedValue(entries);
    vi.mocked(fetchSubtitleCues).mockReturnValue(new Promise(() => {}));
    let late!: (t: string) => void;
    vi.mocked(fetchEntryText)
      .mockReturnValueOnce(new Promise((r) => (late = r)))
      .mockResolvedValueOnce("essay text");
    render(<LibraryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Clip" }));
    fireEvent.click(await screen.findByText(/Library/));
    fireEvent.click(await screen.findByRole("button", { name: "Open Essay" }));
    await waitFor(() => expect(useStore.getState().text).toBe("essay text"));
    late("clip text");
    await new Promise((r) => setTimeout(r, 20));
    expect(useStore.getState().text).toBe("essay text");
  });

  it("drops a shown video on Back", async () => {
    vi.mocked(fetchLibrary).mockResolvedValue(entries);
    vi.mocked(fetchSubtitleCues).mockResolvedValue({
      url: "https://youtu.be/x",
      cues: [{ start: 0, end: 1, text: "hi" }],
    } as never);
    render(<LibraryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Clip" }));
    await screen.findByTestId("video");
    fireEvent.click(await screen.findByText(/Library/));
    fireEvent.click(await screen.findByRole("button", { name: "Open Essay" }));
    await screen.findByTestId("plain");
    expect(screen.queryByTestId("video")).toBeNull();
  });
});
