/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161b22',
          overlay: '#1c2128',
        },
        border: {
          DEFAULT: '#30363d',
          muted: '#21262d',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          muted: '#312e81',
        },
        status: {
          active: '#22d3ee',
          idle: '#6b7280',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        mono: ['"Cascadia Code"', '"Fira Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
