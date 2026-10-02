import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#155EEF",
          hover: "#1047C7",
          light: "#E8F0FE",
        },
        secondary: {
          DEFAULT: "#0F766E",
          tint: "#E6F6F3",
        },
        canvas: "#F8FAFC",
        surface: "#FFFFFF",
        subtle: "#F1F5F9",
        border: {
          DEFAULT: "#CBD5E1",
          hairline: "#E2E8F0",
        },
        ink: {
          DEFAULT: "#0F172A",
          secondary: "#475569",
          muted: "#94A3B8",
        },
        success: {
          DEFAULT: "#15803D",
          tint: "#F0FDF4",
          border: "#BBF7D0",
        },
        warning: {
          DEFAULT: "#B45309",
          tint: "#FFFBEB",
          border: "#FDE68A",
        },
        critical: {
          DEFAULT: "#B42318",
          tint: "#FEF2F2",
          border: "#FECDCA",
        },
        info: {
          DEFAULT: "#0369A1",
          tint: "#F0F9FF",
          border: "#BAE6FD",
        },
        ai: {
          DEFAULT: "#7C3AED",
          tint: "#F5F3FF",
          border: "#DDD6FE",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "12px",
        lg: "16px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)",
        raised: "0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.05)",
        input: [
          "0px 2px 3px -1px rgba(0, 0, 0, 0.1)",
          "0px 1px 0px 0px rgba(25, 28, 33, 0.02)",
          "0px 0px 0px 1px rgba(25, 28, 33, 0.08)",
        ].join(", "),
      },
      animation: {
        ripple: "ripple 2.4s ease infinite",
        orbit: "orbit calc(var(--duration) * 1s) linear infinite",
      },
      keyframes: {
        ripple: {
          "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
          "50%": { transform: "translate(-50%, -50%) scale(0.92)" },
        },
        orbit: {
          "0%": {
            transform:
              "rotate(0deg) translateY(calc(var(--radius) * 1px)) rotate(0deg)",
          },
          "100%": {
            transform:
              "rotate(360deg) translateY(calc(var(--radius) * 1px)) rotate(-360deg)",
          },
        },
      },
      maxWidth: {
        app: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
