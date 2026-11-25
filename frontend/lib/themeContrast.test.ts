import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
const THEMES = ["midnight", "grove", "linen"];

// the "--name: value;" declarations of one theme block in globals.css
function themeTokens(theme: string) {
  const start = css.indexOf(`[data-theme="${theme}"] {`);
  const block = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

type Rgba = [number, number, number, number];
function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const [r, g, b, a = 1] = value.match(/[\d.]+/g)!.map(Number);
  return [r, g, b, a];
}

// a colour drawn over a base: translucent backgrounds are checked as the eye sees them
const over = (top: Rgba, base: Rgba): Rgba => [
  top[0] * top[3] + base[0] * (1 - top[3]),
  top[1] * top[3] + base[1] * (1 - top[3]),
  top[2] * top[3] + base[2] * (1 - top[3]),
  1,
];

function luminance([r, g, b]: Rgba) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: Rgba, b: Rgba) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, background token, minimum ratio]; a translucent background sits on --surface
const PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["faint", "surface", 3],
  ["st-ignored-text", "surface", 3],
  ["accent", "surface", 4.5],
  ["on-accent", "accent", 4.5],
  ["st-new-text", "st-new-bg", 4.5],
  ["st-l1-text", "st-l1-bg", 4.5],
  ["st-l2-text", "st-l2-bg", 4.5],
  ["st-l3-text", "st-l3-bg", 4.5],
  ["st-known-text", "surface", 4.5],
  ["good", "surface", 4.5],
  ["hard", "surface", 4.5],
  ["warn-text", "surface", 4.5],
  ["gender-der", "surface", 4.5],
  ["gender-die", "surface", 4.5],
  ["gender-das", "surface", 4.5],
];

describe.each(THEMES)("%s theme", (theme) => {
  const tokens = themeTokens(theme);

  it.each(PAIRS)("%s on %s is at least %d:1", (fg, bg, min) => {
    const surface = parse(tokens.surface);
    const ground = over(parse(tokens[bg]), surface);
    expect(
      contrast(over(parse(tokens[fg]), ground), ground),
    ).toBeGreaterThanOrEqual(min);
  });

  it("on-accent text is readable on the second accent too", () => {
    const accent2 = tokens.accent2.startsWith("var(")
      ? tokens.accent
      : tokens.accent2;
    expect(
      contrast(parse(tokens["on-accent"]), parse(accent2)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("defines every colour token the others define", () => {
    // midnight also carries the shared shadcn vars, so check for a superset
    const colourNames = Object.keys(themeTokens("grove"));
    expect(Object.keys(tokens)).toEqual(expect.arrayContaining(colourNames));
  });
});
