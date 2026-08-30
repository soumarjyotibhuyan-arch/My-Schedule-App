import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  useColorScheme,
  Platform,
} from 'react-native';
import { ScheduleEvent } from '../types';
import { Colors, Spacing, GenZFonts } from '../constants/theme';

interface ParseResultPreviewProps {
  visible: boolean;
  events: ScheduleEvent[];
  layoutType: string;
  confidence: number;
  parserName: string;
  onCancel: () => void;
  onConfirm: (finalEvents: ScheduleEvent[], options: { isRecurring: boolean; defaultReminder: number }) => void;
}

const DAYS_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ParseResultPreview({
  visible,
  events: initialEvents,
  layoutType,
  confidence,
  parserName,
  onCancel,
  onConfirm,
}: ParseResultPreviewProps) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  const [events, setEvents] = useState<ScheduleEvent[]>(initialEvents);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editFaculty, setEditFaculty] = useState('');
  const [editDay, setEditDay] = useState(1);

  // Defaults: if layout has a specific date, assume one-off. Otherwise recurring.
  const hasDates = initialEvents.some((e) => !!e.date);
  const [isRecurring, setIsRecurring] = useState(!hasDates);
  const [defaultReminder, setDefaultReminder] = useState(5);

  React.useEffect(() => {
    setEvents(initialEvents);
    setIsRecurring(!initialEvents.some((e) => !!e.date));
  }, [initialEvents]);

  const handleRemoveEvent = (id: string) => {
    setEvents(events.filter((e) => e.id !== id));
  };

  const handleStartEdit = (event: ScheduleEvent) => {
    setEditingEventId(event.id);
    setEditTitle(event.title);
    setEditTime(event.time);
    setEditVenue(event.venue || '');
    setEditFaculty(event.faculty || '');
    setEditDay(event.dayOfWeek || 1);
  };

  const handleSaveEdit = () => {
    setEvents(
      events.map((e) => {
        if (e.id === editingEventId) {
          return {
            ...e,
            title: editTitle,
            time: editTime,
            venue: editVenue || undefined,
            faculty: editFaculty || undefined,
            dayOfWeek: editDay,
          };
        }
        return e;
      })
    );
    setEditingEventId(null);
  };

  const handleBatchReminder = (mins: number) => {
    setDefaultReminder(mins);
    setEvents(events.map((e) => ({ ...e, reminderMinutesBefore: mins })));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.container, { backgroundColor: theme.background, borderColor: theme.borderDark }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text, fontFamily: GenZFonts.chunkoBold }]}>
              📋 Review Timetable
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: GenZFonts.gintoBody }]}>
              Parser: <Text style={{ fontWeight: 'bold' }}>{parserName}</Text> ({layoutType} - {confidence}% conf)
            </Text>
          </View>

          {/* Settings Section */}
          <View style={[styles.settingsRow, { borderBottomColor: theme.borderDark }]}>
            <View style={styles.settingBlock}>
              <Text style={[styles.label, { color: theme.text, fontFamily: GenZFonts.chunkoBold }]}>
                Alarm Lead Time
              </Text>
              <View style={styles.buttonGroup}>
                {[5, 10, 15, 30].map((mins) => (
                  <Pressable
                    key={mins}
                    onPress={() => handleBatchReminder(mins)}
                    style={[
                      styles.minButton,
                      {
                        backgroundColor: defaultReminder === mins ? theme.backgroundSelected : 'transparent',
                        borderColor: theme.borderDark,
                      },
                    ]}
                  >
                    <Text style={[styles.minText, { color: theme.text, fontFamily: GenZFonts.gintoBody }]}>
                      {mins}m
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingBlock}>
              <Text style={[styles.label, { color: theme.text, fontFamily: GenZFonts.chunkoBold }]}>
                Recurrence Type
              </Text>
              <View style={styles.buttonGroup}>
                <Pressable
                  onPress={() => setIsRecurring(true)}
                  style={[
                    styles.minButton,
                    {
                      backgroundColor: isRecurring ? theme.backgroundSelected : 'transparent',
                      borderColor: theme.borderDark,
                    },
                  ]}
                >
                  <Text style={[styles.minText, { color: theme.text, fontFamily: GenZFonts.gintoBody }]}>
                    🔁 Weekly
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsRecurring(false)}
                  style={[
                    styles.minButton,
                    {
                      backgroundColor: !isRecurring ? theme.backgroundSelected : 'transparent',
                      borderColor: theme.borderDark,
                    },
                  ]}
                >
                  <Text style={[styles.minText, { color: theme.text, fontFamily: GenZFonts.gintoBody }]}>
                    📅 Specific
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* List of events */}
          <ScrollView style={styles.listContainer}>
            {events.map((event) => {
              const isEditing = editingEventId === event.id;
              return (
                <View
                  key={event.id}
                  style={[
                    styles.eventCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.borderDark,
                    },
                  ]}
                >
                  {isEditing ? (
                    <View style={styles.editForm}>
                      <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.borderDark }]}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="Subject/Class Title"
                        placeholderTextColor={theme.textSecondary}
                      />
                      <View style={styles.inlineInputs}>
                        <TextInput
                          style={[styles.input, styles.timeInput, { color: theme.text, borderColor: theme.borderDark }]}
                          value={editTime}
                          onChangeText={setEditTime}
                          placeholder="Time (e.g. 09:00)"
                          placeholderTextColor={theme.textSecondary}
                        />
                        <View style={styles.daySelectorContainer}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {DAYS_NAMES.map((d, index) => (
                              <Pressable
                                key={d}
                                onPress={() => setEditDay(index + 1)}
                                style={[
                                  styles.daySelectChip,
                                  {
                                    backgroundColor: editDay === index + 1 ? theme.backgroundSelected : 'transparent',
                                    borderColor: theme.borderDark,
                                  },
                                ]}
                              >
                                <Text style={{ color: theme.text, fontSize: 11 }}>{d.slice(0, 3)}</Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                      <View style={styles.inlineInputs}>
                        <TextInput
                          style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.borderDark }]}
                          value={editVenue}
                          onChangeText={setEditVenue}
                          placeholder="Venue / Room"
                          placeholderTextColor={theme.textSecondary}
                        />
                        <TextInput
                          style={[styles.input, { flex: 1, marginLeft: 8, color: theme.text, borderColor: theme.borderDark }]}
                          value={editFaculty}
                          onChangeText={setEditFaculty}
                          placeholder="Instructor"
                          placeholderTextColor={theme.textSecondary}
                        />
                      </View>
                      <View style={styles.actionButtons}>
                        <Pressable onPress={handleSaveEdit} style={[styles.actionBtn, { backgroundColor: theme.backgroundSelected }]}>
                          <Text style={{ color: theme.text, fontWeight: 'bold' }}>Save</Text>
                        </Pressable>
                        <Pressable onPress={() => setEditingEventId(null)} style={[styles.actionBtn, { backgroundColor: '#FF8E8E' }]}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.eventRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                        <View style={styles.metaRow}>
                          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                            🕒 {event.time} ({DAYS_NAMES[(event.dayOfWeek || 1) - 1]})
                          </Text>
                          {event.venue && (
                            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                              📍 {event.venue}
                            </Text>
                          )}
                          {event.faculty && (
                            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                              👨‍🏫 {event.faculty}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.iconButtons}>
                        <Pressable onPress={() => handleStartEdit(event)} style={styles.iconBtn}>
                          <Text style={{ fontSize: 18 }}>✏️</Text>
                        </Pressable>
                        <Pressable onPress={() => handleRemoveEvent(event.id)} style={styles.iconBtn}>
                          <Text style={{ fontSize: 18 }}>🗑️</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {events.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={{ color: theme.textSecondary, fontFamily: GenZFonts.gintoBody }}>
                  No classes parsed or remaining. Please try uploading again.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action CTAs */}
          <View style={styles.footer}>
            <Pressable
              onPress={onCancel}
              style={[styles.footerBtn, { backgroundColor: isDark ? '#332222' : '#FFF5F5', borderColor: '#FF8E8E' }]}
            >
              <Text style={{ color: '#FF8E8E', fontWeight: 'bold' }}>Discard</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(events, { isRecurring, defaultReminder })}
              disabled={events.length === 0}
              style={[
                styles.footerBtn,
                styles.primaryBtn,
                { backgroundColor: theme.backgroundSelected, opacity: events.length === 0 ? 0.5 : 1 },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: 'bold' }}>Confirm & Sync</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  container: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 3,
    padding: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
    marginBottom: Spacing.three,
    borderBottomWidth: 1,
  },
  settingBlock: {
    flex: 1,
    minWidth: 150,
    marginVertical: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  buttonGroup: {
    flexDirection: 'row',
  },
  minButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    marginRight: 4,
  },
  minText: {
    fontSize: 11,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
    marginBottom: Spacing.three,
  },
  eventCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
  },
  iconButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  iconBtn: {
    padding: 6,
  },
  editForm: {
    width: '100%',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  inlineInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeInput: {
    width: 120,
    marginBottom: 0,
  },
  daySelectorContainer: {
    flex: 1,
    marginLeft: 8,
  },
  daySelectChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyContainer: {
    padding: Spacing.four,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    borderWidth: 0,
  },
});
