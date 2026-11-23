// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
