import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF2FF',
    textSecondary: '#64748B',
    accentIndigo: '#6366F1',
    accentPink: '#EC4899',
    accentCyan: '#06B6D4',
  },
  dark: {
    text: '#F8FAFC',
    background: '#090D16',
    backgroundElement: '#131B2E',
    backgroundSelected: '#1E293B',
    textSecondary: '#94A3B8',
    accentIndigo: '#818CF8',
    accentPink: '#F472B6',
    accentCyan: '#22D3EE',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const GenZFonts = Platform.select({
  web: {
    chunkoBold: 'var(--font-chunko)',
    drukHeader: 'var(--font-druk)',
    gintoBody: 'var(--font-ginto)',
    offBitMono: 'var(--font-offbit)',
    glofiumChunky: 'var(--font-glofium)',
    instrumentSans: 'var(--font-instrument)',
    instrumentSerif: 'var(--font-serif)',
  },
  default: {
    chunkoBold: 'sans-serif',
    drukHeader: 'sans-serif',
    gintoBody: 'sans-serif',
    offBitMono: 'monospace',
    glofiumChunky: 'sans-serif',
    instrumentSans: 'sans-serif',
    instrumentSerif: 'serif',
  },
});

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
