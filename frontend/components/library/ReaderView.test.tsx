// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReaderView from "@/components/library/ReaderView";

// The reader's panels are not under test here; stub them to keep the test about the header.
vi.mock("@/components/ReaderFooter", () => ({ default: () => null }));
vi.mock("@/components/SidePanel", () => ({ default: () => null }));
vi.mock("@/components/TextDisplay", () => ({ default: () => null }));
vi.mock("@/components/VideoReader", () => ({ default: () => null }));

afterEach(cleanup);

function renderWith(captionSource: "creator" | "auto" | null) {
  render(
    <ReaderView
      title="t"
      loading={false}
      hasText
      video={null}
      captionSource={captionSource}
      onBack={() => {}}
    />,
  );
}

describe("ReaderView caption badge", () => {
  it("warns for auto captions", () => {
    renderWith("auto");
    expect(screen.getByText("Auto captions · may contain errors")).toBeTruthy();
  });

  it("labels creator captions", () => {
    renderWith("creator");
    expect(screen.getByText("Creator captions")).toBeTruthy();
  });

  it("shows nothing when the source is unknown", () => {
    renderWith(null);
    expect(screen.queryByText(/captions/i)).toBeNull();
  });
});
