"use client";
import { useEffect, useMemo, useState, type RefObject } from "react";
import useStore from "@/store/useStore";
import { cleanWord, entryFor } from "@/lib/words";
import { newWordCount, ticksFor, type Cue } from "@/lib/video";

/** The slice of the player the timeline needs. */
interface TimedPlayer {
  getCurrentTime(): number;
  getDuration(): number;
}

/** Thin progress bar under the player with a tick at every line that has new words. */
export default function VideoTimeline({
  player,
  cues,
}: {
  player: RefObject<TimedPlayer | null>;
  cues: Cue[];
}) {
  const userWords = useStore((s) => s.userWords);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // polled here, not in VideoReader, so the whole transcript does not re-render four times a second
  useEffect(() => {
    const timer = setInterval(() => {
      const p = player.current;
      if (typeof p?.getCurrentTime !== "function") return;
      setTime(p.getCurrentTime());
      setDuration(p.getDuration());
    }, 250);
    return () => clearInterval(timer);
  }, [player]);

  const ticks = useMemo(
    () =>
      ticksFor(
        cues,
        (text) =>
          newWordCount(text, (w) => entryFor(userWords, cleanWord(w))?.status),
        duration,
      ),
    [cues, userWords, duration],
  );

  // display only: seeking stays with YouTube's own bar and the transcript time buttons
  return (
    <div
      data-testid="timeline"
      aria-hidden="true"
      className="relative h-6 mt-2"
      title="New words in each line"
    >
      <div className="absolute inset-x-0 bottom-1 h-1 rounded-full bg-line" />
      <div
        className="absolute left-0 bottom-1 h-1 rounded-full bg-accent"
        style={{ width: `${duration > 0 ? (time / duration) * 100 : 0}%` }}
      />
      {ticks.map((t, i) => (
        <span
          key={i}
          data-testid="tick"
          className="absolute bottom-2 w-px bg-accent opacity-70"
          style={{ left: `${t.at * 100}%`, height: `${4 + t.level * 12}px` }}
        />
      ))}
    </div>
  );
}
