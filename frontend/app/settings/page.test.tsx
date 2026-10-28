// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ fetchAnkiOverview: vi.fn(), fetchAnkiFields: vi.fn(), importAnkiKnown: vi.fn(), fetchUserWords: vi.fn(async () => []), fetchLlmModels: vi.fn(), saveLlmModel: vi.fn(async () => {}) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { fetchLlmModels, saveLlmModel, fetchAnkiFields, fetchAnkiOverview, importAnkiKnown } from "@/lib/api";
import SettingsPage from "./page";

beforeEach(() => {
  vi.mocked(fetchAnkiOverview).mockResolvedValue({ decks: ["Goethe", "Default"], models: ["Vocab"], mapping: null });
  vi.mocked(fetchAnkiFields).mockResolvedValue(["Note ID", "de_word"]);
  vi.mocked(importAnkiKnown).mockReset();
  vi.mocked(fetchLlmModels).mockResolvedValue({ models: [{ name: "big:70b", size: 40e9 }], selected: null, default: "qwen2.5:3b" });
});
afterEach(cleanup);

describe("SettingsPage", () => {
  it("defaults to the first field and imports the chosen mapping", async () => {
    vi.mocked(importAnkiKnown).mockResolvedValue({ imported: 3, already_known: 1, skipped: 2 });
    render(<SettingsPage />);
    fireEvent.click(await screen.findByLabelText("Goethe"));
    fireEvent.change(screen.getByLabelText("Note type"), { target: { value: "Vocab" } });
    await waitFor(() => expect((screen.getByLabelText("Field with the German word") as HTMLSelectElement).value).toBe("Note ID"));
    fireEvent.change(screen.getByLabelText("Field with the German word"), { target: { value: "de_word" } });
    fireEvent.click(screen.getByText("Import as known"));
    await screen.findByText(/Imported 3 new words/);
    expect(importAnkiKnown).toHaveBeenCalledWith(1, { decks: ["Goethe"], model: "Vocab", field: "de_word" });
  });

  it("shows an error when Anki is not connected", async () => {
    vi.mocked(fetchAnkiOverview).mockRejectedValue(new Error("x"));
    render(<SettingsPage />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("not connected"));
  });

  it("lists every model with its size and saves the choice", async () => {
    render(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText(/^Model/), { target: { value: "big:70b" } });
    expect(screen.getByText("big:70b (40.0 GB)")).toBeTruthy();
    expect(screen.getByText("Default (qwen2.5:3b)")).toBeTruthy();
    await waitFor(() => expect(saveLlmModel).toHaveBeenCalledWith("big:70b"));
  });

  it("says when Ollama is not running", async () => {
    vi.mocked(fetchLlmModels).mockRejectedValue(new Error("Ollama is not reachable"));
    render(<SettingsPage />);
    expect(await screen.findByText(/Ollama is not reachable/)).toBeTruthy();
  });

  it("says when the saved model was removed", async () => {
    vi.mocked(fetchLlmModels).mockResolvedValue({ models: [], selected: "old:7b", default: "qwen2.5:3b" });
    render(<SettingsPage />);
    expect(await screen.findByText(/no longer installed/)).toBeTruthy();
  });
});
