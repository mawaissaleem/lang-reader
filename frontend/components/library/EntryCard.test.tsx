// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntryCard from "@/components/library/EntryCard";
import type { LibraryEntry } from "@/lib/api";

const entry = {
  id: 1,
  type: "text",
  title: "Ein Text",
  source: "manual",
  language: "de",
  word_count: 120,
  created_at: "2025-01-01T00:00:00Z",
} as unknown as LibraryEntry;

afterEach(cleanup);

function setup(overrides: Partial<LibraryEntry> = {}) {
  const onOpen = vi.fn();
  const onRename = vi.fn().mockResolvedValue(undefined);
  const onMarkKnown = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <EntryCard
      entry={{ ...entry, ...overrides }}
      onOpen={onOpen}
      onRename={onRename}
      onMarkKnown={onMarkKnown}
      onDelete={onDelete}
    />,
  );
  return { onOpen, onMarkKnown, onDelete, container };
}

describe("EntryCard", () => {
  it("has no interactive element nested inside another", () => {
    const { container } = setup();
    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelector("button input, button a")).toBeNull();
  });

  it("opens through a native button (so Enter and Space work)", () => {
    const { onOpen } = setup();
    const open = screen.getByRole("button", { name: "Open Ein Text" });
    expect(open.tagName).toBe("BUTTON");
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("Rename starts editing without opening the entry", () => {
    const { onOpen } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Entry actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Ein Text" })).toBeNull();
  });

  it("shows difficulty and the relative tag", () => {
    const progress = { known: 6, learning: 0, new: 4, total: 10 };
    const { container } = render(
      <EntryCard
        entry={entry}
        progress={progress}
        tag="Easiest"
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onMarkKnown={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("40 new per 100 words");
    expect(screen.getByText("Easiest")).toBeTruthy();
  });

  it("shows the first lines of a text", () => {
    setup({ preview: "Um sieben Uhr ist der Bahnhof voll." });
    expect(screen.getByText(/Um sieben Uhr/)).toBeTruthy();
  });

  it("shows a thumbnail built from the video id", () => {
    const { container } = setup({
      type: "video",
      source: "youtube",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "/vi/abcdefghijk/",
    );
  });

  it("deletes only after the confirmation", async () => {
    const { onDelete } = setup();
    const confirm = vi.spyOn(window, "confirm");
    const choose = () => {
      fireEvent.click(screen.getByRole("button", { name: "Entry actions" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    };
    confirm.mockReturnValueOnce(false);
    choose();
    expect(onDelete).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    choose();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("tells the user when an action fails", async () => {
    const { onDelete } = setup();
    onDelete.mockRejectedValueOnce(new Error("Server down"));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Entry actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    await vi.waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        expect.stringContaining("Server down"),
      ),
    );
  });

  it.each([
    ["creator", "Creator captions"],
    ["auto", "Auto captions"],
  ] as const)("labels %s captions", (caption_source, label) => {
    setup({ caption_source });
    expect(screen.getByText(new RegExp(label))).toBeTruthy();
  });

  it("shows no caption label when the source is unknown", () => {
    setup({ caption_source: null });
    expect(screen.queryByText(/captions/i)).toBeNull();
  });
});
