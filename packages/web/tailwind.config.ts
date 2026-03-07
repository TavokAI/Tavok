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
          cyan: "#59b8ff",
          "cyan-dim": "#154a79",
          "cyan-glow": "rgba(89, 184, 255, 0.14)",
          green: "#29d391",
          "green-dim": "#0e6b50",
          red: "#f56a6a",
          orange: "#ff922b",
          purple: "#8b5cf6",
          agent: "#6dd3ff",
        },
        status: {
          online: "#29d391",
          idle: "#ffb347",
          dnd: "#f56a6a",
          offline: "#5e6b85",
          streaming: "#59b8ff",
          error: "#f56a6a",
          warning: "#ffb347",
          success: "#29d391",
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
