import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef6ff',
          100: '#d9ecff',
          200: '#bcdcff',
          300: '#8ec7ff',
          400: '#59a7ff',
          500: '#3385ff',
          600: '#1f66f5',
          700: '#1a4fe1',
          800: '#1c41b6',
          900: '#1c3b8f',
        },
        status: {
          present: '#16a34a',   // green-600
          late:    '#d97706',   // amber-600
          rejected:'#dc2626',   // red-600
        },
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;