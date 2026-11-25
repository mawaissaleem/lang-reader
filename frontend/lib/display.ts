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

/** A saved theme name as a current theme; missing or unknown names give the default. */
function migrateTheme(saved: unknown): ReaderTheme {
  const name = String(saved);
  if (name in OLD_THEMES) return OLD_THEMES[name];
  const current: ReaderTheme[] = ["midnight", "grove", "linen"];
  return current.find((t) => t === name) ?? DEFAULT_DISPLAY.theme;
}

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
