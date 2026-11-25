"use client";
import { useEffect, useState, type ReactNode } from "react";
import AppNav from "@/components/AppNav";
import AiModel, { select } from "@/components/settings/AiModel";
import DeckCards from "@/components/settings/DeckCards";
import AnkiDeckNames from "@/components/settings/AnkiDeckNames";
import ReadingSection from "@/components/settings/ReadingSection";
import ServicesList from "@/components/settings/ServicesList";
import TranslatorOrder from "@/components/settings/TranslatorOrder";
import {
  fetchAnkiOverview,
  fetchAnkiFields,
  importAnkiKnown,
  API_BASE_URL,
} from "@/lib/api";
import useStore from "@/store/useStore";

const SECTIONS = [
  { id: "reading", title: "Reading" },
  { id: "services", title: "Services" },
  { id: "translations", title: "Translations" },
  { id: "anki", title: "Anki" },
  { id: "keyboard", title: "Keyboard" },
];

// the reader's hotkeys, as the reader defines them
const HOTKEYS = [
  ["1 / 2 / 3", "Mark the selected word as learning 1, 2 or 3"],
  ["K", "Mark the selected word as known"],
  ["I", "Ignore the selected word"],
  ["H", "Turn highlights on or off"],
  ["F", "Turn focus mode on or off"],
  ["E", "Show or hide the English line (videos)"],
  ["Left / Right arrow", "Previous or next page of a long text"],
  ["Shift + click", "Extend the selection to a phrase or a separable verb"],
];

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-2xl border border-line bg-surface p-6"
    >
      <h2 id={`${id}-title`} className="font-serif text-2xl text-ink">
        {title}
      </h2>
      <p className="mb-5 mt-1 text-sm text-muted">{intro}</p>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const loadUserWords = useStore((s) => s.loadUserWords);
  const order = useStore((s) => s.translatorOrder);
  const setOrder = useStore((s) => s.setTranslatorOrder);
  const loadSettings = useStore((s) => s.loadSettings);
  const translators = useStore((s) => s.translators);
  const loadTranslators = useStore((s) => s.loadTranslators);
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

  useEffect(() => {
    loadSettings();
    loadTranslators();
  }, [loadSettings, loadTranslators]);

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
        // default guess: the first field
        setField((cur) => (f.includes(cur) ? cur : (f[0] ?? "")));
      })
      .catch((e: Error) => setError(e.message));
  }, [model]);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await importAnkiKnown({ decks: chosen, model, field }));
      await loadUserWords();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (d: string) =>
    setChosen((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]));

  return (
    <div className="min-h-screen text-ink">
      <AppNav />
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 md:flex-row">
        <aside className="md:w-48 md:flex-none">
          <h1 className="mb-6 font-serif text-4xl text-ink">Settings</h1>
          <nav
            aria-label="Settings sections"
            className="flex flex-wrap gap-1 md:sticky md:top-6 md:flex-col"
          >
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {s.title}
              </a>
            ))}
          </nav>
          <p className="mt-4 px-3 text-xs text-faint">Changes save instantly</p>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <Section
            id="reading"
            title="Reading"
            intro="How text looks while you read. The previews update as you change things."
          >
            <ReadingSection />
          </Section>

          <Section
            id="services"
            title="Services"
            intro="Everything the app talks to, in one place. Each row: status, what it means, one action."
          >
            <ServicesList />
          </Section>

          <Section
            id="translations"
            title="Translations"
            intro="The first translator opens when you click a word. The other is the fallback."
          >
            <TranslatorOrder
              order={order}
              translators={translators}
              onChange={setOrder}
            />
            <AiModel />
          </Section>

          <Section
            id="anki"
            title="Anki"
            intro="Mark the words you already know in Anki as known here. Anki is only read, never changed."
          >
            <AnkiDeckNames />
            <p className="text-sm text-ink">Decks to import</p>
            <DeckCards decks={decks} chosen={chosen} onToggle={toggle} />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-ink">
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
              <label className="flex flex-col gap-1 text-sm text-ink">
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
            </div>

            <button
              onClick={run}
              disabled={busy || !chosen.length || !model || !field}
              className="self-start rounded-lg bg-[image:var(--grad)] px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
            >
              {busy
                ? "Importing…"
                : `Import ${chosen.length} deck${chosen.length === 1 ? "" : "s"} as known`}
            </button>

            <p className="text-sm text-muted">
              No desktop Anki?{" "}
              <a
                className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                href={`${API_BASE_URL}/anki/export.apkg`}
              >
                Export .apkg
              </a>{" "}
              and import it by hand. Importing it again updates the same cards.
            </p>

            {error && (
              <p role="alert" className="text-sm text-[var(--hard)]">
                {error}
              </p>
            )}
            {result && (
              <p className="text-sm text-muted">
                Imported {result.imported} new words. {result.already_known}{" "}
                were already in your list (left as they are), {result.skipped}{" "}
                cards had no single word.
              </p>
            )}
          </Section>

          <Section
            id="keyboard"
            title="Keyboard"
            intro="Shortcuts in the reader. Single keys are ignored while you type in a field."
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {HOTKEYS.map(([keys, what]) => (
                <div key={keys} className="contents">
                  <dt>
                    <kbd className="rounded border border-line px-1.5 py-0.5 text-[12px] text-ink">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="text-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </main>
      </div>
    </div>
  );
}
