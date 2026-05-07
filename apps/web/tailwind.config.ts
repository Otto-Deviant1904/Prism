import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        roseBrand: '#e11d48'
      }
    }
  },
  plugins: []
};

export default config;
