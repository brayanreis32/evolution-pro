/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef8e8", 100: "#d9f0cc", 500: "#4f7a58", 600: "#3a5a42", 700: "#2b3d2f", 900: "#1b281e" },
        lime: { DEFAULT: "#7ed957", 600: "#5fbf3a" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
