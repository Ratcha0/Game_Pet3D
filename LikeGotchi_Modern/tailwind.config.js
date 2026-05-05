/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./dashboard.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#080c18',
        'surface': '#111827',
        'card': '#0f1629',
        'neon-purple': '#8b5cf6',
        'neon-pink': '#ec4899',
        'neon-gold': '#fbbf24',
        'neon-cyan': '#06b6d4',
        'neon-emerald': '#10b981'
      },
      fontFamily: {
        'sans': ['Outfit', 'sans-serif']
      }
    },
  },
  plugins: [],
}
