"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAnkiOverview,
  fetchAnkiFields,
  importAnkiKnown,
  fetchLlmModels,
  fetchRunningModels,
  unloadLlmModel,
  unloadsIn,
  type RunningModel,
  saveLlmModel,
  type LlmModels,
} from "@/lib/api";
import useStore from "@/store/useStore";

const USER_ID = 1;
const select =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";

export default function SettingsPage() {
  const loadUserWords = useStore((s) => s.loadUserWords);
  const [decks, setDecks] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [field, setField] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    already_known: number;
    skipped: number;
  } | null>(null);

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

  const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;
  const missing =
    llm?.selected && !llm.models.some((m) => m.name === llm.selected);

  useEffect(() => {
    fetchAnkiOverview()
      .then((o) => {
        setDecks(o.decks);
        setModels(o.models);
        if (o.mapping) {
          setChosen(o.mapping.decks);
          setModel(o.mapping.model);
          setField(o.mapping.field);
        }
      })
      .catch(() =>
        setError(
          "Anki is not connected. Open Anki (with AnkiConnect) and reload.",
        ),
      );
  }, []);

  useEffect(() => {
    if (!model) return;
    fetchAnkiFields(model)
      .then((f) => {
        setFields(f);
        setField((cur) => (f.includes(cur) ? cur : (f[0] ?? ""))); // default guess: the first field
      })
      .catch((e: Error) => setError(e.message));
  }, [model]);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await importAnkiKnown(USER_ID, { decks: chosen, model, field }),
      );
      await loadUserWords(USER_ID);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (d: string) =>
    setChosen((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]));

  return (
    <div
      className="min-h-screen bg-[#0d0d0f] text-white/85"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <header className="border-b border-white/[0.06] px-6 py-4">
        <Link
          href="/library"
          className="text-sm text-white/40 hover:text-white/80"
        >
          ← Library
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-6 py-12 flex flex-col gap-6">
        <h1
          className="text-4xl text-white"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Settings
        </h1>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-200">
          Model
          <select
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
          <span className="text-xs font-normal text-slate-400">
            Used for AI answers in the reader. Every model in your Ollama is
            listed.
          </span>
        </label>
        {active && llm && (
          <p className="flex items-center gap-3 text-sm text-slate-300">
            {loaded
              ? `${active} is loaded, ${unloadsIn(loaded.expires_at)}`
              : `${active} is not loaded`}
            {loaded && (
              <button
                type="button"
                onClick={unload}
                className="rounded-lg bg-slate-700 px-3 py-1 text-white hover:bg-slate-600"
              >
                Unload
              </button>
            )}
          </p>
        )}
        {llmError && (
          <p role="alert" className="text-sm text-red-400">
            {llmError}
            {!llm && ". Start Ollama and refocus this window."}
          </p>
        )}
        {missing && (
          <p className="text-sm text-amber-400">
            The saved model &quot;{llm?.selected}&quot; is no longer installed,
            so the default is used.
          </p>
        )}

        <p className="text-sm text-slate-400">
          Import the German words from your Anki decks as known, so the reader
          highlights them. Anki is only read, never changed.
        </p>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-slate-200">
            Decks
          </legend>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 p-2">
            {decks.map((d) => (
              <label key={d} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(d)}
                  onChange={() => toggle(d)}
                />
                {d}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-200">
          Note type
          <select
            className={select}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="" disabled>
              Choose…
            </option>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-200">
          Field with the German word
          <select
            className={select}
            value={field}
            onChange={(e) => setField(e.target.value)}
            disabled={!fields.length}
          >
            {fields.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>

        <button
          onClick={run}
          disabled={busy || !chosen.length || !model || !field}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "Importing…" : "Import as known"}
        </button>

        <p className="text-sm text-slate-400">
          No desktop Anki?{" "}
          <a
            className="text-blue-400 hover:underline"
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/anki/export.apkg?user_id=${USER_ID}`}
          >
            Export .apkg
          </a>{" "}
          and import it by hand. Importing it again updates the same cards.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {result && (
          <p className="text-sm text-slate-300">
            Imported {result.imported} new words. {result.already_known} were
            already in your list (left as they are), {result.skipped} cards had
            no single word.
          </p>
        )}
      </main>
    </div>
  );
}
