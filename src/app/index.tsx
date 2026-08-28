import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { ScheduleEvent } from '../types';
import { parseCSV } from '../utils/csvParser';
import { parseExcel } from '../utils/excelParser';
import { parsePDFText } from '../utils/pdfParser';
import { getEvents, saveEvents, clearEvents, getDefaultReminderOffset, saveDefaultReminderOffset } from '../utils/storage';
import {
  requestNotificationPermissions,
  scheduleAllEvents,
  cancelAllNotifications,
} from '../utils/notifier';
import PDFParserWebView from '../components/PDFParserWebView';
import CalendarPreview from '../components/CalendarPreview';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '../constants/theme';
import { useColorScheme } from 'react-native';

const DAYS_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function readFileAsText(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return await response.text();
  } else {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
}

async function readFileAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file as base64'));
      };
      reader.readAsDataURL(blob);
    });
  } else {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
}

function getDayOfWeekFromDate(dateStr: string): number {
  try {
    const [year, month, day] = dateStr.split('-').map(x => parseInt(x, 10));
    const d = new Date(year, month - 1, day);
    const dayIndex = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (dayIndex === 0) return 7; // Sunday
    return dayIndex; // Monday = 1, Tuesday = 2, etc.
  } catch (e) {
    return 1;
  }
}

function formatFriendlyDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(x => parseInt(x, 10));
    const d = new Date(year, month - 1, day);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const weekdayName = weekdays[d.getDay()];
    const monthName = months[d.getMonth()];
    return `${weekdayName}, ${monthName} ${day}, ${year}`;
  } catch (e) {
    return dateStr;
  }
}

function isPastDate(eventDateStr: string | undefined, todayStr: string): boolean {
  if (!eventDateStr || !todayStr) return false;
  const [eYear, eMonth, eDay] = eventDateStr.split('-').map(x => parseInt(x, 10));
  const [tYear, tMonth, tDay] = todayStr.split('-').map(x => parseInt(x, 10));

  if (eYear < tYear) return true;
  if (eYear > tYear) return false;

  if (eMonth < tMonth) return true;
  if (eMonth > tMonth) return false;

  return eDay < tDay;
}

function getTodayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface RollingDay {
  label: string;
  dateStr: string;
  dayOfWeek: number;
}

function getRollingDays(): RollingDay[] {
  const days: RollingDay[] = [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    days.push({
      label: i === 0 ? 'Today' : `${weekdays[d.getDay()]} ${d.getDate()}`,
      dateStr,
      dayOfWeek: d.getDay() === 0 ? 7 : d.getDay(),
    });
  }
  return days;
}

