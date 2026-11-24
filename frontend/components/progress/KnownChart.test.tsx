// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgressHistory } from "@/lib/history";
import KnownChart from "./KnownChart";

const history: ProgressHistory = {
  known: 7,
  before: 4,
  days: [["2026-11-24", 7]],
  saved: [["2026-11-24", 5]],
  week_gain: 3,
  streak: { current: 1, longest: 1 },
  today: 5,
  goal: 25,
};

afterEach(cleanup);

describe("KnownChart", () => {
  it("shows the card with the day's counts when the chart gets keyboard focus", () => {
    render(<KnownChart history={history} today="2026-11-24" />);
    fireEvent.focus(screen.getByLabelText("Known words per day chart"));
    expect(screen.getByText("24 Nov · +3 · 5 saved")).toBeTruthy();
  });

  it("arrow keys move to the previous day", () => {
    render(<KnownChart history={history} today="2026-11-24" />);
    const chart = screen.getByLabelText("Known words per day chart");
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByText("23 Nov · +0 · 0 saved")).toBeTruthy();
  });

  it("the range switch changes the number of days", () => {
    render(<KnownChart history={history} today="2026-11-24" />);
    const button = screen.getByText("7 days");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.focus(screen.getByLabelText("Known words per day chart"));
    fireEvent.keyDown(screen.getByLabelText("Known words per day chart"), {
      key: "Home",
    });
    expect(screen.getByText("18 Nov · +0 · 0 saved")).toBeTruthy();
  });

  it("updates the live region from the keyboard but not from mouse hover", () => {
    const { container } = render(
      <KnownChart history={history} today="2026-11-24" />,
    );
    const chart = screen.getByLabelText("Known words per day chart");
    const live = container.querySelector("[aria-live]")!;
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 300,
    } as DOMRect);
    fireEvent.mouseMove(chart, { clientX: 299 });
    expect(screen.getByText("24 Nov · +3 · 5 saved")).toBeTruthy();
    expect(live.textContent).toBe("");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(live.textContent).toContain("23 Nov");
  });
});
