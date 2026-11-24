"use client";
import { useEffect, useState } from "react";
import {
  fetchLlmModels,
  fetchRunningModels,
  unloadLlmModel,
  unloadsIn,
  saveLlmModel,
  type LlmModels,
  type RunningModel,
} from "@/lib/api";

/** Shared look for the settings page's select boxes. */
export const select =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;

/** Model picker for the AI answers, with the loaded / unload state of the chosen model. */
export default function AiModel() {
  const [llm, setLlm] = useState<LlmModels | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [running, setRunning] = useState<RunningModel[]>([]);

  useEffect(() => {
    const load = () =>
      Promise.all([fetchLlmModels(), fetchRunningModels()])
        .then(([m, r]) => {
          setLlm(m);
          setRunning(r);
          setLlmError(null);
        })
        .catch((e: Error) => {
          setLlm(null);
          setLlmError(e.message);
        });
    load();
    window.addEventListener("focus", load); // a model pulled in another window shows up on return
    return () => window.removeEventListener("focus", load);
  }, []);

  async function chooseModel(name: string) {
    try {
      await saveLlmModel(name || null);
      setLlm((cur) => cur && { ...cur, selected: name || null });
      setLlmError(null);
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Could not save the model");
    }
  }

  const active = llm?.selected ?? llm?.default ?? null;
  // /api/ps names always carry a tag, the OLLAMA_MODEL default may not
  const tagged = active && !active.includes(":") ? `${active}:latest` : active;
  const loaded = running.find((r) => r.name === tagged);
  const missing =
    llm?.selected && !llm.models.some((m) => m.name === llm.selected);

  async function unload() {
    if (!active) return;
    try {
      await unloadLlmModel(active);
      setRunning(await fetchRunningModels());
      setLlmError(null);
    } catch (e) {
      setLlmError(
        e instanceof Error ? e.message : "Could not unload the model",
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-ink">
        AI model
        <select
          id="ai-model"
          className={select}
          value={missing ? "" : (llm?.selected ?? "")}
          onChange={(e) => chooseModel(e.target.value)}
          disabled={!llm}
        >
          <option value="">Default ({llm?.default ?? "none set"})</option>
          {llm?.models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({gb(m.size)})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          Used for AI answers in the reader. Every model in your Ollama is
          listed.
        </span>
      </label>
      {active && llm && (
        <p className="flex items-center gap-3 text-sm text-muted">
          {loaded
            ? `${active} is loaded, ${unloadsIn(loaded.expires_at)}`
            : `${active} is not loaded`}
          {loaded && (
            <button
              type="button"
              onClick={unload}
              className="rounded-md border border-line px-3 py-1 text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Unload
            </button>
          )}
        </p>
      )}
      {llmError && (
        <p role="alert" className="text-sm text-[var(--hard)]">
          {llmError}
          {!llm && ". Start Ollama and refocus this window."}
        </p>
      )}
      {missing && (
        <p className="text-sm text-amber">
          The saved model &quot;{llm?.selected}&quot; is no longer installed, so
          the default is used.
        </p>
      )}
    </div>
  );
}
