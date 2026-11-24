// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

it("a lone verb whose lookup reports a particle selects both parts and looks up the pair", async () => {
  vi.mocked(lookupWord).mockImplementation(
    async (word: string) =>
      ({
        translations: {},
        preferred: "pons",
        source: "pons",
        particle: word === "fängt" ? "an" : undefined,
      }) as never,
  );
  render(<TextDisplay />);
  fireEvent.click(screen.getByText("fängt"));
  await waitFor(() =>
    expect(lookupWord).toHaveBeenLastCalledWith(
      "fängt an",
      expect.anything(),
      false,
      "Er fängt morgen an.",
    ),
  );
  expect(screen.getByText("fängt").className).toContain("ring-2");
  expect(screen.getByText("an.").className).toContain("ring-2");
  // the word between the two parts carries the dotted joining line
  expect(screen.getByText("morgen").className).toContain("decoration-dotted");
  // so does the whitespace around it, for one unbroken line
  const gap = screen.getByText("morgen").previousElementSibling;
  expect(gap?.className).toContain("decoration-dotted");
});

it("a particle that is not in the sentence leaves the single word selected", async () => {
  vi.mocked(lookupWord).mockResolvedValue({
    translations: {},
    preferred: "pons",
    source: "pons",
    particle: "auf",
  } as never);
  render(<TextDisplay />);
  fireEvent.click(screen.getByText("fängt"));
  await waitFor(() => expect(lookupWord).toHaveBeenCalledTimes(1));
  expect(screen.getByText("an.").className).not.toContain("ring-2");
});
