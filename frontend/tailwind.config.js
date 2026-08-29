/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: "380px",
      },
      colors: {
        brand: {
          DEFAULT: "#0057FF",
          hover: "#1d6dff",
        },
        status: {
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
        },
        neutral: {
          950: "#0d1117",
          900: "#141829",
          850: "#1a1f35",
          800: "#1e2340",
        },
        stellar: {
          blue: "#0057FF",
          dark: "rgb(var(--stellar-bg) / <alpha-value>)",
          card: "rgb(var(--stellar-card) / <alpha-value>)",
          border: "rgb(var(--stellar-border) / <alpha-value>)",
          text: {
            primary: "rgb(var(--stellar-text-primary) / <alpha-value>)",
            secondary: "rgb(var(--stellar-text-secondary) / <alpha-value>)",
          },
        },
      },
    },
  },
  plugins: [],
};
