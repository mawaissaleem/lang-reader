// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry } from "@/lib/api";
import TodayStrip from "./TodayStrip";

const history = {
  known: 0,
  before: 0,
  days: [],
  streak: { current: 3, longest: 5 },
  today: 18,
  goal: 25,
};
const entry = { type: "text", id: 1, title: "Der Bahnhof" } as LibraryEntry;

afterEach(cleanup);

describe("TodayStrip", () => {
  it("shows today's count against the goal and the streak", () => {
    render(
      <TodayStrip history={history} nextLoading={false} onContinue={vi.fn()} />,
    );
    expect(screen.getByText("18/25")).toBeTruthy();
    expect(screen.getByText("7 more words saved or levelled up")).toBeTruthy();
    expect(screen.getByText("Longest 5")).toBeTruthy();
  });

  it("Continue opens the up-next entry", () => {
    const onContinue = vi.fn();
    const next = { known: 1, learning: 0, new: 9, total: 10 };
    render(
      <TodayStrip
        history={history}
        next={entry}
        nextProgress={next}
        nextLoading={false}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith(entry);
  });

  it("shows no up-next note while library progress is still loading", () => {
    const { rerender } = render(
      <TodayStrip history={history} nextLoading onContinue={vi.fn()} />,
    );
    expect(screen.queryByText("Nothing left to learn here.")).toBeNull();
    rerender(
      <TodayStrip history={history} nextLoading={false} onContinue={vi.fn()} />,
    );
    expect(screen.getByText("Nothing left to learn here.")).toBeTruthy();
  });
});
