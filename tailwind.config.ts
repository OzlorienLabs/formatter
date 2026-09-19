import type { Config } from "tailwindcss";

/** Every colour resolves to a token declared in app/globals.css. No literal hexes here. */
const ramp = (name: string) =>
  Object.fromEntries(
    [100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [
      String(step),
      `var(--color-${name}-${step})`,
    ])
  );

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        ink: "var(--color-text)",
        neutral: ramp("neutral"),
        accent: { DEFAULT: "var(--color-accent)", ...ramp("accent") },
        "accent-2": { DEFAULT: "var(--color-accent-2)", ...ramp("accent-2") },
        plate: {
          c: "var(--plate-c)",
          m: "var(--plate-m)",
          y: "var(--plate-y)",
          k: "var(--plate-k)",
        },
      },
      fontFamily: {
        // The serif is the chrome: `sans` is aliased to it so nothing can fall back.
        sans: ["var(--font-body)"],
        serif: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
        8: "var(--space-8)",
      },
    },
  },
  plugins: [],
};

export default config;
