import { describe, expect, it } from "vitest";
import { cleanWord } from "@/lib/words";

describe("cleanWord", () => {
  it.each([
    ["Haus,", "Haus"],
    ["(Kind)", "Kind"],
    ["„Hallo“", "Hallo"],
    ["»Ja«", "Ja"],
    ["‚Tag‘", "Tag"],
    ["Wort–", "Wort"],
    ["E-Mail,", "E-Mail"],
    ["geht's", "geht's"],
    ["geht’s", "geht's"],
    ["Bär-chen.", "Bär-chen"],
  ])("cleans %s", (input, expected) => expect(cleanWord(input)).toBe(expected));

  it.each(["!?", "…", "–", "-", "'", "2026"])("returns empty for %s", (input) =>
    expect(cleanWord(input)).toBe(""),
  );
});
