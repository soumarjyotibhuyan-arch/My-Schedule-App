import React from 'react';
import { ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ExploreScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={styles.contentContainer}
    >
      <ThemedView style={styles.container}>
        {/* Header */}
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle" style={styles.titleText}>Setup Guide</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Follow these steps to connect your reminders to your Noise Smartwatch.
          </ThemedText>
        </ThemedView>

        {/* Accordions */}
        <ThemedView style={styles.sectionsWrapper}>
          <Collapsible title="1. How watch reminders work">
            <ThemedText type="small" style={styles.listItem}>
              • Noise smartwatches run custom software and don't allow third-party app installations.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • To bypass this, this app schedules alarms on your phone's notification center.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • The official <ThemedText type="smallBold">NoiseFit app</ThemedText> reads these notifications and mirrors them directly onto your smartwatch screen via Bluetooth.
            </ThemedText>
          </Collapsible>

          <Collapsible title="2. Step-by-Step NoiseFit configuration">
            <ThemedText type="small" style={styles.listItem}>
              1. Open the <ThemedText type="smallBold">NoiseFit app</ThemedText> on your phone.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              2. Go to the <ThemedText type="smallBold">Device</ThemedText> or <ThemedText type="smallBold">My Device</ThemedText> tab.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              3. Select <ThemedText type="smallBold">App Notifications</ThemedText> or <ThemedText type="smallBold">Notifications</ThemedText>.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              4. Enable <ThemedText type="smallBold">Notifications Access</ThemedText> if prompted.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              5. Find <ThemedText type="smallBold">myscheduleapp</ThemedText> in the app list and turn the toggle <ThemedText type="smallBold">ON</ThemedText>.
            </ThemedText>
          </Collapsible>

          <Collapsible title="3. Excel/CSV template formats">
            <ThemedText type="small" style={styles.infoBlock}>
              For the best results, format your spreadsheet with these header columns:
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.codeBlock}>
              <ThemedText type="code">
                Title, Day, Time, Reminder, Description
              </ThemedText>
            </ThemedView>
            <ThemedText type="small" style={styles.listItem}>
              • <ThemedText type="smallBold">Title</ThemedText>: Name of the class or meeting.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • <ThemedText type="smallBold">Day</ThemedText>: E.g., "Monday", "Tuesday" (or "2026-08-28" for dates).
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • <ThemedText type="smallBold">Time</ThemedText>: E.g., "09:30" (24h) or "9:30 AM" (12h).
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • <ThemedText type="smallBold">Reminder</ThemedText>: Lead time in minutes, e.g., "5", "10".
            </ThemedText>
          </Collapsible>

          <Collapsible title="4. Ensuring reminders arrive on time">
            <ThemedText type="small" style={styles.listItem}>
              • Android and iOS often kill background processes to save battery.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • Go to your phone's battery settings and set the <ThemedText type="smallBold">NoiseFit app</ThemedText> and <ThemedText type="smallBold">this app</ThemedText> to <ThemedText type="smallBold">"Unrestricted" / "Disable Battery Optimization"</ThemedText>.
            </ThemedText>
            <ThemedText type="small" style={styles.listItem}>
              • Ensure Bluetooth is always enabled and your watch remains connected.
            </ThemedText>
          </Collapsible>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    paddingBottom: Spacing.four,
  },
  titleContainer: {
    gap: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  titleText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  centerText: {
    textAlign: 'center',
    fontSize: 14,
  },
  sectionsWrapper: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  listItem: {
    marginVertical: Spacing.one,
    lineHeight: 18,
  },
  infoBlock: {
    fontWeight: '500',
    marginBottom: Spacing.one,
  },
  codeBlock: {
    padding: Spacing.two,
    borderRadius: Spacing.one,
    marginVertical: Spacing.two,
  },
});
