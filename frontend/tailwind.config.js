/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        // lavender / violet accent, used sparingly
        brand: {
          50: "#f6f3ff", 100: "#ede7ff", 200: "#ddd2fe", 300: "#c4b2fd", 400: "#a585fa",
          500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#2e1065",
        },
        ink: { DEFAULT: "#111114", soft: "#3f3f46", muted: "#71717a" },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17,17,20,.04), 0 8px 28px -6px rgba(124,58,237,.10)",
        float: "0 2px 6px rgba(17,17,20,.04), 0 24px 60px -12px rgba(124,58,237,.22)",
      },
      letterSpacing: { eyebrow: ".22em" },
    },
  },
  plugins: [],
};
