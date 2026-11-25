// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  fetchServicesStatus: vi.fn(),
  fetchAnkiConnected: vi.fn(async () => true),
  fetchAnkiPending: vi.fn(async () => 3),
  syncAnki: vi.fn(async () => ({ sent: 2, failed: 0, pending: 0 })),
}));

import { fetchServicesStatus, syncAnki } from "@/lib/api";
import useStore from "@/store/useStore";
import DeckCards from "./DeckCards";
import ReadingSection from "./ReadingSection";
import ServicesList from "./ServicesList";
import TranslatorOrder from "./TranslatorOrder";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const up = { ok: true, detail: "Running at localhost:5000" };

describe("ServicesList", () => {
  it("turns the LibreTranslate row red with the message when it is down", async () => {
    vi.mocked(fetchServicesStatus).mockResolvedValue({
      pons: up,
      libretranslate: {
        ok: false,
        detail: "Not reachable at localhost:5000. Start it with docker compose",
      },
      ollama: up,
      piper: up,
    });
    render(<ServicesList />);
    const row = await screen.findByTestId("service-libretranslate");
    await waitFor(() => expect(row.dataset.state).toBe("down"));
    expect(row.textContent).toContain("Not reachable at localhost:5000");
    expect(screen.getByTestId("service-pons").dataset.state).toBe("up");
  });

  it("marks every service down when the backend cannot be reached", async () => {
    vi.mocked(fetchServicesStatus).mockRejectedValue(new Error("offline"));
    render(<ServicesList />);
    const row = await screen.findByTestId("service-piper");
    await waitFor(() => expect(row.dataset.state).toBe("down"));
    expect(row.textContent).toContain("backend is not reachable");
  });

  it("confirms a recheck even when nothing changed", async () => {
    vi.mocked(fetchServicesStatus).mockResolvedValue({
      pons: up,
      libretranslate: up,
      ollama: up,
      piper: up,
    });
    render(<ServicesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Test" }));
    expect(await screen.findByText("Checked just now")).toBeTruthy();
  });

  it("syncs Anki from its row and says how many cards went", async () => {
    vi.mocked(fetchServicesStatus).mockResolvedValue({
      pons: up,
      libretranslate: up,
      ollama: up,
      piper: up,
    });
    render(<ServicesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText("Sent 2 cards")).toBeTruthy();
    expect(syncAnki).toHaveBeenCalled();
  });

  it("says how many cards are still waiting after a sync", async () => {
    vi.mocked(fetchServicesStatus).mockResolvedValue({
      pons: up,
      libretranslate: up,
      ollama: up,
      piper: up,
    });
    vi.mocked(syncAnki).mockResolvedValueOnce({
      sent: 1,
      failed: 0,
      pending: 4,
    });
    render(<ServicesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(
      await screen.findByText("Sent 1 cards, 4 still waiting"),
    ).toBeTruthy();
  });
});

describe("TranslatorOrder", () => {
  it("moves an item with its buttons", () => {
    const onChange = vi.fn();
    render(
      <TranslatorOrder
        order={["pons", "libretranslate"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move LibreTranslate up" }),
    );
    expect(onChange).toHaveBeenCalledWith(["libretranslate", "pons"]);
  });

  it("keeps focus on the pressed button after it reaches the top", () => {
    const { rerender } = render(
      <TranslatorOrder order={["pons", "libretranslate"]} onChange={vi.fn()} />,
    );
    const upButton = screen.getByRole("button", {
      name: "Move LibreTranslate up",
    });
    upButton.focus();
    fireEvent.click(upButton);
    rerender(
      <TranslatorOrder order={["libretranslate", "pons"]} onChange={vi.fn()} />,
    );
    expect(upButton.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(upButton);
  });

  it("moves an item with Alt+Arrow and ignores the plain arrow", () => {
    const onChange = vi.fn();
    render(
      <TranslatorOrder
        order={["pons", "libretranslate"]}
        onChange={onChange}
      />,
    );
    const first = screen.getAllByRole("listitem")[0];
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    expect(onChange).toHaveBeenCalledWith(["libretranslate", "pons"]);
  });
});

describe("DeckCards", () => {
  it("ticks a deck through its checkbox", () => {
    const onToggle = vi.fn();
    render(
      <DeckCards
        decks={["deutsch", "German"]}
        chosen={["German"]}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByLabelText("German")).toHaveProperty("checked", true);
    fireEvent.click(screen.getByLabelText("deutsch"));
    expect(onToggle).toHaveBeenCalledWith("deutsch");
  });
});

describe("ReadingSection", () => {
  it("writes the theme to the reader's saved display settings", () => {
    render(<ReadingSection />);
    fireEvent.click(screen.getByLabelText("Linen"));
    expect(useStore.getState().theme).toBe("linen");
    expect(JSON.parse(localStorage.getItem("readerDisplay")!).theme).toBe(
      "linen",
    );
    expect(document.documentElement.dataset.theme).toBe("linen");
    expect(screen.getByTestId("preview-linen").dataset.theme).toBe("linen");
  });
});
