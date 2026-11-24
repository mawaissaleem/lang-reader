// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DisplayMenu from "@/components/library/DisplayMenu";
import { DEFAULT_DISPLAY } from "@/lib/display";
import useStore from "@/store/useStore";

beforeEach(() => {
  localStorage.clear();
  useStore.setState(DEFAULT_DISPLAY);
});
afterEach(cleanup);

const open = () => fireEvent.click(screen.getByText("Display ▾"));

describe("DisplayMenu", () => {
  it("switches to Paper and saves it", () => {
    render(<DisplayMenu showFocus />);
    open();
    fireEvent.click(screen.getByText("Paper"));
    expect(useStore.getState().theme).toBe("paper");
    expect(localStorage.getItem("readerDisplay")).toContain('"paper"');
  });

  it("closes on Escape", () => {
    render(<DisplayMenu showFocus />);
    open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("H toggles highlights and F toggles focus", () => {
    render(<DisplayMenu showFocus />);
    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "f" });
    expect(useStore.getState()).toMatchObject({
      highlightsOn: false,
      focusMode: true,
    });
  });

  it("turns gender colours off and saves it", () => {
    render(<DisplayMenu showFocus />);
    open();
    const row = screen.getByText("Gender colours").parentElement!;
    fireEvent.click(within(row).getByText("Off"));
    expect(useStore.getState().genderColours).toBe(false);
    expect(localStorage.getItem("readerDisplay")).toContain(
      '"genderColours":false',
    );
  });

  it("hides focus mode and ignores F where focus does nothing", () => {
    render(<DisplayMenu showFocus={false} />);
    open();
    expect(screen.queryByText("Focus mode")).toBeNull();
    fireEvent.keyDown(window, { key: "f" });
    expect(useStore.getState().focusMode).toBe(false);
  });
});
