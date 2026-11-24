import { describe, expect, it } from "vitest";
import {
  cleanWord,
  clickedKey,
  entryFor,
  inSelectionRange,
  particleToken,
} from "@/lib/words";

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
    const idx = tk.map((x, i) => (x === word ? i : -1)).filter((i) => i >= 0)[
      nth
    ];
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
    expect([
      entryFor(map, "Bank"),
      entryFor(map, "bank"),
      entryFor(map, "Haus"),
    ]).toEqual([1, 2, 3]);
    expect(entryFor({ bank: 2 }, "Bank")).toBe(2);
  });

  it("aliases nouns by exact clicked form, others lowercase", () => {
    expect(clickedKey({ word: "Tisch", clicked: "Tische" })).toBe("Tische");
    expect(clickedKey({ word: "gehen", clicked: "Ging" })).toBe("ging");
  });
});

describe("particleToken", () => {
  const tokens = "Der Zug kommt an der Haltestelle an. Er ruft an.".split(
    /(\s+)/,
  );
  const verb = tokens.indexOf("kommt");

  it("skips the preposition with the same text and picks the particle", () => {
    expect(particleToken(tokens, verb, "an", 1, 0)).toEqual({
      id: `0:${tokens.indexOf("an.")}`,
      word: "an",
    });
  });

  it("without a skip takes the first match", () => {
    expect(particleToken(tokens, verb, "an", 0, 0)?.id).toBe(
      `0:${tokens.indexOf("an")}`,
    );
  });

  it("does not cross into the next sentence", () => {
    expect(particleToken(tokens, verb, "an", 2, 0)).toBeNull();
  });
});

describe("inSelectionRange", () => {
  const sel = [
    { id: "0:2", word: "fängt" },
    { id: "0:8", word: "an" },
  ];

  it("covers the tokens from the first to the last selected one", () => {
    expect(
      ["0:2", "0:5", "0:8"].map((id) => inSelectionRange(sel, id)),
    ).toEqual([true, true, true]);
  });

  it("excludes tokens outside, in another paragraph or with one selected word", () => {
    expect(inSelectionRange(sel, "0:9")).toBe(false);
    expect(inSelectionRange(sel, "1:5")).toBe(false);
    expect(inSelectionRange(sel.slice(0, 1), "0:2")).toBe(false);
  });
});
