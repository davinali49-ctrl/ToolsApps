/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#080c19',
          900: '#0b132b',
          850: '#101a33',
          800: '#16213f'
        },
        brand: {
          100: '#e8f0f8',
          200: '#d0e2f0',
          300: '#a9cbe3',
          400: '#7fafce',
          500: '#5f94b8',
          600: '#47789a',
          700: '#3a637f'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,.24), 0 16px 40px -28px rgba(0,0,0,.7)'
      },
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both'
      }
    }
  },
  plugins: []
};
