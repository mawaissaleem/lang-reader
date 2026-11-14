"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import useStore from "@/store/useStore";
import WordToken from "@/components/WordToken";
import { fetchSentenceTranslation } from "@/lib/api";
import { sentenceAt } from "@/lib/words";
import { statusForKey } from "@/lib/status";
import { clock, currentCue, videoId, type Cue } from "@/lib/video";

// the bits of the YouTube IFrame Player API used here
interface YTPlayer {
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
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

export default function VideoReader({ url, cues }: { url: string; cues: Cue[] }) {
  const highlightMode = useStore((s) => s.highlightMode);
  const setWordStatus = useStore((s) => s.setWordStatus);
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [current, setCurrent] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [showEnglish, setShowEnglish] = useState(false);
  const [english, setEnglish] = useState<Record<number, string>>({});
  const id = videoId(url);

  // same status hotkeys as TextDisplay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const status = statusForKey(e);
      if (status) setWordStatus(status);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWordStatus]);

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

  useEffect(() => {
    lineRefs.current[current]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);

  // translate the current line once it is reached; fetchSentenceTranslation is cached server-side
  useEffect(() => {
    if (!showEnglish || current < 0 || english[current] !== undefined) return;
    const at = current;
    fetchSentenceTranslation(cues[at].text)
      .then((t) => setEnglish((m) => ({ ...m, [at]: t })))
      .catch(() => setEnglish((m) => ({ ...m, [at]: "(translation unavailable)" })));
  }, [showEnglish, current, cues, english]);

  const jump = useCallback((i: number) => {
    const c = cues[Math.max(0, Math.min(cues.length - 1, i))];
    player.current?.seekTo(c.start, true);
    player.current?.playVideo();
    setCurrent(currentCue(cues, c.start));
  }, [cues]);

  const pickSpeed = (r: number) => {
    setSpeed(r);
    player.current?.setPlaybackRate(r);
  };

  const btn = "px-3 py-1.5 text-[12px] font-medium transition-colors";
  const on = "bg-blue-500/20 text-blue-400";
  const off = "text-white/30 hover:text-white/60 hover:bg-white/[0.04]";

  if (!id) return <div className="text-white/40 text-sm">Cannot find the video for this entry.</div>;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      <div className="lg:w-1/2 shrink-0">
        <div ref={box} className="aspect-video w-full rounded-xl overflow-hidden bg-black" />
        <div className="flex flex-wrap items-center gap-3 mt-4 px-4 py-2.5 bg-[#1a1a1f] border border-white/[0.07] rounded-xl">
          <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
            <button onClick={() => jump(current - 1)} className={`${btn} ${off}`}>Previous</button>
            <button onClick={() => jump(current + 1)} className={`${btn} ${off} border-l border-white/[0.08]`}>Next</button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
            {SPEEDS.map((r, i) => (
              <button key={r} onClick={() => pickSpeed(r)} className={`${btn} ${i ? "border-l border-white/[0.08]" : ""} ${speed === r ? on : off}`}>
                {r}x
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-[12px] text-white/50 cursor-pointer">
            <input type="checkbox" role="switch" checked={showEnglish} onChange={(e) => setShowEnglish(e.target.checked)} className="accent-blue-500" />
            Show English
          </label>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-[#111114] border border-white/[0.07] rounded-2xl p-3">
        {cues.map((cue, ci) => {
          const tokens = cue.text.split(/(\s+)/);
          return (
            <div
              key={ci}
              ref={(el) => { lineRefs.current[ci] = el; }}
              className={`flex gap-3 rounded-lg px-3 py-2 leading-7 ${ci === current ? "bg-blue-500/10 border-l-2 border-blue-400" : "border-l-2 border-transparent"}`}
            >
              <button onClick={() => jump(ci)} className="shrink-0 w-10 text-left text-[11px] tabular-nums text-white/30 hover:text-blue-400" title="Jump to this line">
                {clock(cue.start)}
              </button>
              <div className="text-white/75">
                <p>
                  {tokens.map((token, ti) =>
                    /^\s+$/.test(token) ? (
                      <span key={ti}>{token}</span>
                    ) : (
                      <WordToken key={ti} id={`${ci}:${ti}`} word={token} highlightMode={highlightMode} sentence={() => sentenceAt(tokens, ti)} />
                    ),
                  )}
                </p>
                {showEnglish && english[ci] && <p className="text-[13px] text-white/35">{english[ci]}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
