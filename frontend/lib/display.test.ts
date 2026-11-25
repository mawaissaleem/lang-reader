// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY,
  loadDisplay,
  saveDisplay,
  THEME_INIT_SCRIPT,
} from "@/lib/display";

beforeEach(() => localStorage.clear());

describe("display settings", () => {
  it("gives the defaults when nothing is saved", () => {
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("brings back what was saved, so the theme survives a reload", () => {
    saveDisplay({ ...DEFAULT_DISPLAY, theme: "grove", textSize: "L" });
    expect(loadDisplay()).toMatchObject({ theme: "grove", textSize: "L" });
  });

  it.each([
    ["dark", "midnight"],
    ["paper", "linen"],
  ])("loads an old saved %s theme as %s", (old, now) => {
    localStorage.setItem("readerDisplay", JSON.stringify({ theme: old }));
    expect(loadDisplay().theme).toBe(now);
  });

  it("falls back to the defaults when storage holds garbage", () => {
    localStorage.setItem("readerDisplay", "{nope");
    expect(loadDisplay()).toEqual(DEFAULT_DISPLAY);
  });
});

describe("theme init script", () => {
  // the script runs before React, so it must pick the same theme as loadDisplay
  it.each([
    "dark",
    "paper",
    "grove",
    "linen",
    "midnight",
    "bogus",
    "constructor",
  ])("sets the same theme as loadDisplay for saved %s", (saved) => {
    localStorage.setItem("readerDisplay", JSON.stringify({ theme: saved }));
    delete document.documentElement.dataset.theme;
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe(loadDisplay().theme);
  });

  it("falls back to midnight when nothing or garbage is saved", () => {
    localStorage.setItem("readerDisplay", "{nope");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("midnight");
  });
});
