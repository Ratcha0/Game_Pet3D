/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
          'neon-purple': '#8b5cf6',
          'neon-pink': '#ec4899',
          'neon-gold': '#fbbf24',
          'neon-cyan': '#22d3ee'
      }
    },
  },
  plugins: [],
}
