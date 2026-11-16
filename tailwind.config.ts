import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          sunken: "rgb(var(--surface-sunken) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
        },
        mark: {
          DEFAULT: "rgb(var(--mark) / <alpha-value>)",
          ink: "rgb(var(--mark-ink) / <alpha-value>)",
        },
        good: "rgb(var(--good) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        bad: "rgb(var(--bad) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Badge labels only; content text is 12px (text-xs) or larger.
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        // Page titles (h1).
        title: ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.025em", fontWeight: "700" }],
      },
      borderRadius: {
        // Controls 7px, cards 10px (rounded-md / rounded-lg); kept explicit for DESIGN.md.
        md: "7px",
        lg: "10px",
      },
      boxShadow: {
        overlay: "0 12px 32px -8px rgb(var(--ink) / 0.18), 0 0 0 1px rgb(var(--line))",
      },
      animation: {
        // Keyframes and easing live in globals.css (they shrink to fades under reduced motion).
        "page-in": "fade-rise 420ms var(--ease-out) both",
        "overlay-in": "fade-in 200ms ease-out both",
        "dialog-in": "fade-pop 260ms var(--ease-out) both",
        "toast-in": "fade-pop 300ms var(--ease-out) both",
        "menu-in": "menu-drop 240ms var(--ease-out) both",
      },
    },
  },
  plugins: [],
};

export default config;
