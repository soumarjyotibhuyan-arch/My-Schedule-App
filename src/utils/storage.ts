import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScheduleEvent } from '../types';
import { ColumnMapping } from './columnMapper';

const STORAGE_KEY = '@my_schedule_events';
const TEMPLATE_PREFIX = '@my_schedule_column_template_';

export async function saveEvents(events: ScheduleEvent[]): Promise<void> {
  try {
    const jsonValue = JSON.stringify(events);
    await AsyncStorage.setItem(STORAGE_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving events to AsyncStorage:', e);
  }
}

export async function getEvents(): Promise<ScheduleEvent[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error loading events from AsyncStorage:', e);
    return [];
  }
}

export async function clearEvents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing events from AsyncStorage:', e);
  }
}

export async function saveDefaultReminderOffset(offset: number): Promise<void> {
  try {
    await AsyncStorage.setItem('@default_reminder_offset', offset.toString());
  } catch (e) {
    console.error('Error saving default reminder offset:', e);
  }
}

export async function getDefaultReminderOffset(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem('@default_reminder_offset');
    return val != null ? parseInt(val, 10) : 5; 
  } catch (e) {
    console.error('Error loading default reminder offset:', e);
    return 5;
  }
}

// Smart Template Saving (Memory per User / File Fingerprint)
export async function saveColumnTemplate(fingerprint: string, mapping: ColumnMapping): Promise<void> {
  try {
    if (!fingerprint) return;
    const key = `${TEMPLATE_PREFIX}${fingerprint}`;
    await AsyncStorage.setItem(key, JSON.stringify(mapping));
  } catch (e) {
    console.error('Error saving column mapping template:', e);
  }
}

export async function getSavedColumnTemplate(fingerprint: string): Promise<ColumnMapping | null> {
  try {
    if (!fingerprint) return null;
    const key = `${TEMPLATE_PREFIX}${fingerprint}`;
    const val = await AsyncStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    console.error('Error retrieving saved column mapping template:', e);
    return null;
  }
}
