/**
 * ISL -> Speech design tokens.
 *
 * The interface sits on a warm, skin-tone-inspired palette (ivory -> peach ->
 * blush). The accent families (emerald / teal / violet / coral) are reserved
 * for actions and identity so the colourful buttons read clearly against the
 * warm ground.
 *
 * Every colour used by the UI is defined here; components never invent hex
 * values. The matching CSS custom properties live in `src/styles.css`
 * (@layer base :root) for the treatments implemented in plain CSS.
 *
 * Contrast policy (verified by `npm run check:contrast`):
 *   - text >= 4.5:1 on every surface it is placed on
 *   - interactive control boundaries >= 3:1
 *   - `warm-500` (nude) is decorative only and never carries body text
 *   - `ink-muted` is used only on cream / ivory surfaces
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Warm ground palette — the foundation of the whole interface. */
        warm: {
          50: '#FFFDFB', // lightest cream
          100: '#FFFAF6', // card cream
          200: '#FFF5ED', // main background — warm ivory
          300: '#FBE8DC', // soft peach
          400: '#F7E1D5', // light blush
          500: '#F3D5C5', // light nude (decorative only)
          600: '#EBD5C8', // warm beige — card borders
          700: '#D9BCA9', // deeper beige — decorative rails
        },
        /* Primary identity — emerald, deepening to a teal-leaning shade. */
        brand: {
          50: '#EFF7F2',
          100: '#DDF8EE',
          200: '#B4EBDA',
          300: '#7FD9BF',
          400: '#33BFA0',
          500: '#078B68',
          600: '#05634D',
          700: '#044C3C',
        },
        /* Bright teal — secondary identity accent. */
        teal: {
          50: '#EEF7F6',
          100: '#C9F0ED',
          200: '#8FDEDA',
          300: '#4FC7C1',
          400: '#0BB8AE',
          500: '#0A9C94',
          600: '#0A6A65',
        },
        /* Violet — selected secondary actions + informational elements. */
        violet: {
          50: '#F5F1F7',
          100: '#EEE9FF',
          200: '#D9D0FF',
          300: '#B9A6FA',
          400: '#9378F0',
          500: '#7657E8',
          600: '#6143C9',
          700: '#4A32A0',
        },
        /* Coral — carefully chosen supporting accent. */
        coral: {
          50: '#FDF0EA',
          100: '#FFE3DD',
          200: '#FFC7BC',
          300: '#FFA794',
          400: '#FF8A7A',
          500: '#FF7867',
          600: '#E85A47',
          700: '#A02F19',
        },
        /* Warm amber — soft highlight, never used for body text. */
        amber: {
          50: '#FDF3E4',
          100: '#FFEED2',
          200: '#FFD9A6',
          300: '#FFB45F',
          400: '#E8933A',
          500: '#B4690E',
        },
        /* Text */
        ink: {
          DEFAULT: '#292321', // primary    14.9:1 on cream
          secondary: '#6D5D56', // secondary  6.0:1 on cream
          muted: '#736259', // tertiary   4.6:1 on the lightest tinted surface
        },
        /* Surfaces — every one is a distinct warm tone. */
        surface: {
          DEFAULT: '#FFFAF6', // card cream
          warm: '#FFF5ED', // main ivory
          subtle: '#FBE8DC', // soft peach
          sunken: '#F7E1D5', // light blush
          accent: '#F3D5C5', // light nude (decorative)
        },
        line: {
          DEFAULT: '#EBD5C8', // warm beige
          strong: '#C6A790', // deeper beige — hover / emphasis
          control: '#B08D74', // 3:1 interactive control boundary
        },
        /* Status text colours — all AA on cream and on their tinted pills. */
        status: {
          ok: '#05634D',
          warn: '#8A4E08',
          danger: '#A81E16',
          info: '#6143C9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Script-specific faces so Hindi and Kannada output renders correctly.
        devanagari: ['"Noto Sans Devanagari"', 'Nirmala UI', 'Mangal', 'sans-serif'],
        kannada: ['"Noto Sans Kannada"', 'Tunga', 'Nirmala UI', 'sans-serif'],
      },
      maxWidth: {
        shell: '1200px',
        prose: '64ch',
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        // Warm-tinted depth: brown rather than neutral black.
        card: '0 1px 2px rgba(115,75,55,0.05), 0 6px 18px -10px rgba(115,75,55,0.18)',
        'card-lg': '0 2px 6px rgba(115,75,55,0.06), 0 22px 44px -22px rgba(115,75,55,0.28)',
        rail: '0 1px 2px rgba(115,75,55,0.06)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.9)',
        glass: '0 1px 0 rgba(255,255,255,0.75) inset, 0 12px 32px -22px rgba(115,75,55,0.45)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}