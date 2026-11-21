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

function setup() {
  const onOpen = vi.fn();
  const onRename = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <EntryCard entry={entry} onOpen={onOpen} onRename={onRename} />,
  );
  return { onOpen, container };
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
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Ein Text" })).toBeNull();
  });
});
