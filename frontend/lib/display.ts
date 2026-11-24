import type { DisplaySettings } from "@/types";

const KEY = "readerDisplay";

export const DEFAULT_DISPLAY: DisplaySettings = {
  theme: "dark",
  textSize: "M",
  highlightsOn: true,
  focusMode: false,
  genderColours: true,
  highlightMode: "underline",
};

/** Reading font size for each Display menu size. */
export const TEXT_SIZE_REM = { S: "0.95rem", M: "1.05rem", L: "1.3rem" };

/** Saved Display settings merged over the defaults; unknown or broken storage gives the defaults. */
export function loadDisplay(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULT_DISPLAY, ...saved };
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
