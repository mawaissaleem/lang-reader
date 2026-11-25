import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, Literata } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/display";

// Self-hosted at build time; each font is exposed as a CSS variable for Tailwind and inline styles.
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
});
// Not preloaded: no page sets text in it on first paint, so the browser fetches it only when used.
const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  preload: false,
});

export const metadata: Metadata = {
  title: "German Reader",
  description: "Read German text with word highlighting and meanings",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${dmSans.variable} ${dmSerif.variable} ${literata.variable}`}
      // the init script sets data-theme before React hydrates
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
