/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      borderRadius: {
        sm:  '4px',
        DEFAULT: '6px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '20px',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        kado: {
          black: '#0A0A0A',
          white: '#FFFFFF',
          blue:  '#0047FF',
          gray:  '#737373',
          green: '#00d4aa',
          red:   '#ff4d6d',
          amber: '#f59e0b',
        },
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.4' },
        },
      },
      animation: {
        blink:    'blink 1s infinite',
        'fade-in':'fade-in 0.5s ease-out',
        'pulse-soft':'pulse-soft 1.6s ease-in-out infinite',
      },
      boxShadow: {
        'glow': '0 0 24px rgba(0,212,170,0.25)',
        'glow-soft': '0 0 12px rgba(0,212,170,0.15)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
