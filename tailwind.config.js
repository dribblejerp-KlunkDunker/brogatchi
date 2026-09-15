/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        vt:    ['"VT323"', 'monospace'],
        sans:  ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        neon: {
          blue:   '#38bdf8',
          purple: '#a855f7',
          pink:   '#ec4899',
          green:  '#4ade80',
          yellow: '#facc15',
        },
        dark: {
          900: '#060818',
          800: '#0d1117',
          700: '#111827',
          600: '#1a2236',
          500: '#243048',
        },
      },
      boxShadow: {
        'neon-blue':   '0 0 8px #38bdf8, 0 0 20px rgba(56,189,248,0.4)',
        'neon-purple': '0 0 8px #a855f7, 0 0 20px rgba(168,85,247,0.4)',
        'neon-pink':   '0 0 8px #ec4899, 0 0 20px rgba(236,72,153,0.4)',
        'neon-green':  '0 0 8px #4ade80, 0 0 20px rgba(74,222,128,0.4)',
        'glass':       '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        'console':     '0 30px 60px -10px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      keyframes: {
        breathe: {
          '0%,100%': { transform: 'translateY(0px) scale(1)' },
          '50%':     { transform: 'translateY(-4px) scale(1.01)' },
        },
        'idle-bob': {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
        'neon-pulse': {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.6' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'modal-in': {
          '0%':   { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'coin-fly': {
          '0%':   { transform: 'translateY(0)  scale(1)',    opacity: '1' },
          '100%': { transform: 'translateY(-60px) scale(0)', opacity: '0' },
        },
        'bar-glow': {
          '0%,100%': { filter: 'brightness(1)' },
          '50%':     { filter: 'brightness(1.3)' },
        },
        scanline: {
          '0%':   { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100%' },
        },
        'miner-blink': {
          '0%,100%': { opacity: '0.5', boxShadow: 'none' },
          '50%':     { opacity: '1',   boxShadow: '0 0 12px #38bdf8' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-8px)' },
        },
        wiggle: {
          '0%,100%': { transform: 'rotate(-2deg)' },
          '50%':     { transform: 'rotate(2deg)' },
        },
      },
      animation: {
        breathe:     'breathe 3.5s ease-in-out infinite',
        'idle-bob':  'idle-bob 2.5s ease-in-out infinite',
        'neon-pulse':'neon-pulse 2s ease-in-out infinite',
        'slide-up':  'slide-up 0.3s ease-out',
        'modal-in':  'modal-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'coin-fly':  'coin-fly 0.6s ease-out forwards',
        'bar-glow':  'bar-glow 2s ease-in-out infinite',
        'miner-blink':'miner-blink 1s ease-in-out infinite',
        float:       'float 3s ease-in-out infinite',
        wiggle:      'wiggle 0.4s ease-in-out',
      },
    },
  },
  plugins: [],
}
