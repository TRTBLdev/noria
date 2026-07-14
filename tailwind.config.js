/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        noria: {
          bg: '#F2EEE8',       // Linen architectural paper
          text: '#2C2C2C',     // Charcoal
          salvia: '#7D9B76',   // Sage green — Needs
          slate: '#5E7A8A',    // Slate blue — Wants
          amber: '#C9952A',    // Soft amber — Savings / warnings
        }
      },
      fontFamily: {
        sans: ['Jost', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        'noria': '20px',
      }
    },
  },
  plugins: [],
}
