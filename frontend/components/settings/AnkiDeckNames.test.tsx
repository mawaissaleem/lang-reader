// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(async () => ({})),
}));

import { fetchSettings, saveSettings } from "@/lib/api";
import AnkiDeckNames from "./AnkiDeckNames";

afterEach(cleanup);

describe("AnkiDeckNames", () => {
  it("shows the saved names", async () => {
    vi.mocked(fetchSettings).mockResolvedValue({
      translator_priority: null,
      anki_default: null,
      anki_deck_words: "Mein::Wörter",
      anki_deck_sentences: null,
    });
    render(<AnkiDeckNames />);
    const input = screen.getByLabelText("Deck for word cards");
    await waitFor(() => expect(input).toHaveProperty("value", "Mein::Wörter"));
    expect(screen.getByLabelText("Deck for sentence cards")).toHaveProperty(
      "value",
      "",
    );
  });

  it("saves the typed name on blur", async () => {
    vi.mocked(fetchSettings).mockResolvedValue({
      translator_priority: null,
      anki_default: null,
    });
    render(<AnkiDeckNames />);
    const input = screen.getByLabelText("Deck for sentence cards");
    fireEvent.change(input, { target: { value: "Mein::Sätze" } });
    fireEvent.blur(input);
    expect(saveSettings).toHaveBeenCalledWith({
      anki_deck_sentences: "Mein::Sätze",
    });
  });
});
