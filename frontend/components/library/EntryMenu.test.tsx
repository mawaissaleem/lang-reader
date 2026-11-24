// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntryMenu from "@/components/library/EntryMenu";

afterEach(cleanup);

function setup() {
  const first = vi.fn();
  const second = vi.fn();
  render(
    <EntryMenu
      actions={[
        { label: "Rename", onSelect: first },
        { label: "Delete…", onSelect: second },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Entry actions" });
  return { trigger, first, second };
}

describe("EntryMenu", () => {
  it("opens with ArrowDown and focuses the first item", () => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Rename" }),
    );
  });

  it("moves between items with the arrow keys, wrapping around", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Delete…" }),
    );
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Rename" }),
    );
  });

  it("closes on Escape and returns focus to the button", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("runs the chosen action and closes", () => {
    const { trigger, second } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
