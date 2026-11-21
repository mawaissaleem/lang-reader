// @vitest-environment jsdom
import { Profiler } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TextDisplay from "@/components/TextDisplay";
import useStore from "@/store/useStore";

vi.mock("@/lib/api", () => ({
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
}));

// TextDisplay renders its tokens as spans; Profiler counts commits of the whole tree,
// so count per-span re-renders by wrapping WordToken instead.
const renders: string[] = [];
vi.mock("@/components/WordToken", async (orig) => {
  const mod = await orig<typeof import("@/components/WordToken")>();
  const Real = mod.default;
  return {
    default: (p: {
      word: string;
      highlightMode: "underline" | "highlight";
      sentence: () => string;
    }) => (
      <Profiler id={p.word} onRender={() => renders.push(p.word)}>
        <Real {...p} />
      </Profiler>
    ),
  };
});

beforeEach(() => {
  renders.length = 0;
  useStore.setState({
    text: "eins zwei drei vier",
    title: "",
    selectedWord: null,
    wordLoading: false,
  });
  render(<TextDisplay />);
  renders.length = 0; // ignore mount
});
afterEach(cleanup);

describe("WordToken re-renders", () => {
  it("re-renders only old and new selected words", () => {
    act(() => useStore.setState({ selectedWord: "eins" }));
    expect(renders).toEqual(["eins"]);
    renders.length = 0;
    act(() => useStore.setState({ selectedWord: "drei" }));
    expect(renders.sort()).toEqual(["drei", "eins"]);
  });

  it("does not re-render tokens when wordLoading changes", () => {
    act(() => useStore.setState({ wordLoading: true }));
    expect(renders).toEqual([]);
  });
});

describe("WordToken status class", () => {
  const cls = (userWords: Record<string, { id: number; status: never }>) => {
    cleanup();
    useStore.setState({ userWords, selectedWord: null });
    return render(<TextDisplay />).getByText("eins").className;
  };
  it("renders a different class per status", () => {
    const st = (status: string) =>
      cls({ eins: { id: 1, status: status as never } });
    const all = [
      cls({}),
      ...["learning1", "learning2", "learning3", "known", "ignored"].map(st),
    ];
    expect(new Set(all).size).toBe(6);
    expect(all[0]).toContain("bg-blue-500/10");
    expect(all[1]).toContain("decoration-amber-400 ");
    expect(all[5]).toContain("text-white/30");
  });
});

describe("WordToken selection highlight", () => {
  const ring = (text: string, selectedWord: string) => {
    cleanup();
    useStore.setState({ text, selectedWord, userWords: {} });
    return render(<TextDisplay />)
      .getByText(text.split(" ")[0])
      .className.includes("ring-2");
  };
  it("lowercase selection marks a capitalized token", () =>
    expect(ring("Das Haus", "das")).toBe(true));
  it("noun selection does not mark the lowercase word", () =>
    expect(ring("bank Haus", "Bank")).toBe(false));
});
