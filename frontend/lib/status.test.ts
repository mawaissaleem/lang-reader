// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { statusForKey } from "@/lib/status";

const key = (k: string, init: KeyboardEventInit = {}, target?: HTMLElement) => {
  const e = new KeyboardEvent("keydown", { key: k, ...init });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
};

describe("statusForKey", () => {
  it("maps keys to statuses, case-insensitively", () => {
    expect(
      ["1", "2", "3", "k", "K", "i"].map((k) => statusForKey(key(k))),
    ).toEqual([
      "learning1",
      "learning2",
      "learning3",
      "known",
      "known",
      "ignored",
    ]);
    expect(statusForKey(key("x"))).toBeNull();
  });

  it("ignores modifier keys", () => {
    expect(statusForKey(key("k", { ctrlKey: true }))).toBeNull();
    expect(statusForKey(key("1", { metaKey: true }))).toBeNull();
    expect(statusForKey(key("i", { altKey: true }))).toBeNull();
  });

  it("ignores typing in inputs and textareas", () => {
    expect(
      statusForKey(key("k", {}, document.createElement("input"))),
    ).toBeNull();
    expect(
      statusForKey(key("k", {}, document.createElement("textarea"))),
    ).toBeNull();
  });
});
