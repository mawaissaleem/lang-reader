// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://localhost:8000",
  USER_ID: 1,
  fetchAnkiOverview: vi.fn(),
  fetchAnkiConnected: vi.fn(async () => true),
  fetchAnkiFields: vi.fn(),
  importAnkiKnown: vi.fn(),
  fetchUserWords: vi.fn(async () => []),
  fetchLlmModels: vi.fn(),
  saveLlmModel: vi.fn(async () => {}),
  fetchRunningModels: vi.fn(),
  unloadLlmModel: vi.fn(async () => {}),
  unloadsIn: () => "unloads in 3 min",
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import {
  fetchLlmModels,
  fetchRunningModels,
  unloadLlmModel,
  saveLlmModel,
  fetchAnkiFields,
  fetchAnkiOverview,
  importAnkiKnown,
} from "@/lib/api";
import SettingsPage from "./page";

beforeEach(() => {
  vi.mocked(fetchAnkiOverview).mockResolvedValue({
    decks: ["Goethe", "Default"],
    models: ["Vocab"],
    mapping: null,
  });
  vi.mocked(fetchAnkiFields).mockResolvedValue(["Note ID", "de_word"]);
  vi.mocked(importAnkiKnown).mockReset();
  vi.mocked(fetchRunningModels).mockResolvedValue([]);
  vi.mocked(fetchLlmModels).mockResolvedValue({
    models: [{ name: "big:70b", size: 40e9 }],
    selected: null,
    default: "qwen2.5:3b",
  });
});
afterEach(cleanup);

describe("SettingsPage", () => {
  it("defaults to the first field and imports the chosen mapping", async () => {
    vi.mocked(importAnkiKnown).mockResolvedValue({
      imported: 3,
      already_known: 1,
      skipped: 2,
    });
    render(<SettingsPage />);
    fireEvent.click(await screen.findByLabelText("Goethe"));
    fireEvent.change(screen.getByLabelText("Note type"), {
      target: { value: "Vocab" },
    });
    await waitFor(() =>
      expect(
        (
          screen.getByLabelText(
            "Field with the German word",
          ) as HTMLSelectElement
        ).value,
      ).toBe("Note ID"),
    );
    fireEvent.change(screen.getByLabelText("Field with the German word"), {
      target: { value: "de_word" },
    });
    fireEvent.click(screen.getByText("Import as known"));
    await screen.findByText(/Imported 3 new words/);
    expect(importAnkiKnown).toHaveBeenCalledWith(1, {
      decks: ["Goethe"],
      model: "Vocab",
      field: "de_word",
    });
  });

  it("shows an error when Anki is not connected", async () => {
    vi.mocked(fetchAnkiOverview).mockRejectedValue(new Error("x"));
    render(<SettingsPage />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("not connected"),
    );
  });

  it("lists every model with its size and saves the choice", async () => {
    render(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText(/^Model/), {
      target: { value: "big:70b" },
    });
    expect(screen.getByText("big:70b (40.0 GB)")).toBeTruthy();
    expect(screen.getByText("Default (qwen2.5:3b)")).toBeTruthy();
    await waitFor(() => expect(saveLlmModel).toHaveBeenCalledWith("big:70b"));
  });

  it("says when Ollama is not running", async () => {
    vi.mocked(fetchLlmModels).mockRejectedValue(
      new Error("Ollama is not reachable"),
    );
    render(<SettingsPage />);
    expect(await screen.findByText(/Ollama is not reachable/)).toBeTruthy();
  });

  it("says when the saved model was removed", async () => {
    vi.mocked(fetchLlmModels).mockResolvedValue({
      models: [],
      selected: "old:7b",
      default: "qwen2.5:3b",
    });
    render(<SettingsPage />);
    expect(await screen.findByText(/no longer installed/)).toBeTruthy();
  });

  it("shows the loaded model and unloads it", async () => {
    vi.mocked(fetchRunningModels).mockResolvedValueOnce([
      { name: "qwen2.5:3b", expires_at: "x" },
    ]);
    render(<SettingsPage />);
    expect(
      await screen.findByText(/qwen2.5:3b is loaded, unloads in 3 min/),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Unload"));
    await waitFor(() =>
      expect(unloadLlmModel).toHaveBeenCalledWith("qwen2.5:3b"),
    );
    expect(await screen.findByText("qwen2.5:3b is not loaded")).toBeTruthy();
  });

  it("matches an untagged default against the :latest name Ollama reports", async () => {
    vi.mocked(fetchLlmModels).mockResolvedValue({
      models: [],
      selected: null,
      default: "llama3.2",
    });
    vi.mocked(fetchRunningModels).mockResolvedValueOnce([
      { name: "llama3.2:latest", expires_at: "x" },
    ]);
    render(<SettingsPage />);
    expect(await screen.findByText(/llama3.2 is loaded/)).toBeTruthy();
  });

  it("does not blame Ollama for an unload error while it is running", async () => {
    vi.mocked(fetchRunningModels).mockResolvedValueOnce([
      { name: "qwen2.5:3b", expires_at: "x" },
    ]);
    vi.mocked(unloadLlmModel).mockRejectedValueOnce(
      new Error("Model 'qwen2.5:3b' is not installed"),
    );
    render(<SettingsPage />);
    fireEvent.click(await screen.findByText("Unload"));
    expect(await screen.findByText(/is not installed/)).toBeTruthy();
    expect(screen.queryByText(/Start Ollama/)).toBeNull();
  });
});
