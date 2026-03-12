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
          cyan: "#10b981",
          "cyan-dim": "#064e3b",
          "cyan-glow": "rgba(16, 185, 129, 0.1)",
          green: "#10b981",
          "green-dim": "#064e3b",
          red: "#ef4444",
          orange: "#f59e0b",
          purple: "#8b5cf6",
          agent: "#34d399",
        },
        status: {
          online: "#10b981",
          idle: "#f59e0b",
          dnd: "#ef4444",
          offline: "#52525b",
          streaming: "#10b981",
          error: "#ef4444",
          warning: "#f59e0b",
          success: "#10b981",
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
