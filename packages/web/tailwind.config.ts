import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: {
          primary: "var(--background-primary)",
          secondary: "var(--background-secondary)",
          tertiary: "var(--background-tertiary)",
          floating: "var(--background-floating)",
          elevated: "var(--background-elevated)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          bright: "var(--border-bright)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          dim: "var(--text-dim)",
          link: "var(--text-link)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          glow: "var(--brand-glow)",
        },
        accent: {
          cyan: "#22d3ee",
          "cyan-dim": "#0e7490",
          "cyan-glow": "rgba(34, 211, 238, 0.04)",
          green: "#22c55e",
          "green-dim": "#166534",
          red: "#ef4444",
          orange: "#f97316",
          purple: "#a78bfa",
          agent: "#22d3ee",
        },
        status: {
          online: "#22c55e",
          idle: "#f59e0b",
          dnd: "#ef4444",
          offline: "#52525b",
          streaming: "#22d3ee",
          error: "#ef4444",
          warning: "#f59e0b",
          success: "#22c55e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
