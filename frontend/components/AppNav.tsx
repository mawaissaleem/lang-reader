"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchAnkiConnected } from "@/lib/api";

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

/** Top bar shared by Library, Progress and Settings; `children` sit on the right (page actions). */
export default function AppNav({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const [ankiUp, setAnkiUp] = useState<boolean | null>(null);

  useEffect(() => {
    fetchAnkiConnected().then(setAnkiUp);
  }, []);

  return (
    <header className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-line bg-bg/90 px-6 py-3 sm:px-8">
      <Link
        href="/library"
        className="rounded font-serif text-[22px] tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        lese<span className="text-accent">raum</span>
      </Link>
      <nav aria-label="Main" className="flex gap-1.5">
        {LINKS.map(({ href, label }) => {
          const on = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                on ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {children}
        {ankiUp !== null && (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${ankiUp ? "bg-good" : "bg-faint"}`}
            />
            {ankiUp ? "Anki connected" : "Anki offline"}
          </span>
        )}
      </div>
    </header>
  );
}
