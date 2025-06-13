/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      spacing: {
        30: "7.5rem", // 120px
      },
    },
  },
  plugins: [],

  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
};
