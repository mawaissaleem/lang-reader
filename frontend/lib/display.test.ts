// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, loadDisplay, saveDisplay } from "@/lib/display";

beforeEach(() => localStorage.clear());

describe("display settings", () => {
  it("gives the defaults when nothing is saved", () => {
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("brings back what was saved, so the theme survives a reload", () => {
    saveDisplay({ ...DEFAULT_DISPLAY, theme: "paper", textSize: "L" });
    expect(loadDisplay()).toMatchObject({ theme: "paper", textSize: "L" });
  });

  it("falls back to the defaults when storage holds garbage", () => {
    localStorage.setItem("readerDisplay", "{nope");
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY);
  });
});
