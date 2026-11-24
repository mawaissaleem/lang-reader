import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
const paper = css.slice(css.indexOf('[data-theme="paper"]'));

// reads "--name: value;" from the Paper block, the single source of truth for the colours
const token = (name: string) =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(paper)![1].trim();

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

const over = (top: Rgba, base: Rgba): Rgba => [
  ...([0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])) as [
    number,
    number,
    number,
  ]),
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

const STATUSES = ["new", "l1", "l2", "l3", "known", "ignored"];

describe("Paper theme contrast", () => {
  const page = parse(token("--bg"));

  it.each(STATUSES)("%s text is at least 4.5:1 on its background", (name) => {
    // statuses without a background of their own sit on the paper itself
    const bgValue = new RegExp(`--st-${name}-bg:`).test(paper)
      ? parse(token(`--st-${name}-bg`))
      : page;
    const ground = over(bgValue, page);
    const text = parse(token(`--st-${name}-text`));
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5);
  });

  // warnings and the der / die / das article colours sit on the paper itself
  it.each([
    "--text",
    "--warn-text",
    "--gender-der",
    "--gender-die",
    "--gender-das",
  ])("%s is at least 4.5:1 on the paper", (name) => {
    expect(contrast(parse(token(name)), page)).toBeGreaterThanOrEqual(4.5);
  });

  it("the auto-captions warning is at least 4.5:1 on its amber tint", () => {
    // the header badge is bg-amber-400/10 (#fbbf24 at 10%) over the paper
    const tint = over([251, 191, 36, 0.1], page);
    expect(contrast(parse(token("--warn-text")), tint)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
