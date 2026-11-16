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
        "page-in": "page-in 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "overlay-in": "overlay-in 160ms ease-out both",
        "dialog-in": "dialog-in 200ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "toast-in": "toast-in 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "menu-in": "menu-in 180ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
