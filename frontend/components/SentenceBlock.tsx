import PlayButton from "@/components/PlayButton";
import SentenceAnkiButton from "@/components/SentenceAnkiButton";

type Props = {
  sentence: string;
  translation: string | null;
  loading: boolean;
  error: boolean;
  word: string;
  source: string;
  bold: string[];
};

/** The clicked sentence with its English translation and the add-to-Anki button. */
export default function SentenceBlock({
  sentence,
  translation,
  loading,
  error,
  word,
  source,
  bold,
}: Props) {
  return (
    <div
      data-testid="sentence-box"
      className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4"
    >
      <p className="text-[13px] text-white/80 leading-relaxed m-0 mb-2">
        <PlayButton key={sentence} text={sentence} label="Play sentence" />{" "}
        {sentence}
      </p>
      {loading ? (
        <p className="text-[12px] text-white/35 m-0">Translating…</p>
      ) : error ? (
        <p className="text-[12px] text-white/35 m-0">
          Couldn&apos;t translate the sentence
        </p>
      ) : (
        <p className="text-[13px] text-blue-300/80 leading-relaxed m-0">
          {translation}
        </p>
      )}
      {/* shortcut: the button appears once the translation has arrived, rather than fetching it on click */}
      {translation && (
        <div className="mt-3">
          <SentenceAnkiButton
            de={sentence}
            en={translation}
            word={word}
            source={source}
            bold={bold}
          />
        </div>
      )}
    </div>
  );
}
