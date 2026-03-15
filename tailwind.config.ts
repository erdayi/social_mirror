import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 暖色系配色 - 卡通像素可爱风
        primary: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
        },
        secondary: {
          50: '#FEF3C7',
          100: '#FDE68A',
          200: '#FCD34D',
          300: '#FBBF24',
          400: '#F59E0B',
        },
        accent: {
          pink: '#FDA4AF',
          coral: '#FB7185',
          peach: '#FECACA',
        },
        background: '#FFFBF5',
        surface: '#FFFFFF',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        cute: ['Nunito', 'sans-serif'],
      },
      borderRadius: {
        'pixel': '4px',
        'cute': '12px',
      },
      boxShadow: {
        'pixel': '4px 4px 0px 0px rgba(0,0,0,0.1)',
        'cute': '0 4px 14px rgba(249, 115, 22, 0.15)',
      },
    },
  },
  plugins: [],
}
export default config