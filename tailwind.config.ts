import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  darkMode: 'class',
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      animation: {
        "fade-in": "fade-in 0.6s ease-out both",
      },
      keyframes: {
        "fade-in": {
          "0%": {
            opacity: "0",
          },
          to: {
            opacity: "1",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
      },
      colors: {
        "focus-yellow": "#eae80c",
        "error-red": "#ea1c0c",
      },
    },
  },
  plugins: [],
} satisfies Config;
