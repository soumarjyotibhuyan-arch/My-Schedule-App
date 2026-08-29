import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#18181B',
    background: '#FFFBEA', // Spark Warm Sunshine Yellow/Cream Background
    backgroundElement: '#FFFFFF', // Crisp White Cards
    backgroundSelected: '#FFF384', // Bright Yellow Highlight
    textSecondary: '#52525B',
    accentYellow: '#FFF384',
    accentPurple: '#E9D5FF',
    accentCoral: '#FF8E8E',
    accentGreen: '#A7F3D0',
    borderDark: '#18181B',
  },
  dark: {
    text: '#FAFAFA',
    background: '#12110D', // Deep Warm Dark Background
    backgroundElement: '#1E1B15', // Deep Dark Card Element
    backgroundSelected: '#38321F', // Dark Warm Yellow Highlight
    textSecondary: '#A1A1AA',
    accentYellow: '#FACC15',
    accentPurple: '#C084FC',
    accentCoral: '#F87171',
    accentGreen: '#4ADE80',
    borderDark: '#FAFAFA',
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
    chunkoBold: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    drukHeader: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    gintoBody: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    offBitMono: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    glofiumChunky: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    instrumentSans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    instrumentSerif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
})!;

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
export const MaxContentWidth = 1100; // Expanded for rich responsive desktop grid layouts
