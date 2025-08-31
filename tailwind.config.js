/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        // Blood Theme - Primary Colors
        'primary-red': '#DC143C',
        'secondary-red': '#8B0000',
        'accent-red': '#FF0040',
        
        // Background Colors
        'main-bg': '#1a1a1a',
        'card-bg': '#1A1A1A',
        'element-bg': '#2C2C2C',
        
        // Border & Text Colors
        'border-color': '#404040',
        'text-primary': '#FFFFFF',
        'text-secondary': '#B0B0B0',
        
        // Status Colors
        'status-success': '#0F4C0F',
        'status-warning': '#FFA500',
        'status-error': '#8B0000',
        
        // Powerlifting theme colors (legacy support)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554'
        },
        // Contest status colors
        contest: {
          setup: '#6b7280',
          active: '#059669',
          paused: '#d97706',
          completed: '#dc2626'
        },
        // Attempt status colors
        attempt: {
          pending: '#6b7280',
          good: '#059669',
          failed: '#dc2626'
        }
      },
      fontFamily: {
        'display': ['Bebas Neue', 'sans-serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace'],
        // Legacy aliases
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Display text (Bebas Neue) - keep compact sizes
        'hero': ['64px', { lineHeight: '1', letterSpacing: '0.25rem' }],
        'display': ['48px', { lineHeight: '1', letterSpacing: '0.125rem' }],
        
        // Weight numbers get special line-height - reduced but readable
        'weight-hero': ['64px', { lineHeight: '1' }],
        'weight-large': ['48px', { lineHeight: '1' }],
        'weight-medium': ['24px', { lineHeight: '1' }],
        'weight-small': ['16px', { lineHeight: '1' }],
      },
      spacing: {
        '18': '4.5rem',   // 72px
        '22': '5.5rem',   // 88px
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'timer': 'timer-countdown 60s linear forwards',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(220, 20, 60, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(220, 20, 60, 0.8)' }
        },
        'timer-countdown': {
          '0%': { width: '100%' },
          '100%': { width: '0%' }
        }
      },
      boxShadow: {
        'glow': '0 0 20px rgba(220, 20, 60, 0.5)',
        'glow-strong': '0 0 40px rgba(220, 20, 60, 0.8)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 8px 32px rgba(220, 20, 60, 0.3)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}