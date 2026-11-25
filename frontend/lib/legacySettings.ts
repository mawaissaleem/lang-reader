import { fetchSettings, saveSettings, type UserSettings } from "@/lib/api";

// Keys older versions kept in this browser; the server holds them now.
const PRIORITY_KEY = "translatorPriority";
const ANKI_KEY = "ankiDefault";

/**
 * Load the saved settings. A value still sitting in localStorage is sent up once when the
 * server has none, then the old keys are removed. If the settings cannot be read the old keys stay.
 */
export async function loadSettingsMovingLegacy(): Promise<UserSettings> {
  let settings = await fetchSettings();
  const oldPriority = localStorage.getItem(PRIORITY_KEY);
  const oldAnki = localStorage.getItem(ANKI_KEY);

  const move: Parameters<typeof saveSettings>[0] = {};
  if (settings.translator_priority === null && oldPriority)
    move.translator_priority = [oldPriority];
  if (settings.anki_default === null && oldAnki !== null)
    move.anki_default = oldAnki === "1";
  // a failed upload (e.g. an old id the server rejects) is dropped, so it is not retried every load
  if (Object.keys(move).length)
    settings = await saveSettings(move).catch(() => settings);

  localStorage.removeItem(PRIORITY_KEY);
  localStorage.removeItem(ANKI_KEY);
  return settings;
}