function formatTime12h(time24: string): string {
  try {
    const [hourStr, minuteStr] = time24.split(':');
    const hours = parseInt(hourStr, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minuteStr} ${ampm}`;
  } catch (e) {
    return time24;
  }
}

function hasScheduleConflict(event: ScheduleEvent, allEvents: ScheduleEvent[]): boolean {
  return allEvents.some(e => {
    if (e.id === event.id) return false;
    if (e.time !== event.time) return false;

    if (event.dayOfWeek !== undefined && e.dayOfWeek === event.dayOfWeek) return true;
    if (event.date !== undefined && e.date === event.date) return true;

    if (event.date !== undefined && e.dayOfWeek !== undefined) {
      return getDayOfWeekFromDate(event.date) === e.dayOfWeek;
    }
    if (event.dayOfWeek !== undefined && e.date !== undefined) {
      return getDayOfWeekFromDate(e.date) === event.dayOfWeek;
    }

    return false;
  });
}

function getTimelineColor(time24: string): string {
  try {
    const [hourStr] = time24.split(':');
    const hour = parseInt(hourStr, 10);
    if (hour < 11 || (hour === 11 && parseInt(time24.split(':')[1], 10) <= 30)) {
      return '#007AFF'; // Morning focus (Blue)
    } else if (hour < 13 || (hour === 13 && parseInt(time24.split(':')[1], 10) <= 30)) {
      return '#FF9500'; // Midday collaboration/lunch (Orange)
    } else if (hour < 15 || (hour === 15 && parseInt(time24.split(':')[1], 10) <= 30)) {
      return '#AF52DE'; // Early Afternoon admin (Purple)
    } else {
      return '#34C759'; // Late Afternoon wrap-up (Green)
    }
  } catch (e) {
    return '#208AEF';
  }
}

function getTimelineLabel(time24: string): string {
  try {
    const [hourStr] = time24.split(':');
    const hour = parseInt(hourStr, 10);
    if (hour < 11 || (hour === 11 && parseInt(time24.split(':')[1], 10) <= 30)) {
      return 'Morning Focus';
    } else if (hour < 13 || (hour === 13 && parseInt(time24.split(':')[1], 10) <= 30)) {
      return 'Collaboration & Lunch';
    } else if (hour < 15 || (hour === 15 && parseInt(time24.split(':')[1], 10) <= 30)) {
      return 'Early Afternoon Tasks';
    } else {
      return 'Late Afternoon Wrap-up';
    }
  } catch (e) {
    return 'Schedule Event';
  }
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme === 'unspecified' || !scheme ? 'light' : scheme];

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [selectedTab, setSelectedTab] = useState<number | 'all' | 'calendar'>(0); // Index of rollingDays, 'all', or 'calendar'
  const [loading, setLoading] = useState(false);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<ScheduleEvent[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(getTodayDateString());
  const [defaultReminderOffset, setDefaultReminderOffset] = useState<number>(5);
  const [declutterEnabled, setDeclutterEnabled] = useState(false);
  const [filterPastEvents, setFilterPastEvents] = useState(false);
  const rollingDays = getRollingDays();

  const handleSelectDate = (dateStr: string | null) => {
    if (!dateStr) {
      setSelectedTab(0); // Reset to Today
      setSelectedDateStr(getTodayDateString());
      return;
    }
    
    setSelectedDateStr(dateStr);
    
    const rollingIdx = rollingDays.findIndex(d => d.dateStr === dateStr);
    if (rollingIdx !== -1) {
      setSelectedTab(rollingIdx);
    } else {
      setSelectedTab('calendar');
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      const savedEvents = await getEvents();
      setEvents(savedEvents);

      const offset = await getDefaultReminderOffset();
      setDefaultReminderOffset(offset);

      const status = await requestNotificationPermissions();
      setPermissionGranted(status);

      if (status && savedEvents.length > 0) {
        await scheduleAllEvents(savedEvents);
      }
    };

    loadInitialData();
  }, []);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermissions();
    setPermissionGranted(granted);
    if (granted) {
      showAlert('Permission Granted', 'Your schedule reminders will now be pushed to your notifications bar.');
      if (events.length > 0) {
        await scheduleAllEvents(events);
      }
    } else {
      showAlert('Permission Denied', 'Please enable notification permissions in your phone settings.');
    }
  };

  const handleUpdateAllReminderOffsets = async (offset: number) => {
    setDefaultReminderOffset(offset);
    await saveDefaultReminderOffset(offset);
    
    if (events.length > 0) {
      const updatedEvents = events.map(e => ({
        ...e,
        reminderMinutesBefore: offset
      }));
      setEvents(updatedEvents);
      await saveEvents(updatedEvents);
      if (permissionGranted) {
        await scheduleAllEvents(updatedEvents);
      }
      showAlert('Reminders Updated', `All notification alarms have been rescheduled to trigger ${offset === 0 ? 'at the' : offset + ' minutes before'} class time.`);
    } else {
      showAlert('Offset Saved', `New timetable files will now import with a default reminder of ${offset === 0 ? '0' : offset} minutes.`);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setLoading(true);

      const fileName = (asset.name || '').toLowerCase();
      const base64 = await readFileAsBase64(asset.uri);
      const cleanBase64 = base64.trim();

      if (fileName.endsWith('.pdf') || cleanBase64.startsWith('JVBER')) {
        // PDF File Format (base64 for %PDF)
        setPdfBase64(base64);
      } else if (
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls') ||
        cleanBase64.startsWith('UEsDB') ||
        cleanBase64.startsWith('0M8R4')
      ) {
        // Excel File Format (.xlsx starts with UEsDB, .xls starts with 0M8R4)
        const parsed = parseExcel(base64);
        await saveParsedEvents(parsed);
      } else {
        // Fallback: Treat as a text file / CSV
        const content = await readFileAsText(asset.uri);
        const parsed = parseCSV(content);
        await saveParsedEvents(parsed);
      }
    } catch (error) {
      console.error('File pick error:', error);
      showAlert('Upload Failed', 'There was an error selecting, identifying, or reading your file.');
      setLoading(false);
    }
  };

  const saveParsedEvents = async (newEvents: ScheduleEvent[]) => {
    if (newEvents.length === 0) {
      showAlert('No Events Found', 'We could not extract any events. Please check the file formatting.');
      setLoading(false);
      return;
    }

    const mappedEvents = newEvents.map(e => ({
      ...e,
      reminderMinutesBefore: defaultReminderOffset
    }));

    setPendingEvents(mappedEvents);
    setModalVisible(true);
  };

  const handleReplaceConfirm = async () => {
    const todayStr = getTodayDateString();
    const eventsToImport = filterPastEvents 
      ? pendingEvents.filter(e => !e.date || !isPastDate(e.date, todayStr))
      : pendingEvents;
    const prunedCount = pendingEvents.length - eventsToImport.length;

    const updated = [...eventsToImport];
    setEvents(updated);
    await saveEvents(updated);
    setSelectedTab('all');
    setSelectedDateStr(null);
    setModalVisible(false);
    
    const summaryText = prunedCount > 0 
      ? `Replaced schedule with ${eventsToImport.length} active classes (${prunedCount} past events omitted).`
      : `Successfully loaded all ${eventsToImport.length} scheduled classes across all dates!`;

    if (permissionGranted) {
      const count = await scheduleAllEvents(updated);
      showAlert('Sync Successful', `${summaryText} Set ${count} alarms.`);
    } else {
      showAlert('Import Completed', summaryText);
    }
    setLoading(false);
  };

  const handleAppendConfirm = async () => {
    const todayStr = getTodayDateString();
    const eventsToImport = filterPastEvents 
      ? pendingEvents.filter(e => !e.date || !isPastDate(e.date, todayStr))
      : pendingEvents;
    const prunedCount = pendingEvents.length - eventsToImport.length;

    const updated = [...events, ...eventsToImport];
    setEvents(updated);
    await saveEvents(updated);
    setSelectedTab('all');
    setSelectedDateStr(null);
    setModalVisible(false);

    const summaryText = prunedCount > 0 
      ? `Updated schedule with ${eventsToImport.length} active classes (${prunedCount} past events omitted).`
      : `Successfully added all ${eventsToImport.length} scheduled classes across all dates!`;

    if (permissionGranted) {
      const count = await scheduleAllEvents(updated);
      showAlert('Sync Successful', `${summaryText} Set ${count} alarms.`);
    } else {
      showAlert('Import Completed', summaryText);
    }
    setLoading(false);
  };

  const handlePdfTextExtracted = async (text: string) => {
    const parsed = parsePDFText(text);
    await saveParsedEvents(parsed);
  };

  const handlePdfParseError = (error: string) => {
    showAlert('PDF Parsing Error', `Failed to extract text from PDF: ${error}`);
    setLoading(false);
  };

  const handleClearSchedule = () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('Are you sure you want to delete all timetable events and cancel all notifications?');
      if (confirm) {
        clearAllEventsAndNotifications();
      }
    } else {
      Alert.alert(
        'Clear All Schedule',
        'Are you sure you want to delete all timetable events and cancel all notifications?',
        [
          {
            text: 'Yes, Clear All',
            style: 'destructive',
            onPress: clearAllEventsAndNotifications,
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    }
  };

  const clearAllEventsAndNotifications = async () => {
    setEvents([]);
    await clearEvents();
    await cancelAllNotifications();
    setDefaultReminderOffset(5);
    await saveDefaultReminderOffset(5);
    showAlert('Application Reset', 'All scheduled alarms and configurations have been successfully reset.');
  };

  const handleDeleteEvent = async (id: string) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    await saveEvents(updated);
    if (permissionGranted) {
      await scheduleAllEvents(updated);
    }
  };

  // Filter events for the selected day or one-off
  let rawFilteredEvents = events.filter(e => {
    if (selectedTab === 'all') {
      return true; // Show all items for management
    }
    
    // We filter by the selectedDateStr
    if (!selectedDateStr) return false;
    
    // Get weekday of the selectedDateStr (1 = Mon, 7 = Sun)
    const [year, month, day] = selectedDateStr.split('-').map(x => parseInt(x, 10));
    const d = new Date(year, month - 1, day);
    let targetDayOfWeek = d.getDay();
    targetDayOfWeek = targetDayOfWeek === 0 ? 7 : targetDayOfWeek;

    // Show if:
    // 1. Repeating event matches the weekday
    if (e.dayOfWeek === targetDayOfWeek) return true;
    // 2. One-off event matches the exact date
    if (e.date === selectedDateStr) return true;

    return false;
  }).sort((a, b) => a.time.localeCompare(b.time));

  if (declutterEnabled) {
    rawFilteredEvents = rawFilteredEvents.filter(e => e.category !== 'Administrative' && e.title.toLowerCase() !== 'blank');
  }

  const filteredEvents = rawFilteredEvents;

  // TL;DR High-Level Summary Calculations
  const totalCommits = filteredEvents.length;
  const topFocusTask = filteredEvents.find(e => e.category === 'Deep Work') || filteredEvents[0];
  const theOneThing = topFocusTask ? topFocusTask.title : 'No commits scheduled';
  
  let totalBufferHours = 0;
  if (filteredEvents.length >= 2) {
    const startHour = parseInt(filteredEvents[0].time.split(':')[0], 10);
    const endHour = parseInt(filteredEvents[filteredEvents.length - 1].time.split(':')[0], 10);
    const gap = Math.max(0, endHour - startHour - (filteredEvents.length - 1) * 1.5);
    totalBufferHours = Math.round(gap * 10) / 10;
  }

  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768; // Desktop / laptop breakpoint

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Schedule Sync</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Push reminders to your Noise Smartwatch
            </Text>
          </View>

          {/* Permissions Alert Banner */}
          {!permissionGranted && (
            <Pressable
              style={({ pressed }) => [
                styles.permissionBanner,
                pressed && styles.pressed,
              ]}
              onPress={handleRequestPermission}
            >
              <Text style={styles.permissionText}>
                ⚠️ Alarms Disabled. Tap here to grant permission.
              </Text>
            </Pressable>
          )}

          <View style={isLargeScreen ? styles.desktopLayout : styles.mobileLayout}>
            {/* Main Column */}
            <View style={isLargeScreen ? styles.mainColumn : styles.fullWidthColumn}>
              {/* Upload Trigger Card */}
              <View style={[styles.uploadCard, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.uploadLabel, { color: theme.text }]}>
                  Upload Timetable Schedule
                </Text>
                <Text style={[styles.uploadDesc, { color: theme.textSecondary }]}>
                  Supports Excel (.xlsx), CSV, and PDF formats
                </Text>
                
                <Pressable
                  style={({ pressed }) => [
                    styles.uploadButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={handlePickDocument}
                >
                  <Text style={styles.uploadButtonText}>📁 Select Timetable File</Text>
                </Pressable>
              </View>

              {/* Alarm Reminder Settings Card */}
              <View style={[styles.settingsCard, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.settingsTitle, { color: theme.text }]}>
                  🔔 Alarm Reminder Offset
                </Text>
                <Text style={[styles.settingsDesc, { color: theme.textSecondary }]}>
                  Choose when you want to receive alerts before your classes:
                </Text>
                <View style={styles.pillsContainer}>
                  {[0, 5, 10, 15, 30].map(offset => (
                    <Pressable
                      key={offset}
                      onPress={() => handleUpdateAllReminderOffsets(offset)}
                      style={[
                        styles.pillButton,
                        defaultReminderOffset === offset && [styles.activePill, { backgroundColor: theme.backgroundSelected }]
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          { color: defaultReminderOffset === offset ? theme.text : theme.textSecondary },
                          defaultReminderOffset === offset && styles.activePillText
                        ]}
                      >
                        {offset === 0 ? 'Event Time' : `${offset}m before`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                
                <Pressable
                  style={({ pressed }) => [
                    styles.resetAppButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleClearSchedule}
                >
                  <Text style={styles.resetAppButtonText}>🔄 Reset Application Alarms & Settings</Text>
                </Pressable>
              </View>

              {/* Mobile Calendar Preview (below uploader) */}
              {!isLargeScreen && events.length > 0 && (
                <View style={styles.mobileCalendarContainer}>
                  <CalendarPreview
                    events={events}
                    selectedDate={selectedDateStr}
                    onSelectDate={handleSelectDate}
                    theme={theme}
                  />
                </View>
              )}

              {/* High-Level TL;DR Summary Card */}
              {events.length > 0 && (
                <View style={[styles.tldrCard, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.tldrHeader}>
                    <Text style={[styles.tldrTitle, { color: theme.text }]}>🧠 Schedule TL;DR Summary</Text>
                    <Pressable
                      style={[styles.declutterButton, declutterEnabled && styles.declutterButtonActive]}
                      onPress={() => setDeclutterEnabled(!declutterEnabled)}
                    >
                      <Text style={[styles.declutterText, declutterEnabled && { color: '#ffffff' }]}>
                        {declutterEnabled ? '🧹 De-cluttered' : '👁️ Show All'}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.tldrRow}>
                    <View style={styles.tldrMetric}>
                      <Text style={[styles.tldrMetricLabel, { color: theme.textSecondary }]}>Commits</Text>
                      <Text style={[styles.tldrMetricValue, { color: theme.text }]}>{totalCommits}</Text>
                    </View>
                    <View style={[styles.tldrMetric, { flex: 2 }]}>
                      <Text style={[styles.tldrMetricLabel, { color: theme.textSecondary }]}>The "One Thing"</Text>
                      <Text style={[styles.tldrMetricValue, { color: '#208AEF' }]} numberOfLines={1}>
                        {theOneThing}
                      </Text>
                    </View>
                    <View style={styles.tldrMetric}>
                      <Text style={[styles.tldrMetricLabel, { color: theme.textSecondary }]}>Buffer Time</Text>
                      <Text style={[styles.tldrMetricValue, { color: theme.text }]}>~{totalBufferHours}h</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Tab Navigator */}
              <View style={styles.tabContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {rollingDays.map((day, idx) => (
                    <Pressable
                      key={day.dateStr}
                      onPress={() => {
                        setSelectedTab(idx);
                        setSelectedDateStr(day.dateStr);
                      }}
                      style={[
                        styles.tabButton,
                        selectedTab === idx && [styles.activeTab, { backgroundColor: theme.backgroundSelected }],
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabButtonText,
                          { color: selectedTab === idx ? theme.text : theme.textSecondary },
                          selectedTab === idx && styles.activeTabText,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      setSelectedTab('all');
                      setSelectedDateStr(null);
                    }}
                    style={[
                      styles.tabButton,
                      selectedTab === 'all' && [styles.activeTab, { backgroundColor: theme.backgroundSelected }],
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        { color: selectedTab === 'all' ? theme.text : theme.textSecondary },
                        selectedTab === 'all' && styles.activeTabText,
                      ]}
                    >
                      All Items
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>

              {/* Events Schedule List */}
              <View style={styles.listContainer}>
                {filteredEvents.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      No reminders scheduled for this day
                    </Text>
                  </View>
                ) : (
                  <View style={styles.timelineContainer}>
                    {filteredEvents.map((event, index) => {
                      const dotColor = getTimelineColor(event.time);
                      const blockLabel = getTimelineLabel(event.time);
                      const isLast = index === filteredEvents.length - 1;
                      const isClickedDate = selectedDateStr && event.date === selectedDateStr;
                      const hasConflict = hasScheduleConflict(event, events);
                      
                      return (
                        <View key={event.id} style={styles.timelineRow}>
                          {/* Time Column */}
                          <View style={styles.timeColumn}>
                            <Text style={[styles.timeText, { color: theme.text }]}>
                              {formatTime12h(event.time).split(' ')[0]}
                            </Text>
                            <Text style={[styles.ampmText, { color: theme.textSecondary }]}>
                              {formatTime12h(event.time).split(' ')[1]}
                            </Text>
                          </View>

                          {/* Timeline Tracker Column */}
                          <View style={styles.trackerColumn}>
                            <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: theme.background }]} />
                            {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.textSecondary + '20' }]} />}
                          </View>

                          {/* Content Column */}
                          <View style={[
                            styles.contentColumn, 
                            { backgroundColor: theme.backgroundElement },
                            isClickedDate && { borderWidth: 1.5, borderColor: '#208AEF' }
                          ]}>
                            <View style={styles.cardHeader}>
                              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                                {event.title}
                              </Text>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.cardDeleteBtn,
                                  pressed && styles.pressed,
                                ]}
                                onPress={() => handleDeleteEvent(event.id)}
                              >
                                <Text style={styles.cardDeleteBtnText}>🗑️</Text>
                              </Pressable>
                            </View>

                            <Text style={[styles.cardTimeRangeText, { color: theme.textSecondary }]}>
                              🕒 {event.rawTime || formatTime12h(event.time)}
                            </Text>

                            {event.faculty && (
                              <Text style={[styles.cardFacultyText, { color: theme.textSecondary }]}>
                                👤 Instructor: {event.faculty}
                              </Text>
                            )}

                            {event.venue && (
                              <View style={styles.venueBadge}>
                                <Text style={styles.venueBadgeText}>📍 {event.venue}</Text>
                              </View>
                            )}

                            {event.description && event.description !== event.faculty ? (
                              <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                                {event.description}
                              </Text>
                            ) : null}

                            <View style={styles.cardFooter}>
                              {/* Time period block tag */}
                              <View style={[styles.periodBadge, { backgroundColor: dotColor + '15' }]}>
                                <Text style={[styles.periodBadgeText, { color: dotColor }]}>
                                  {blockLabel}
                                </Text>
                              </View>

                              {/* Cognitive category tag */}
                              {event.category && (
                                <View style={[styles.periodBadge, { backgroundColor: dotColor + '10' }]}>
                                  <Text style={[styles.periodBadgeText, { color: dotColor }]}>
                                    {event.category === 'Deep Work' && '🧠 '}
                                    {event.category === 'Collaborative' && '🤝 '}
                                    {event.category === 'Administrative' && '⚙️ '}
                                    {event.category === 'Wrap-up' && '📊 '}
                                    {event.category}
                                  </Text>
                                </View>
                              )}
                              
                              {/* Reminder offset tag */}
                              <View style={styles.reminderInfoBadge}>
                                <Text style={[styles.reminderInfoText, { color: theme.textSecondary }]}>
                                  🔔 {event.reminderMinutesBefore}m before
                                </Text>
                              </View>
                            </View>

                            {event.date && (
                              <Text style={[styles.eventDateTag, { color: theme.textSecondary }]}>
                                📅 {formatFriendlyDate(event.date)}
                              </Text>
                            )}
                            
                            {event.date && selectedTab !== 'all' && (
                              <View style={styles.oneOffBadge}>
                                <Text style={styles.oneOffBadgeText}>One-off Date</Text>
                              </View>
                            )}

                            {/* Overlap Conflict warning */}
                            {hasConflict && (
                              <View style={styles.conflictBadge}>
                                <Text style={styles.conflictBadgeText}>⚠️ Overlap Conflict</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

            {/* Bulk Action Controls */}
            {events.length > 0 && (
              <View style={styles.footerActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={clearAllEventsAndNotifications}
                >
                  <Text style={styles.clearButtonText}>Clear Timetable Alarms</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Desktop Side Panel */}
          {isLargeScreen && (
            <View style={styles.sideColumn}>
              {events.length > 0 ? (
                <CalendarPreview
                  events={events}
                  selectedDate={selectedDateStr}
                  onSelectDate={handleSelectDate}
                  theme={theme}
                />
              ) : (
                <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.infoTitle, { color: theme.text }]}>📅 Schedule Calendar</Text>
                  <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                    Upload your schedule file to see a monthly calendar preview with task dot highlights right here.
                  </Text>
                </View>
              )}

              {/* Side Guide Card */}
              <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, marginTop: Spacing.three }]}>
                <Text style={[styles.infoTitle, { color: theme.text }]}>⌚ Noise Watch Sync</Text>
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                  Keep the NoiseFit app running in the background and ensure "System Notification Mirroring" is enabled. Alarms scheduled here will display as watch notifications.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

        {/* Hidden PDF Parser WebView */}
        {pdfBase64 && (
          <PDFParserWebView
            pdfBase64={pdfBase64}
            onTextExtracted={handlePdfTextExtracted}
            onError={handlePdfParseError}
            onFinishedProcessing={() => setPdfBase64(null)}
          />
        )}

        {/* Import Choice & Routine Preview Modal */}
        {modalVisible && (() => {
          const todayStr = getTodayDateString();
          const activePendingEvents = filterPastEvents 
            ? pendingEvents.filter(e => !e.date || !isPastDate(e.date, todayStr))
            : pendingEvents;
          const pastEventsCount = pendingEvents.length - activePendingEvents.length;

          const pendingDates = Array.from(new Set(activePendingEvents.map(e => e.date).filter(Boolean))).sort();
          const startDateLabel = pendingDates[0] || 'Today';
          const endDateLabel = pendingDates.length > 1 ? pendingDates[pendingDates.length - 1] : startDateLabel;

          return (
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>🔍 Identified Routine & Dates</Text>
                
                <View style={styles.previewMetaBox}>
                  <Text style={[styles.previewMetaLabel, { color: theme.textSecondary }]}>
                    📅 Date Range: <Text style={{ color: theme.text, fontWeight: '700' }}>{startDateLabel} → {endDateLabel}</Text>
                  </Text>
                  <Text style={[styles.previewMetaLabel, { color: theme.textSecondary }]}>
                    📚 Active/Upcoming Classes: <Text style={{ color: '#208AEF', fontWeight: '700' }}>{activePendingEvents.length} Sessions</Text>
                  </Text>
                  {pastEventsCount > 0 && filterPastEvents && (
                    <Text style={[styles.previewMetaLabel, { color: '#E53935', fontWeight: '600' }]}>
                      🧹 Outdated Past Events: <Text style={{ fontWeight: '700' }}>{pastEventsCount} Sessions (Auto-deleted)</Text>
                    </Text>
                  )}
                </View>

                {/* Real-time Past Date Filter Toggle */}
                <Pressable
                  style={({ pressed }) => [
                    styles.pastFilterToggleRow,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setFilterPastEvents(!filterPastEvents)}
                >
                  <Text style={[styles.pastFilterToggleText, { color: filterPastEvents ? '#208AEF' : theme.text }]}>
                    {filterPastEvents ? '✅ Real-Time Past Date Pruning (Active)' : '⚠️ Include Outdated Past Dates'}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>
                    {filterPastEvents ? `Auto-deletes ${pastEventsCount} outdated past events before ${todayStr}` : 'All past events will be kept'}
                  </Text>
                </Pressable>

                <Text style={[styles.previewSubTitle, { color: theme.text }]}>Class Schedule Routine Preview:</Text>
                
                <ScrollView style={styles.previewListScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                  {activePendingEvents.map((item, idx) => (
                    <View key={idx} style={styles.previewRowItem}>
                      <View style={styles.previewRowTimeBadge}>
                        <Text style={styles.previewRowTimeText}>{item.time}</Text>
                        <Text style={styles.previewRowDateText}>{item.date || `Day ${item.dayOfWeek}`}</Text>
                      </View>
                      <View style={styles.previewRowContent}>
                        <Text style={[styles.previewRowTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                        {item.description ? (
                          <Text style={[styles.previewRowDesc, { color: theme.textSecondary }]} numberOfLines={1}>{item.description}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.modalButtons}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      styles.appendBtn,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleAppendConfirm}
                  >
                    <Text style={styles.modalBtnText}>Append to Current</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      styles.replaceBtn,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleReplaceConfirm}
                  >
                    <Text style={styles.modalBtnText}>Replace Current</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalBtn,
                      styles.cancelBtn,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      setModalVisible(false);
                      setLoading(false);
                    }}
                  >
                    <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })()}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  mainScrollView: {
    flex: 1,
    width: '100%',
  },
  mainScrollContent: {
    paddingBottom: 100,
    paddingHorizontal: Spacing.two,
  },
  header: {
    marginVertical: Spacing.three,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: Spacing.one,
    textAlign: 'center',
  },
  permissionBanner: {
    backgroundColor: '#FFF2CC',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#FFE599',
    marginBottom: Spacing.three,
    alignItems: 'center',
  },
  permissionText: {
    color: '#7F6000',
    fontWeight: 'bold',
    fontSize: 13,
  },
  uploadCard: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.four,
    borderWidth: 1.5,
    borderColor: 'rgba(32, 138, 239, 0.15)',
    borderStyle: 'dashed',
  },
  uploadLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadDesc: {
    fontSize: 12,
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
  },
  uploadButton: {
    backgroundColor: '#208AEF',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tabContainer: {
    marginBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  tabsScroll: {
    flexDirection: 'row',
  },
  tabButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginRight: Spacing.one,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#208AEF',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.three,
  },
  emptyContainer: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  eventCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
    justifyContent: 'space-between',
  },
  eventInfo: {
    flex: 1,
    paddingRight: Spacing.three,
  },
  eventTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.one,
    gap: Spacing.two,
  },
  eventTime: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  reminderBadge: {
    backgroundColor: 'rgba(32, 138, 239, 0.1)',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  reminderBadgeText: {
    color: '#208AEF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventDesc: {
    fontSize: 13,
    marginTop: Spacing.half,
  },
  eventDateTag: {
    fontSize: 11,
    marginTop: Spacing.one,
    fontStyle: 'italic',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
  },
  footerActions: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  clearButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  clearButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    padding: Spacing.four,
  },
  modalContent: {
    width: '90%',
    maxWidth: 380,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: Spacing.two,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    marginBottom: Spacing.four,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButtons: {
    gap: Spacing.two,
  },
  modalBtn: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  replaceBtn: {
    backgroundColor: '#FF3B30',
  },
  appendBtn: {
    backgroundColor: '#208AEF',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
  },
  oneOffBadge: {
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  oneOffBadgeText: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: 'bold',
  },
  conflictBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  conflictBadgeText: {
    color: '#FF3B30',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timelineContainer: {
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three,
    marginTop: Spacing.three,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 100,
  },
  timeColumn: {
    width: 65,
    alignItems: 'flex-end',
    paddingRight: Spacing.two,
    paddingTop: Spacing.two,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '700',
  },
  ampmText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  trackerColumn: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    zIndex: 2,
    marginTop: Spacing.two + 4,
  },
  timelineLine: {
    position: 'absolute',
    top: 28,
    bottom: -12,
    width: 2,
    zIndex: 1,
  },
  contentColumn: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.one,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  cardTimeRangeText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: Spacing.half,
  },
  cardDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDeleteBtnText: {
    fontSize: 12,
  },
  cardDesc: {
    fontSize: 13,
    marginTop: Spacing.half,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    flexWrap: 'wrap',
  },
  periodBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  periodBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  reminderInfoBadge: {
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  reminderInfoText: {
    fontSize: 9,
    fontWeight: '600',
  },
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  mobileLayout: {
    flex: 1,
    width: '100%',
  },
  mainColumn: {
    flex: 1.8,
    height: '100%',
  },
  sideColumn: {
    flex: 1,
    minWidth: 320,
    maxWidth: 360,
    height: '100%',
  },
  fullWidthColumn: {
    flex: 1,
    width: '100%',
  },
  mobileCalendarContainer: {
    marginBottom: Spacing.three,
  },
  infoCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.1)',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  settingsCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.1)',
    marginBottom: Spacing.three,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: Spacing.half,
  },
  settingsDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one + 2,
  },
  pillButton: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 4,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activePill: {
    borderColor: '#208AEF',
    borderWidth: 1.5,
  },
  activePillText: {
    fontWeight: 'bold',
  },
  tldrCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.15)',
    marginBottom: Spacing.three,
  },
  tldrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  tldrTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  tldrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  tldrMetric: {
    flex: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
    padding: Spacing.two,
    borderRadius: Spacing.one + 4,
  },
  tldrMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  tldrMetricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardFacultyText: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
    fontWeight: '500',
  },
  venueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(32, 138, 239, 0.12)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginVertical: 4,
  },
  venueBadgeText: {
    color: '#208AEF',
    fontSize: 11,
    fontWeight: '600',
  },
  previewMetaBox: {
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    padding: Spacing.two,
    borderRadius: Spacing.one + 4,
    marginBottom: Spacing.two,
    gap: 4,
  },
  previewMetaLabel: {
    fontSize: 12,
  },
  pastFilterToggleRow: {
    padding: Spacing.two,
    borderRadius: Spacing.one + 4,
    borderWidth: 1,
    borderColor: 'rgba(32, 138, 239, 0.3)',
    backgroundColor: 'rgba(32, 138, 239, 0.05)',
    marginBottom: Spacing.two,
  },
  pastFilterToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  previewSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  previewListScroll: {
    maxHeight: 180,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.15)',
    borderRadius: Spacing.one + 4,
    padding: Spacing.one,
  },
  previewRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.1)',
    gap: Spacing.two,
  },
  previewRowTimeBadge: {
    backgroundColor: '#208AEF',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 75,
  },
  previewRowTimeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  previewRowDateText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 9,
  },
  previewRowContent: {
    flex: 1,
  },
  previewRowTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewRowDesc: {
    fontSize: 10,
  },
  declutterButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
  },
  declutterButtonActive: {
    backgroundColor: '#208AEF',
    borderColor: '#208AEF',
  },
  declutterText: {
    fontSize: 11,
    fontWeight: '600',
  },
  resetAppButton: {
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
    backgroundColor: 'rgba(255, 59, 48, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetAppButtonText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
