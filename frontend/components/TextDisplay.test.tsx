// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TextDisplay from "@/components/TextDisplay";
import useStore from "@/store/useStore";

vi.mock("@/lib/api", () => ({
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
}));

beforeEach(() =>
  useStore.setState({
    text: "eins zwei\ndrei vier",
    title: "",
    userWords: {},
    focusMode: true,
  }),
);
afterEach(cleanup);

// the <p> holding a word, to read its fade class
const para = (word: string) => screen.getByText(word).closest("p")!.className;

describe("TextDisplay focus mode", () => {
  it("fades every paragraph but the selected word's", () => {
    useStore.setState({ selectedTokens: [{ id: "1:0", word: "drei" }] });
    render(<TextDisplay />);
    expect(para("eins")).toContain("opacity-30");
    expect(para("drei")).not.toContain("opacity-30");
  });

  it("fades nothing while no word is selected", () => {
    useStore.setState({ selectedTokens: [] });
    render(<TextDisplay />);
    expect(para("eins")).not.toContain("opacity-30");
    expect(para("drei")).not.toContain("opacity-30");
  });
});
