/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        brand: "var(--color-brand)",
        brandSoft: "var(--color-brand-soft)",
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        line: "var(--color-line)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 12px 36px rgba(22, 48, 61, .08)",
      },
    },
  },
  plugins: [],
};
