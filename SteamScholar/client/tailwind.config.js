/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Hex (not var()) so opacity modifiers like bg-iron-950/75 work. Mirrored as CSS variables in tokens.css.
      colors: {
        iron: { 950: '#14110F', 900: '#1E1A17', 700: '#3A332D' },
        brass: { 500: '#B08D57', 300: '#D9BE8A' },
        copper: { 500: '#B8683A' },
        cream: { 100: '#F6EEDC', 300: '#E8DBBE' },
        ink: { 900: '#2B2118' },
        amber: { 500: '#F2A33A' },
        verdigris: { 500: '#4F9D8B' },
      },
      fontFamily: {
        display: ['Rye', '"Alfa Slab One"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
