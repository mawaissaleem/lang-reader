// @vitest-environment jsdom
import { Profiler } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TextDisplay from "@/components/TextDisplay";
import useStore from "@/store/useStore";

vi.mock("@/lib/api", () => ({ lookupWord: vi.fn() }));

// TextDisplay renders its tokens as spans; Profiler counts commits of the whole tree,
// so count per-span re-renders by wrapping WordToken instead.
const renders: string[] = [];
vi.mock("@/components/WordToken", async (orig) => {
  const mod = await orig<typeof import("@/components/WordToken")>();
  const Real = mod.default;
  return {
    default: (p: { word: string; highlightMode: "underline" | "highlight" }) => (
      <Profiler id={p.word} onRender={() => renders.push(p.word)}>
        <Real {...p} />
      </Profiler>
    ),
  };
});

beforeEach(() => {
  renders.length = 0;
  useStore.setState({ text: "eins zwei drei vier", title: "", selectedWord: null, wordLoading: false });
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
