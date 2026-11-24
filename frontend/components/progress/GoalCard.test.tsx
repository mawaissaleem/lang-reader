// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GoalCard from "./GoalCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalCard", () => {
  it("saves a new goal through the API and tells the page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ goal: 40 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    render(<GoalCard today={18} goal={25} onSaved={onSaved} />);
    fireEvent.click(screen.getByText("Change goal"));
    fireEvent.change(screen.getByLabelText("Words per day"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByText("Save"));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/progress/goal");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ goal: 40 });
  });

  it("disables Save for a goal outside 1-1000", () => {
    render(<GoalCard today={0} goal={25} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("Change goal"));
    fireEvent.change(screen.getByLabelText("Words per day"), {
      target: { value: "0" },
    });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: "boom" }),
      }),
    );
    render(<GoalCard today={0} goal={25} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("Change goal"));
    fireEvent.click(screen.getByText("Save"));
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
  });
});
