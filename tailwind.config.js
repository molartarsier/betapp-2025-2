/ @type {import('tailwindcss').Config} */
module.exports = {
  // 👇 requerido por NativeWind
  presets: [require("nativewind/preset")],

  darkMode: ["class"],
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app//.{js,jsx,ts,tsx}",
    "./components/**/.{js,jsx,ts,tsx}",
    "./contexts//*.{js,jsx,ts,tsx}",
    "./utils//*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 16,
        md: 12,
        sm: 8,
      },
      // ❗ OJO: NO uses colores con CSS variables (hsl(var(--x))) en RN.
      // Si quieres colores personalizados, usa valores literales:
      // colors: {
      //   background: "#0B1220",
      //   foreground: "#E6EDF3",
      //   primary: "#00E1FF",
      //   secondary: "#6C7A89",
      //   accent: "#7C3AED",
      //   muted: "#7A8899",
      //   border: "#1F2733",
      //   input: "#16202b",
      // }
    },
  },
  // Plugins web como tailwindcss-animate no aportan en RN.
  // Déjalo vacío al principio para evitar ruidos:
  plugins: [],
};