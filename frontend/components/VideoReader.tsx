"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import useStore from "@/store/useStore";
import CueText from "@/components/CueText";
import VideoTimeline from "@/components/VideoTimeline";
import VideoWordCard from "@/components/VideoWordCard";
import { fetchSentenceTranslation } from "@/lib/api";
import { useStatusHotkeys } from "@/lib/useStatusHotkeys";
import {
  clock,
  currentCue,
  scrollTopFor,
  userScrolledRecently,
  videoId,
  type Cue,
} from "@/lib/video";

// the bits of the YouTube IFrame Player API used here
interface YTPlayer {
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  pauseVideo(): void;
  setPlaybackRate(r: number): void;
  playVideo(): void;
  destroy(): void;
}
type YTWindow = Window & {
  YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer };
  onYouTubeIframeAPIReady?: () => void;
};

let apiReady: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve();
  apiReady ??= new Promise((resolve) => {
    w.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiReady;
}

const SPEEDS = [1, 0.75, 0.5];

export default function VideoReader({
  url,
  cues,
}: {
  url: string;
  cues: Cue[];
}) {
  const highlightMode = useStore((s) => s.highlightMode);
  const sidePanelOpen = useStore((s) => s.sidePanelOpen);
  const setOpenPanelOnSelect = useStore((s) => s.setOpenPanelOnSelect);
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const transcript = useRef<HTMLDivElement>(null);
  // time of the last wheel/touch on the transcript, so playback does not pull it back mid-read
  const lastUserScroll = useRef(0);
  const [current, setCurrent] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [showEnglish, setShowEnglish] = useState(false);
  const [english, setEnglish] = useState<Record<number, string>>({});
  const id = videoId(url);

  useStatusHotkeys();

  // a word opens the compact card here, not the side panel; "Details" opens the panel
  useEffect(() => {
    setOpenPanelOnSelect(false);
    return () => setOpenPanelOnSelect(true);
  }, [setOpenPanelOnSelect]);

  // E toggles the English line, unless the user is typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e" || e.ctrlKey || e.metaKey || e.altKey)
        return;
      const t = e.target as HTMLElement | null;
      if (
        t?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "")
      )
        return;
      setShowEnglish((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!id) return;
    let dead = false;
    let timer: ReturnType<typeof setInterval>;
    loadYouTubeApi().then(() => {
      if (dead || !box.current) return;
      const el = document.createElement("div");
      box.current.replaceChildren(el);
      player.current = new (window as YTWindow).YT!.Player(el, {
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, cc_load_policy: 0 },
      });
      timer = setInterval(() => {
        const t = player.current?.getCurrentTime?.();
        if (typeof t === "number") setCurrent(currentCue(cues, t));
      }, 250);
    });
    return () => {
      dead = true;
      clearInterval(timer);
      player.current?.destroy?.();
      player.current = null;
    };
  }, [id, cues]);

  // keep the current line in view inside the transcript only (scrollIntoView would also scroll the page)
  useEffect(() => {
    const box = transcript.current;
    const line = lineRefs.current[current];
    if (!box || !line) return;
    if (userScrolledRecently(lastUserScroll.current, Date.now())) return;
    const top = scrollTopFor(
      line.offsetTop,
      line.offsetHeight,
      box.scrollTop,
      box.clientHeight,
    );
    if (top === null) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
  }, [current]);

  // translate the current line once it is reached; fetchSentenceTranslation is cached server-side
  useEffect(() => {
    if (!showEnglish || current < 0 || english[current] !== undefined) return;
    const at = current;
    fetchSentenceTranslation(cues[at].text)
      .then((t) => setEnglish((m) => ({ ...m, [at]: t })))
      .catch(() =>
        setEnglish((m) => ({ ...m, [at]: "(translation unavailable)" })),
      );
  }, [showEnglish, current, cues, english]);

  const jump = useCallback(
    (i: number) => {
      const c = cues[Math.max(0, Math.min(cues.length - 1, i))];
      lastUserScroll.current = 0; // an explicit jump should always show its line
      player.current?.seekTo(c.start, true);
      player.current?.playVideo();
      setCurrent(currentCue(cues, c.start));
    },
    [cues],
  );

  const pauseOnWord = () => player.current?.pauseVideo?.();

  const pickSpeed = (r: number) => {
    setSpeed(r);
    player.current?.setPlaybackRate(r);
  };

  // side by side from lg when the panel is closed, from xl when it is open (the player needs room for the overlay and card)
  const layout = sidePanelOpen
    ? {
        root: "xl:flex-row",
        player: "xl:flex-1 xl:min-w-[240px] xl:shrink",
        transcript:
          "xl:flex-none xl:w-[480px] xl:min-w-[340px] xl:shrink xl:min-h-0",
      }
    : {
        root: "lg:flex-row",
        player: "lg:flex-1 lg:min-w-[240px] lg:shrink",
        transcript:
          "lg:flex-none lg:w-[480px] lg:min-w-[340px] lg:shrink lg:min-h-0",
      };

  const btn =
    "px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset";
  const on = "bg-accent-soft text-accent";
  const off = "text-muted hover:text-ink hover:bg-surface-2";

  if (!id)
    return (
      <div className="text-muted text-sm">
        Cannot find the video for this entry.
      </div>
    );

  return (
    <div className={`flex flex-col ${layout.root} gap-6 h-full`}>
      {/* Player: takes what is left; min width keeps it usable when the word panel is open */}
      <div className={`shrink-0 ${layout.player}`}>
        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black">
          <div ref={box} className="absolute inset-0 [&>iframe]:size-full" />
          {/* the wrapper lets clicks through to the player's own controls; only the words take them */}
          {current >= 0 && (
            // subtitles sit on black video, so they keep the dark status colours in every theme
            <div
              data-theme="dark"
              className="pointer-events-none absolute inset-x-0 bottom-12 flex flex-col items-center gap-1 px-4 text-center"
            >
              <CueText
                index={current}
                text={cues[current].text}
                highlightMode={highlightMode}
                onWordClick={pauseOnWord}
                className="pointer-events-auto rounded-lg bg-black/70 px-3 py-1 text-lg leading-snug text-white sm:text-2xl"
              />
              {showEnglish && english[current] && (
                <p className="rounded bg-black/70 px-2 py-0.5 text-sm text-white/80">
                  {english[current]}
                </p>
              )}
            </div>
          )}
        </div>
        <VideoTimeline player={player} cues={cues} />
        <div className="flex flex-wrap items-center gap-3 mt-4 px-4 py-2.5 bg-surface border border-line rounded-xl">
          <div className="flex rounded-lg overflow-hidden border border-line">
            <button
              onClick={() => jump(current - 1)}
              className={`${btn} ${off}`}
            >
              Previous
            </button>
            <button
              onClick={() => jump(current + 1)}
              className={`${btn} ${off} border-l border-line`}
            >
              Next
            </button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-line">
            {SPEEDS.map((r, i) => (
              <button
                key={r}
                onClick={() => pickSpeed(r)}
                className={`${btn} ${i ? "border-l border-line" : ""} ${speed === r ? on : off}`}
              >
                {r}x
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-[12px] text-muted cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              checked={showEnglish}
              onChange={(e) => setShowEnglish(e.target.checked)}
              className="accent-blue-500"
            />
            Show English{" "}
            <kbd className="ml-1 rounded border border-line px-1 text-[10px]">
              E
            </kbd>
          </label>
        </div>
        <VideoWordCard />
      </div>

      {/* Transcript: ~480px, shrinks to 340px before the player gives way; min-h keeps it readable when stacked */}
      <div
        ref={transcript}
        onWheel={() => (lastUserScroll.current = Date.now())}
        onTouchMove={() => (lastUserScroll.current = Date.now())}
        className={`relative flex-1 ${layout.transcript} min-h-64 overflow-y-auto bg-surface border border-line rounded-2xl p-3`}
      >
        {cues.map((cue, ci) => {
          return (
            <div
              key={ci}
              ref={(el) => {
                lineRefs.current[ci] = el;
              }}
              className={`flex gap-3 rounded-lg px-3 py-2 leading-7 ${ci === current ? "bg-accent-soft border-l-2 border-accent" : "border-l-2 border-transparent"} ${ci < current ? "opacity-60" : ""}`}
            >
              <button
                onClick={() => jump(ci)}
                className="shrink-0 w-10 text-left text-[11px] tabular-nums text-faint hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                title="Jump to this line"
              >
                {clock(cue.start)}
              </button>
              <div className="min-w-0 flex-1 text-ink">
                <CueText
                  index={ci}
                  text={cue.text}
                  highlightMode={highlightMode}
                  onWordClick={pauseOnWord}
                />
                {showEnglish && english[ci] && (
                  <p className="text-[13px] text-muted">{english[ci]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
