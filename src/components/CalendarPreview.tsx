import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ScheduleEvent } from '../types';
import { GenZFonts } from '../constants/theme';

interface CalendarPreviewProps {
  events: ScheduleEvent[];
  selectedDate: string | null; // YYYY-MM-DD
  onSelectDate: (dateStr: string | null) => void;
  theme: any;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarPreview({
  events,
  selectedDate,
  onSelectDate,
  theme
}: CalendarPreviewProps) {
  const [navDate, setNavDate] = useState(new Date());

  const year = navDate.getFullYear();
  const month = navDate.getMonth();

  // Navigation handlers
  const handlePrevMonth = () => {
    setNavDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setNavDate(new Date(year, month + 1, 1));
  };

  // Get first day of month (adjusted so Monday = 0, Sunday = 6)
  const firstDay = new Date(year, month, 1);
  let startDayIndex = firstDay.getDay();
  startDayIndex = startDayIndex === 0 ? 6 : startDayIndex - 1;

  // Total days in current month
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Generate date cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDayIndex; i++) {
    cells.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    cells.push(i);
  }

  // Format date helper
  const formatDateString = (day: number) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Check if a day has scheduled events
  const getDayStatus = (day: number) => {
    const dateStr = formatDateString(day);
    const hasEvent = events.some(e => e.date === dateStr);
    return { hasEvent };
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {/* Calendar Header */}
      <View style={styles.header}>
        <Pressable onPress={handlePrevMonth} style={styles.navBtn}>
          <Text style={[styles.navBtnText, { color: theme.text }]}>◀</Text>
        </Pressable>
        <Text style={[styles.monthLabel, { color: theme.text }]}>
          {MONTHS[month]} {year}
        </Text>
        <Pressable onPress={handleNextMonth} style={styles.navBtn}>
          <Text style={[styles.navBtnText, { color: theme.text }]}>▶</Text>
        </Pressable>
      </View>

      {/* Weekday Labels */}
      <View style={styles.weekdaysGrid}>
        {WEEKDAYS.map((day, idx) => (
          <Text key={idx} style={[styles.weekdayLabel, { color: theme.textSecondary }]}>
            {day}
          </Text>
        ))}
      </View>

      {/* Days Grid */}
      <View style={styles.daysGrid}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }

          const cellDateStr = formatDateString(day);
          const isSelected = selectedDate === cellDateStr;
          const { hasEvent } = getDayStatus(day);

          return (
            <Pressable
              key={`day-${day}`}
              onPress={() => {
                if (isSelected) {
                  onSelectDate(null);
                } else {
                  onSelectDate(cellDateStr);
                }
              }}
              style={({ pressed }) => [
                styles.dayCell,
                isSelected && [styles.selectedDayCell, { backgroundColor: theme.backgroundSelected }],
                pressed && styles.pressed
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: theme.text },
                  isSelected && styles.selectedDayText
                ]}
              >
                {day}
              </Text>
              
              {/* Event indicators */}
              <View style={styles.indicatorContainer}>
                {hasEvent && (
                  <View style={[styles.dotIndicator, { backgroundColor: '#208AEF' }]} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Calendar Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF8E8E' }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary, fontFamily: 'var(--font-ginto)' }]}>Scheduled session</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#18181B',
    shadowColor: '#18181B',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: GenZFonts.glofiumChunky,
    letterSpacing: 0.5,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF384',
    borderWidth: 2,
    borderColor: '#18181B',
  },
  navBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#18181B',
  },
  weekdaysGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '900',
    fontFamily: GenZFonts.offBitMono,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 1,
    position: 'relative',
  },
  selectedDayCell: {
    borderWidth: 2,
    borderColor: '#18181B',
    backgroundColor: '#FFF384',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: GenZFonts.gintoBody,
  },
  selectedDayText: {
    fontWeight: '900',
    fontFamily: GenZFonts.chunkoBold,
    color: '#18181B',
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 2,
    flexDirection: 'row',
    gap: 2,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF8E8E',
    borderWidth: 1,
    borderColor: '#18181B',
  },
  pressed: {
    opacity: 0.8,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(24, 24, 27, 0.1)',
    paddingTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#18181B',
  },
  legendText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
