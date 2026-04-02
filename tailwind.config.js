/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./game.html",
    "./dashboard.html",
    "./src/**/*.{js,ts,jsx,tsx,css}",
    "./*.js"
  ],
  theme: {
    extend: {
      colors: {
        'arc8-bg': '#0f172a',
        'arc8-surface': '#1e293b',
        'arc8-accent': '#7c3aed',
        'arc8-pink': '#ff3399',
        'arc8-gold': '#f59e0b',
        'premium-accent': '#8b5cf6',
        'neon-purple': '#8b5cf6',
        'neon-pink': '#ec4899',
        'neon-gold': '#f59e0b',
        'surface': '#111827',
        premium: {
          dark: '#0f0a24',
          card: 'rgba(30, 24, 60, 0.7)',
          accent: '#7c3aed',
          gold: '#fbbf24',
          energy: '#3b82f6',
          danger: '#ef4444'
        }
      },
      backgroundImage: {
        'game-bg': "linear-gradient(to bottom, #0f0720, #2d0b5a)"
      },
      fontFamily: {
        'sans': ['Outfit', 'sans-serif'],
        'outfit': ['Outfit', 'sans-serif']
      }
    },
  },
  plugins: [],
}
