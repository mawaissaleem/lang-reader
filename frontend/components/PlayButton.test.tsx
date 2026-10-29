// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayButton from "@/components/PlayButton";

class FakeAudio {
  static all: FakeAudio[] = [];
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn(() => this.onpause?.());
  play = vi.fn(async () => {});
  constructor(public src: string) { FakeAudio.all.push(this); }
}

beforeEach(() => { FakeAudio.all = []; vi.stubGlobal("Audio", FakeAudio); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PlayButton", () => {
  it("requests the encoded text, then goes loading -> playing", () => {
    render(<PlayButton text="die Ansage ä" label="Play pronunciation" />);
    fireEvent.click(screen.getByLabelText("Play pronunciation"));
    expect(FakeAudio.all[0].src).toBe(`http://localhost:8000/tts?text=${encodeURIComponent("die Ansage ä")}`);
    expect(FakeAudio.all[0].play).toHaveBeenCalled();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
    act(() => FakeAudio.all[0].onplaying?.());
    expect(document.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(screen.getByLabelText("Play pronunciation")); // stops
    expect(FakeAudio.all[0].pause).toHaveBeenCalled();
  });

  it("shows a message when the audio fails", () => {
    render(<PlayButton text="Hallo" label="Play sentence" />);
    fireEvent.click(screen.getByLabelText("Play sentence"));
    act(() => FakeAudio.all[0].onerror?.());
    expect(screen.getByRole("alert").textContent).toBe("Audio not available");
  });

  it("unmounting (switching word) stops the clip", () => {
    const { unmount } = render(<PlayButton text="Hallo" label="Play sentence" />);
    fireEvent.click(screen.getByLabelText("Play sentence"));
    unmount();
    expect(FakeAudio.all[0].pause).toHaveBeenCalled();
  });

  it("starting a second clip stops the first", () => {
    render(<><PlayButton text="a" label="one" /><PlayButton text="b" label="two" /></>);
    fireEvent.click(screen.getByLabelText("one"));
    fireEvent.click(screen.getByLabelText("two"));
    expect(FakeAudio.all[0].pause).toHaveBeenCalled();
  });
});
