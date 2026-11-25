import type { DisplaySettings, ReaderTheme } from "@/types";

const KEY = "readerDisplay";

export const DEFAULT_DISPLAY: DisplaySettings = {
  theme: "midnight",
  textSize: "M",
  highlightsOn: true,
  focusMode: false,
  genderColours: true,
  highlightMode: "underline",
};

/** Reading font size for each Display menu size. */
export const TEXT_SIZE_REM = { S: "0.95rem", M: "1.05rem", L: "1.3rem" };

/** Theme names saved before the rename, mapped to today's themes. */
const OLD_THEMES: Record<string, ReaderTheme> = {
  dark: "midnight",
  paper: "linen",
};

/** The three themes, in the order every switcher lists them. */
export const THEMES: { value: ReaderTheme; label: string }[] = [
  { value: "midnight", label: "Midnight" },
  { value: "grove", label: "Grove" },
  { value: "linen", label: "Linen" },
];

/** A saved theme name as a current theme; missing or unknown names give the default. */
function migrateTheme(saved: unknown): ReaderTheme {
  const name = String(saved);
  if (Object.hasOwn(OLD_THEMES, name)) return OLD_THEMES[name];
  return THEMES.find((t) => t.value === name)?.value ?? DEFAULT_DISPLAY.theme;
}

/** Puts the theme on <html>, where every page and panel picks it up. */
export function applyTheme(theme: ReaderTheme) {
  if (typeof document !== "undefined")
    document.documentElement.dataset.theme = theme;
}

/** Runs inline in <head> before first paint: puts the saved theme (old names migrated) on <html>. Must stay self-contained: it is serialised with Function.toString. */
function setSavedTheme(
  key: string,
  fallback: string,
  old: Record<string, string>,
  names: string[],
) {
  let theme = fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}").theme;
    const name = Object.prototype.hasOwnProperty.call(old, saved)
      ? old[saved]
      : saved;
    if (names.includes(name)) theme = name;
  } catch {}
  document.documentElement.dataset.theme = theme;
}

/** Inline script for <head> so Linen never flashes dark; fed the same key, names and migration map as loadDisplay. */
export const THEME_INIT_SCRIPT = `(${setSavedTheme})(${JSON.stringify(KEY)}, ${JSON.stringify(DEFAULT_DISPLAY.theme)}, ${JSON.stringify(OLD_THEMES)}, ${JSON.stringify(THEMES.map((t) => t.value))})`;

/** Saved Display settings merged over the defaults; unknown or broken storage gives the defaults. */
export function loadDisplay(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULT_DISPLAY, ...saved, theme: migrateTheme(saved.theme) };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/** Saves just the Display fields of the store state (private mode may refuse; then they last for the session). */
export function saveDisplay(s: DisplaySettings) {
  const {
    theme,
    textSize,
    highlightsOn,
    focusMode,
    genderColours,
    highlightMode,
  } = s;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme,
        textSize,
        highlightsOn,
        focusMode,
        genderColours,
        highlightMode,
      }),
    );
  } catch {}
}
