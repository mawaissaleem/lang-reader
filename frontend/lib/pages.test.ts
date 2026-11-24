import { describe, expect, it } from "vitest";
import { newForms, splitPages } from "@/lib/pages";

const para = (n: number, w = "wort") => Array(n).fill(w).join(" ");

describe("splitPages", () => {
  it("keeps a short text on one page", () => {
    expect(splitPages("Ein Satz.\nNoch einer.")).toEqual([
      "Ein Satz.\nNoch einer.",
    ]);
  });

  it("splits on paragraph boundaries and loses nothing", () => {
    const paras = [
      para(120, "a"),
      para(120, "b"),
      para(120, "c"),
      para(50, "d"),
    ];
    const pages = splitPages(paras.join("\n"));
    expect(pages).toHaveLength(2);
    expect(pages.join("\n")).toBe(paras.join("\n"));
    // every page is made of whole paragraphs
    for (const page of pages)
      for (const line of page.split("\n")) expect(paras).toContain(line);
  });

  it("starts a new page rather than pass the maximum", () => {
    const pages = splitPages([para(200), para(200)].join("\n"));
    expect(pages).toHaveLength(2);
  });

  it("splits one huge paragraph on sentences", () => {
    const sentence = `${para(99)}.`;
    const pages = splitPages(Array(8).fill(sentence).join(" "));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.endsWith(".")).toBe(true);
  });

  it("returns no pages for empty text", () => {
    expect(splitPages("")).toEqual([]);
  });
});

describe("newForms", () => {
  it("lists unique unsaved words only", () => {
    const saved = { Haus: { status: "known" }, hund: { status: "ignored" } };
    expect(newForms("Haus Hund, Katze Katze! hund Baum", saved)).toEqual([
      "Katze",
      "Baum",
    ]);
  });
});
