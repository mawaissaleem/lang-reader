import { describe, expect, it } from "vitest";
import { cleanWord, clickedKey, entryFor } from "@/lib/words";

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

import { sentenceAt } from "@/lib/words";

describe("sentenceAt", () => {
  const tokens = (t: string) => t.split(/(\s+)/);
  const at = (t: string, word: string, nth = 0) => {
    const tk = tokens(t);
    const idx = tk.map((x, i) => (x === word ? i : -1)).filter((i) => i >= 0)[nth];
    return sentenceAt(tk, idx);
  };

  it("picks the sentence around the token", () => {
    const t = "Das ist gut. Wo ist der Hund? Er schläft!";
    expect(at(t, "Hund?")).toBe("Wo ist der Hund?");
    expect(at(t, "Das")).toBe("Das ist gut.");
    expect(at(t, "schläft!")).toBe("Er schläft!");
  });

  it("uses the token index when a word repeats", () => {
    const t = "Der Hund bellt. Der Hund schläft.";
    expect(at(t, "Hund", 0)).toBe("Der Hund bellt.");
    expect(at(t, "Hund", 1)).toBe("Der Hund schläft.");
  });

  it("returns the whole paragraph without terminal punctuation", () => {
    expect(at("kein Punkt hier", "Punkt")).toBe("kein Punkt hier");
  });

  it("keeps closing German quotes with their sentence", () => {
    expect(at("Er sagte „Hallo.“ Dann ging er.", "ging")).toBe("Dann ging er.");
  });
});

describe("entryFor / clickedKey", () => {
  it("keeps Bank and bank apart, falls back to lowercase for legacy keys", () => {
    const map = { Bank: 1, bank: 2, haus: 3 };
    expect([entryFor(map, "Bank"), entryFor(map, "bank"), entryFor(map, "Haus")]).toEqual([1, 2, 3]);
    expect(entryFor({ bank: 2 }, "Bank")).toBe(2);
  });

  it("aliases nouns by exact clicked form, others lowercase", () => {
    expect(clickedKey({ word: "Tisch", clicked: "Tische" })).toBe("Tische");
    expect(clickedKey({ word: "gehen", clicked: "Ging" })).toBe("ging");
  });
});
