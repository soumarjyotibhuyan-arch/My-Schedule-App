import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Head>
        <title>ScheduleSync - Timetable & Alarm Manager</title>
        <meta name="description" content="Smart Schedule & Timetable Sync for Noise Smartwatch and Mobile" />
        <meta name="theme-color" content="#208AEF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ScheduleSync" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </Head>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
