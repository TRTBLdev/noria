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
          bg: '#F5F2ED',       // Linen — cooler, less yellow
          text: '#1A1A1A',     // Near-black for strong contrast
          muted: '#787674',    // Secondary text
          border: 'rgba(0,0,0,0.07)', // Ultra-light borders
          salvia: '#4F8F58',   // Vivid sage (Needs)
          slate: '#3F7F9C',    // Clear blue (Wants)
          amber: '#C58A14',    // Warm ochre (Savings / warnings)
          accent: '#647C78',   // Blue-sage global UI accent
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'Courier New', 'monospace'],
      },
      fontSize: {
        // Typographic scale
        'hero': ['48px', { lineHeight: '1.0', letterSpacing: '-0.02em', fontWeight: '300' }],
        'title': ['24px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '400' }],
        'subtitle': ['16px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '400' }],
        'body': ['14px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
        'label': ['11px', { lineHeight: '1.4', letterSpacing: '0.06em', fontWeight: '500' }],
        'caption': ['10px', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '400' }],
      },
      borderRadius: {
        'noria': '6px',
        'pill': '9999px',
      },
      boxShadow: {
        'lift': '0 2px 8px rgba(0,0,0,0.04)',
        'float': '0 8px 24px rgba(0,0,0,0.06)',
      }
    },
  },
  plugins: [],
}
