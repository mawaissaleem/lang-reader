// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageBar from "@/components/library/PageBar";
import * as api from "@/lib/api";
import useStore from "@/store/useStore";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  markNewWordsKnown: vi.fn(),
  undoMarkNewWordsKnown: vi.fn(),
}));

const loadUserWords = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  useStore.setState({ loadUserWords });
  vi.mocked(api.markNewWordsKnown).mockResolvedValue({
    changed: 2,
    word_ids: [5, 6],
    event_ids: [7, 8],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const bar = (onPage = vi.fn()) =>
  render(
    <PageBar
      page={1}
      pageCount={5}
      onPage={onPage}
      newWords={["Haus", "Baum"]}
    />,
  );

describe("PageBar", () => {
  it("shows the page info and a labelled dot per page", () => {
    bar();
    expect(screen.getByText("Page 2 of 5")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Page \d$/ })).toHaveLength(
      5,
    );
  });

  it("goes to a page from its dot and from the arrow keys", () => {
    const onPage = vi.fn();
    bar(onPage);
    fireEvent.click(screen.getByRole("button", { name: "Page 4" }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onPage).toHaveBeenLastCalledWith(0);
  });

  it("shows the new-word count on the button", () => {
    bar();
    expect(screen.getByText("Finish page · 2 new → known")).toBeTruthy();
  });

  it("asks first and does nothing on cancel", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    bar();
    fireEvent.click(screen.getByText(/Finish page/));
    expect(confirm).toHaveBeenCalledWith(
      "Mark 2 new words on this page as known?",
    );
    expect(api.markNewWordsKnown).not.toHaveBeenCalled();
  });

  it("sends only the page's new words after confirming, reloads words, then undoes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    bar();
    fireEvent.click(screen.getByText(/Finish page/));
    expect(await screen.findByText(/2 marked known/)).toBeTruthy();
    expect(api.markNewWordsKnown).toHaveBeenCalledWith(["Haus", "Baum"]);
    expect(loadUserWords).toHaveBeenCalledTimes(1);

    vi.mocked(api.undoMarkNewWordsKnown).mockResolvedValue({
      removed: 2,
      word_ids: [5, 6],
      event_ids: [7, 8],
    });
    fireEvent.click(screen.getByText("Undo"));
    await vi.waitFor(() => expect(loadUserWords).toHaveBeenCalledTimes(2));
    expect(api.undoMarkNewWordsKnown).toHaveBeenCalledWith({
      changed: 2,
      word_ids: [5, 6],
      event_ids: [7, 8],
    });
    expect(screen.queryByText("Undo")).toBeNull();
  });

  it("drops the Undo link when the page changes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    bar();
    fireEvent.click(screen.getByText(/Finish page/));
    expect(await screen.findByText("Undo")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.queryByText("Undo")).toBeNull();
  });

  it("offers no Undo when nothing changed", async () => {
    vi.mocked(api.markNewWordsKnown).mockResolvedValue({
      changed: 0,
      word_ids: [],
      event_ids: [],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    bar();
    fireEvent.click(screen.getByText(/Finish page/));
    await vi.waitFor(() => expect(loadUserWords).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Undo")).toBeNull();
  });
});
