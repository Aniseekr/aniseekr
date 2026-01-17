export const Colors = {
  primary: '#FF6B35',
  secondary: '#6C5CE7',
  accent: '#00D9FF',

  background: {
    primary: '#0D0D0D',
    secondary: '#1A1A1A',
    tertiary: '#242424',
  },

  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.5)',
    disabled: 'rgba(255, 255, 255, 0.3)',
    placeholder: 'rgba(255, 255, 255, 0.4)',
  },

  success: '#00E676',
  warning: '#FFB300',
  error: '#FF3D00',
  info: '#2979FF',

  gradients: {
    primary: ['#FF6B35', '#F7931E'],
    secondary: ['#6C5CE7', '#A29BFE'],
    sunset: ['#FF6B35', '#F7931E', '#FDC830'],
    aurora: ['#6C5CE7', '#A29BFE', '#00D9FF'],
    neon: ['#FF6B35', '#6C5CE7', '#00D9FF'],
    background: ['#121212', '#1E1E1E', '#121212'],
  },

  glass: {
    light: 'rgba(255, 255, 255, 0.08)',
    medium: 'rgba(255, 255, 255, 0.12)',
    dark: 'rgba(255, 255, 255, 0.05)',
    heavy: 'rgba(255, 255, 255, 0.15)',
    border: 'rgba(255, 255, 255, 0.1)',
  },
};

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  screenPadding: 16,
  cardPadding: 16,
  sectionSpacing: 24,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
};

export const Typography = {
  displayLarge: { fontSize: 48, fontWeight: '800' as const },
  displayMedium: { fontSize: 36, fontWeight: '700' as const },
  headlineLarge: { fontSize: 28, fontWeight: '700' as const },
  headlineMedium: { fontSize: 24, fontWeight: '600' as const },
  headlineSmall: { fontSize: 20, fontWeight: '600' as const },
  titleLarge: { fontSize: 18, fontWeight: '600' as const },
  titleMedium: { fontSize: 16, fontWeight: '600' as const },
  titleSmall: { fontSize: 14, fontWeight: '600' as const },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
};
