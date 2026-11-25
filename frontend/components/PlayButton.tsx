"use client";

import React from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { ttsUrl } from "@/lib/api";

let current: HTMLAudioElement | null = null; // only one clip plays at a time

// Plays `text` via /tts. Clicking while loading or playing stops it. Remount it (key) when the text changes.
export default function PlayButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [state, setState] = React.useState<
    "idle" | "loading" | "playing" | "error"
  >("idle");
  const ref = React.useRef<HTMLAudioElement | null>(null);

  function stop() {
    const a = ref.current;
    ref.current = null; // late events from this clip are ignored
    a?.pause();
    if (current === a) current = null;
  }
  React.useEffect(() => stop, []); // switching words unmounts the button: no stale clip keeps going

  function click() {
    if (ref.current) {
      stop();
      setState("idle");
      return;
    }
    current?.pause(); // the other button's pause event resets its state
    const a = new Audio(ttsUrl(text));
    ref.current = current = a;
    const live = (s: typeof state) => () => {
      if (ref.current === a) setState(s);
    };
    a.onplaying = live("playing");
    a.onended = a.onpause = () => {
      if (ref.current === a) {
        ref.current = null;
        current = null;
        setState("idle");
      }
    };
    a.onerror = () => {
      if (ref.current === a) {
        ref.current = null;
        current = null;
        setState("error");
      }
    };
    setState("loading");
    a.play().catch(() => {}); // failures also fire onerror; aborts come from our own pause()
  }

  const Icon =
    state === "loading" ? Loader2 : state === "playing" ? Square : Volume2;
  return (
    <>
      <button
        type="button"
        onClick={click}
        aria-label={label}
        title={state === "error" ? "Audio not available" : label}
        className="inline-flex align-middle p-1 rounded text-accent hover:bg-accent-soft"
      >
        <Icon
          size={14}
          className={state === "loading" ? "animate-spin" : undefined}
        />
      </button>
      {state === "error" && (
        <span role="alert" className="text-[11px] text-hard">
          Audio not available
        </span>
      )}
    </>
  );
}
