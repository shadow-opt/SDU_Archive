import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sdu-red': {
          DEFAULT: '#9c0c13',
          hover: '#841520',
          light: '#fdf3f4',
        },
        'paper-bg': '#F9F9F8',
        'ink-dark': '#1C1C1E',
        'ink-light': '#4A4A4C',
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'serif'],
      }
    },
  },
  plugins: [typography],
} satisfies Config
