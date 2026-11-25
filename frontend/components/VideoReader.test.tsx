// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  USER_ID: 1,
  ttsUrl: (t: string) => `/tts?text=${t}`,
  fetchSentenceTranslation: vi.fn(async () => "Hello world"),
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
  fetchAnkiConnected: vi.fn(async () => true),
  fetchAnkiPending: vi.fn(async () => 0),
  fetchLlmModels: vi.fn(async () => ({
    models: [],
    selected: null,
    default: null,
  })),
}));

import { lookupWord } from "@/lib/api";
import VideoReader from "@/components/VideoReader";
import useStore from "@/store/useStore";

const pauseVideo = vi.fn();
const cues = [{ start: 0, end: 5, text: "Hallo Welt" }];

beforeEach(() => {
  pauseVideo.mockClear();
  // a fake player so no script is loaded from YouTube
  (window as unknown as { YT: unknown }).YT = {
    Player: class {
      pauseVideo = pauseVideo;
      getCurrentTime = () => 1;
      getDuration = () => 100;
      destroy() {}
    },
  };
  window.matchMedia ??= (() => ({ matches: false })) as never;
  Element.prototype.scrollTo ??= () => {};
  vi.mocked(lookupWord).mockResolvedValue({
    id: 1,
    word: "Welt",
    clicked: "Welt",
    source: "pons",
    english_meanings: ["world"],
    word_class: "noun",
    translations: { pons: { meanings: ["world"], word_class: "noun" } },
    preferred: "pons",
    article: "die",
  } as never);
  useStore.setState({
    selectedWord: null,
    sidePanelOpen: false,
    userWords: {},
    ai: {},
  });
  render(<VideoReader url="https://youtu.be/dQw4w9WgXcQ" cues={cues} />);
});

afterEach(cleanup);

// the 250ms poll sets the current line, which draws the overlay
async function showOverlay() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

describe("video overlay", () => {
  it("pauses the player and opens the card when a word is clicked", async () => {
    await showOverlay();
    const overlayWord = screen.getAllByText("Welt")[0];
    await act(async () => {
      fireEvent.click(overlayWord);
    });
    expect(pauseVideo).toHaveBeenCalled();
    expect(useStore.getState().selectedWord).toBe("Welt");
    expect(useStore.getState().sidePanelOpen).toBe(false);
    expect(screen.getByTestId("word-card")).toBeTruthy();
  });

  it("Details opens the side panel and hides the card", async () => {
    await showOverlay();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Welt")[0]);
    });
    fireEvent.click(screen.getByText("Details"));
    expect(useStore.getState().sidePanelOpen).toBe(true);
    expect(screen.queryByTestId("word-card")).toBeNull();
  });

  it("the card sits on the video and closes with × or Escape", async () => {
    await showOverlay();
    const click = async () =>
      act(async () => {
        fireEvent.click(screen.getAllByText("Welt")[0]);
      });
    await click();
    expect(
      screen.getByTestId("word-card").closest(".aspect-video"),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Close word card"));
    });
    expect(screen.queryByTestId("word-card")).toBeNull();
    await click();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(useStore.getState().selectedWord).toBeNull();
    expect(screen.queryByTestId("word-card")).toBeNull();
  });

  it("E toggles the English switch but not while typing", () => {
    const sw = screen.getByRole("switch") as HTMLInputElement;
    fireEvent.keyDown(window, { key: "e" });
    expect(sw.checked).toBe(true);
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "e" });
    expect(sw.checked).toBe(true);
    field.remove();
  });
});

describe("timeline", () => {
  it("draws a tick for a line with new words", async () => {
    await showOverlay();
    expect(screen.getAllByTestId("tick")).toHaveLength(1);
  });

  it("is hidden from screen readers because it is display only", async () => {
    await showOverlay();
    expect(screen.getByTestId("timeline").getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
