// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useStore from "@/store/useStore";
import AppNav from "@/components/AppNav";

const { connected } = vi.hoisted(() => ({ connected: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/progress" }));
vi.mock("@/lib/api", () => ({ fetchAnkiConnected: connected }));

afterEach(() => {
  cleanup();
  connected.mockReset();
});

describe("AppNav", () => {
  it("links only to existing pages and marks the current one", async () => {
    connected.mockResolvedValue(true);
    render(<AppNav />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/library", "/library", "/progress", "/settings"]);
    expect(screen.getByText("Progress").getAttribute("aria-current")).toBe(
      "page",
    );
    await screen.findByText("Anki connected");
  });

  it("shows Anki offline when AnkiConnect is unreachable", async () => {
    connected.mockResolvedValue(false);
    render(<AppNav />);
    await screen.findByText("Anki offline");
  });
});

describe("AppNav theme switcher", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    useStore.setState({ theme: "midnight" });
    connected.mockResolvedValue(true);
  });

  it("sets <html data-theme>, saves it and a fresh mount reads it back", async () => {
    render(<AppNav />);
    fireEvent.click(screen.getByRole("radio", { name: "Linen" }));
    expect(document.documentElement.dataset.theme).toBe("linen");
    expect(JSON.parse(localStorage.getItem("readerDisplay")!).theme).toBe(
      "linen",
    );

    cleanup();
    useStore.setState({ theme: "midnight" });
    delete document.documentElement.dataset.theme;
    render(<AppNav />);
    expect(
      screen.getByRole("radio", { name: "Linen" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("linen");
    await screen.findByText("Anki connected");
  });

  it("moves and selects with the arrow keys and keeps one tab stop", async () => {
    render(<AppNav />);
    const midnight = screen.getByRole("radio", { name: "Midnight" });
    fireEvent.keyDown(midnight, { key: "ArrowRight" });
    expect(document.documentElement.dataset.theme).toBe("grove");
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Grove" }),
    );
    expect(
      screen.getAllByRole("radio").map((r) => r.getAttribute("tabindex")),
    ).toEqual(["-1", "0", "-1"]);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Grove" }), {
      key: "ArrowLeft",
    });
    fireEvent.keyDown(screen.getByRole("radio", { name: "Midnight" }), {
      key: "ArrowLeft",
    });
    expect(document.documentElement.dataset.theme).toBe("linen");
    await screen.findByText("Anki connected");
  });
});
