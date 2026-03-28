import type { Config } from 'tailwindcss'

export default {
  content: ['./**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gc: {
          bg:        '#0a0e1a',
          surface1:  '#080a10',
          surface2:  '#1e2433',
          border:    '#ffffff0f',
          'border-active': '#ffffff18',
          text:      '#f1f5f9',
          'text-2':  '#94a3b8',
          'text-3':  '#475569',
          'text-4':  '#334155',
          purple:    '#a78bfa',
          amber:     '#F59E0B',
          blue:      '#38bdf8',
          green:     '#34d399',
          red:       '#f87171',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
