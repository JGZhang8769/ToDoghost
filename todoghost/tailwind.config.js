/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        milktea: {
          50: "#fcfaf8",
          100: "#f5efe6",
          200: "#eadbc3",
          300: "#dfc7a0",
          400: "#d1ab76",
          500: "#c59454",
          600: "#b87e47",
          700: "#9a643c",
          800: "#805336",
          900: "#68452e",
        },
      },
    },
  },
  plugins: [],
};
