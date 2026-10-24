"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAnkiOverview, fetchAnkiFields, importAnkiKnown } from "@/lib/api";
import useStore from "@/store/useStore";

const USER_ID = 1;
const select = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";

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
  const [result, setResult] = useState<{ imported: number; already_known: number; skipped: number } | null>(null);

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
      .catch(() => setError("Anki is not connected. Open Anki (with AnkiConnect) and reload."));
  }, []);

  useEffect(() => {
    if (!model) return;
    fetchAnkiFields(model)
      .then((f) => {
        setFields(f);
        setField((cur) => (f.includes(cur) ? cur : f[0] ?? "")); // default guess: the first field
      })
      .catch((e: Error) => setError(e.message));
  }, [model]);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await importAnkiKnown(USER_ID, { decks: chosen, model, field }));
      await loadUserWords(USER_ID);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (d: string) => setChosen((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]));

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white/85" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header className="border-b border-white/[0.06] px-6 py-4">
        <Link href="/library" className="text-sm text-white/40 hover:text-white/80">← Library</Link>
      </header>
      <main className="mx-auto max-w-xl px-6 py-12 flex flex-col gap-6">
        <h1 className="text-4xl text-white" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>Settings</h1>
        <p className="text-sm text-slate-400">
          Import the German words from your Anki decks as known, so the reader highlights them. Anki is only read, never changed.
        </p>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-slate-200">Decks</legend>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 p-2">
            {decks.map((d) => (
              <label key={d} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={chosen.includes(d)} onChange={() => toggle(d)} />
                {d}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-200">
          Note type
          <select className={select} value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-200">
          Field with the German word
          <select className={select} value={field} onChange={(e) => setField(e.target.value)} disabled={!fields.length}>
            {fields.map((f) => <option key={f}>{f}</option>)}
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
          <a className="text-blue-400 hover:underline" href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/anki/export.apkg?user_id=${USER_ID}`}>
            Export .apkg
          </a>{" "}
          and import it by hand. Importing it again updates the same cards.
        </p>

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {result && (
          <p className="text-sm text-slate-300">
            Imported {result.imported} new words. {result.already_known} were already in your list (left as they are), {result.skipped} cards had no single word.
          </p>
        )}
      </main>
    </div>
  );
}
