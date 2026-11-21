import { useEffect } from "react";
import useStore from "@/store/useStore";
import { statusForKey } from "@/lib/status";

// status shortcuts (1/2/3/K/I) for the selected word, shared by the text and video readers
export function useStatusHotkeys() {
  const setWordStatus = useStore((s) => s.setWordStatus);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const status = statusForKey(e);
      if (status) setWordStatus(status);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWordStatus]);
}
