// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TextDisplay from "@/components/TextDisplay";
import useStore from "@/store/useStore";

vi.mock("@/lib/api", () => ({
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
}));
import { lookupWord } from "@/lib/api";

beforeEach(() => {
  vi.mocked(lookupWord)
    .mockReset()
    .mockResolvedValue({
      translations: {},
      preferred: "pons",
      source: "pons",
    } as never);
  useStore.setState({
    text: "Er fängt morgen an.",
    title: "",
    selectedWord: null,
    selectedTokens: [],
    selectedSentence: null,
  });
});
afterEach(cleanup);

it("shift+click on fängt then an looks up the phrase and highlights both", () => {
  render(<TextDisplay />);
  fireEvent.click(screen.getByText("fängt"));
  fireEvent.click(screen.getByText("an."), { shiftKey: true });
  expect(lookupWord).toHaveBeenLastCalledWith(
    "fängt an",
    expect.anything(),
    false,
    "Er fängt morgen an.",
  );
  expect(screen.getByText("fängt").className).toContain("ring-2");
  expect(screen.getByText("an.").className).toContain("ring-2");
  expect(screen.getByText("morgen").className).not.toContain("ring-2");
});
