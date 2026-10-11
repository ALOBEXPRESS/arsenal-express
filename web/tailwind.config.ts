import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          0: "hsl(var(--surface-0))",
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        track: {
          video: "hsl(var(--track-video))",
          audio: "hsl(var(--track-audio))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          /** deeper pink for filled surfaces with white text (AA) */
          fill: "hsl(var(--primary-fill))",
          foreground: "hsl(var(--primary-foreground))",
        },
        express: "hsl(var(--express))",
        brand: {
          pink: "hsl(var(--brand-pink))",
          cyan: "hsl(var(--brand-cyan))",
          ink: "hsl(var(--brand-ink))",
          orange: "hsl(var(--brand-orange))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "sync-snap": {
          "0%": { transform: "translateY(var(--from, 6px))" },
          "60%": { transform: "translateY(-1px)" },
          "100%": { transform: "translateY(0)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "sync-snap": "sync-snap 700ms cubic-bezier(.2,.9,.2,1.2) backwards",
        "rise-in": "rise-in 600ms cubic-bezier(.2,.8,.2,1) backwards",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
