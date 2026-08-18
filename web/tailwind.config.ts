import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b14",
          900: "#0c1220",
          800: "#121a2b",
          700: "#1a2438",
          600: "#243049",
        },
        line: "#2a3a55",
        gold: "#d4a24c",
        buy: "#3dd68c",
        sell: "#f07178",
        hold: "#8b9bb4",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
