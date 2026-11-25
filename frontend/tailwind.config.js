/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        ink: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        accent2: "var(--accent2)",
        "on-accent": "var(--on-accent)",
        "accent-soft": "var(--accent-soft)",
        // DEFAULT keeps the built-in amber-50…950 scale alongside the token
        amber: { DEFAULT: "var(--amber)" },
        good: "var(--good)",
        hard: "var(--hard)",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "sans-serif"],
        serif: ["var(--font-dm-serif)", "serif"],
        reading: ["var(--font-literata)", "serif"],
      },
    },
  },
  plugins: [],
};
