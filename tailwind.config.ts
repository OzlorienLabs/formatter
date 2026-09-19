/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#FAF9F5",
        paper: "#FFFFFF",
        ink: "#141413",
        muted: "#87867F",
        line: "#D1CFC5",
        chip: "#F0EEE6",
        clay: "#D97757",
        clayhover: "#B85C3E",
        olive: "#788C5D",
        brick: "#A83228",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
