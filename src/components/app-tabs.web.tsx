import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Explore</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.tabButtonView,
          {
            backgroundColor: isFocused
              ? isDark ? '#FACC15' : '#FFF384'
              : isDark ? '#1E1B15' : '#FFFFFF',
            borderColor: isDark ? '#FAFAFA' : '#18181B',
          },
        ]}>
        <ThemedText
          type="small"
          style={{
            color: isFocused ? '#18181B' : isDark ? '#A1A1AA' : '#52525B',
            fontWeight: isFocused ? '900' : '600',
            fontFamily: 'var(--font-chunko)',
            letterSpacing: 0.5,
          }}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <View {...props} style={styles.tabListContainer}>
      <View
        style={[
          styles.innerContainer,
          {
            backgroundColor: isDark ? '#1E1B15' : '#FFFFFF',
            borderColor: isDark ? '#FAFAFA' : '#18181B',
          },
        ]}>
        <ThemedText
          type="smallBold"
          style={[
            styles.brandText,
            {
              fontFamily: 'var(--font-chunko)',
              fontWeight: '900',
              fontSize: 16,
              letterSpacing: 0.5,
              color: isDark ? '#FAFAFA' : '#18181B',
            },
          ]}>
          ⚡ SCHEDULE SYNC
        </ThemedText>

        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    zIndex: 999,
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 20,
    borderWidth: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    elevation: 4,
    shadowColor: '#18181B',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ translateY: 1 }],
  },
  tabButtonView: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#18181B',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
});
