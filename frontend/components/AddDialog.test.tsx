// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddDialog from "@/components/AddDialog";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createText: vi.fn(),
  importFromYouTube: vi.fn(),
  importTextUrl: vi.fn(),
  fetchEntryText: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const entry = (extra: Partial<api.LibraryEntry> = {}) =>
  ({
    id: 1,
    type: "text",
    title: "T",
    caption_source: null,
    ...extra,
  }) as api.LibraryEntry;

function setup() {
  const onOpen = vi.fn();
  const onSaved = vi.fn();
  render(<AddDialog onOpen={onOpen} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  return { onOpen, onSaved };
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText("Text, link or file"), {
    target: { value },
  });

describe("AddDialog", () => {
  it("saves pasted text under the typed title and opens it", async () => {
    vi.mocked(api.createText).mockResolvedValue(entry());
    const { onOpen, onSaved } = setup();
    type("Es war einmal ein Haus.");
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Mein Titel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    expect(api.createText).toHaveBeenCalledWith(
      "Mein Titel",
      "Es war einmal ein Haus.",
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows the detected type as the active chip", () => {
    setup();
    type("https://youtu.be/abc123");
    expect(screen.getByText("YouTube video").getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("opens the existing entry for a duplicate video without a preview step", async () => {
    const existing = entry({ type: "video", duplicate: true });
    vi.mocked(api.importFromYouTube).mockResolvedValue(existing);
    const { onOpen } = setup();
    type("https://youtu.be/abc123");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(existing));
  });

  it("previews an imported video with its caption source before opening", async () => {
    const saved = entry({ type: "video", caption_source: "auto" });
    vi.mocked(api.importFromYouTube).mockResolvedValue(saved);
    vi.mocked(api.fetchEntryText).mockResolvedValue("Hallo schöne Welt");
    const { onOpen } = setup();
    type("https://youtu.be/abc123");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText("Auto captions");
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open and watch" }));
    expect(onOpen).toHaveBeenCalledWith(saved);
  });

  it("says the import is saved and offers Close instead of Cancel", async () => {
    vi.mocked(api.importFromYouTube).mockResolvedValue(
      entry({ type: "video" }),
    );
    vi.mocked(api.fetchEntryText).mockResolvedValue("Hallo");
    setup();
    type("https://youtu.be/abc123");
    expect(screen.getByText("Cancel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByText("Saved to your library");
    expect(screen.getByText("Close")).toBeTruthy();
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it.each([
    ["a duplicate", entry({ type: "video", duplicate: true })],
    ["a new video", entry({ type: "video" })],
  ])(
    "drops the result of %s that finishes after the dialog closed",
    async (_, saved) => {
      let finish: (e: api.LibraryEntry) => void = () => {};
      vi.mocked(api.importFromYouTube).mockReturnValue(
        new Promise((resolve) => (finish = resolve)),
      );
      vi.mocked(api.fetchEntryText).mockResolvedValue("Hallo");
      const { onOpen, onSaved } = setup();
      type("https://youtu.be/abc123");
      fireEvent.click(screen.getByRole("button", { name: "Import" }));
      fireEvent.click(screen.getByText("Cancel"));
      await act(async () => finish(saved));
      expect(onSaved).toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      const field = screen.getByLabelText("Text, link or file");
      expect((field as HTMLTextAreaElement).value).toBe("");
      expect((field as HTMLTextAreaElement).disabled).toBe(false);
      expect(screen.queryByText("Adding…")).toBeNull();
      expect(screen.queryByText("Saved to your library")).toBeNull();
    },
  );

  it("disables Import for a YouTube link that is not a single video", () => {
    setup();
    type("https://www.youtube.com/playlist?list=PL1");
    expect(screen.getByText("Paste a link to a single video")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Import" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows an import error and keeps the input", async () => {
    vi.mocked(api.importTextUrl).mockRejectedValue(new Error("Page too large"));
    setup();
    type("https://example.com/a");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Page too large",
    );
  });
});
