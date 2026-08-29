import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { AnalysisResult, ColumnMapping } from '../utils/columnMapper';
import { GenZFonts } from '../constants/theme';

interface ColumnMapperModalProps {
  analysis: AnalysisResult;
  onConfirm: (mapping: ColumnMapping, saveAsTemplate: boolean) => void;
  onCancel: () => void;
  theme: any;
}

export default function ColumnMapperModal({
  analysis,
  onConfirm,
  onCancel,
  theme,
}: ColumnMapperModalProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(analysis.mapping);
  const [rememberTemplate, setRememberTemplate] = useState<boolean>(true);

  const numCols = analysis.headers.length;
  const colOptions = Array.from({ length: numCols }, (_, i) => ({
    label: `${analysis.headers[i] || `Column ${i + 1}`} (Col ${i + 1})`,
    value: i,
  }));

  const handleSelectChange = (field: keyof ColumnMapping, val: number) => {
    setMapping(prev => ({ ...prev, [field]: val }));
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={[styles.modalCard, { backgroundColor: '#FFFFFF', borderColor: '#18181B' }]}>
        {/* Modal Header */}
        <Text style={[styles.title, { fontFamily: GenZFonts.chunkoBold }]}>
          ⚙️ COLUMN MAPPER & SCHEMA INSPECTOR
        </Text>
        
        {/* Confidence Score Badge */}
        <View
          style={[
            styles.confidenceBadge,
            {
              backgroundColor: analysis.confidenceScore >= 80 ? '#A7F3D0' : '#FFF384',
              borderColor: '#18181B',
            },
          ]}>
          <Text style={[styles.confidenceText, { fontFamily: GenZFonts.offBitMono }]}>
            🎯 Confidence Score: {analysis.confidenceScore}% {analysis.confidenceScore >= 80 ? '(High Confidence)' : '(Manual Check Advised)'}
          </Text>
        </View>

        <Text style={[styles.subtitle, { fontFamily: GenZFonts.gintoBody, color: '#52525B' }]}>
          Select which spreadsheet columns match your schedule fields below:
        </Text>

        <ScrollView style={styles.scrollArea} nestedScrollEnabled showsVerticalScrollIndicator={true}>
          {/* Mapping Controls */}
          <View style={styles.controlsGrid}>
            {/* Title Column */}
            <View style={styles.fieldBox}>
              <Text style={[styles.fieldLabel, { fontFamily: GenZFonts.glofiumChunky }]}>
                📚 Subject / Event Title Column:
              </Text>
              <View style={styles.pickerContainer}>
                {colOptions.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelectChange('titleColIndex', opt.value)}
                    style={[
                      styles.optionChip,
                      mapping.titleColIndex === opt.value && styles.activeOptionChip,
                    ]}>
                    <Text
                      style={[
                        styles.optionChipText,
                        mapping.titleColIndex === opt.value && styles.activeOptionChipText,
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Time Column */}
            <View style={styles.fieldBox}>
              <Text style={[styles.fieldLabel, { fontFamily: GenZFonts.glofiumChunky }]}>
                ⏰ Time Slot Column:
              </Text>
              <View style={styles.pickerContainer}>
                {colOptions.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelectChange('timeColIndex', opt.value)}
                    style={[
                      styles.optionChip,
                      mapping.timeColIndex === opt.value && styles.activeOptionChip,
                    ]}>
                    <Text
                      style={[
                        styles.optionChipText,
                        mapping.timeColIndex === opt.value && styles.activeOptionChipText,
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Date / Day Column */}
            <View style={styles.fieldBox}>
              <Text style={[styles.fieldLabel, { fontFamily: GenZFonts.glofiumChunky }]}>
                📅 Date / Day Column:
              </Text>
              <View style={styles.pickerContainer}>
                <Pressable
                  onPress={() => handleSelectChange('dateColIndex', -1)}
                  style={[
                    styles.optionChip,
                    mapping.dateColIndex === -1 && styles.activeOptionChip,
                  ]}>
                  <Text
                    style={[
                      styles.optionChipText,
                      mapping.dateColIndex === -1 && styles.activeOptionChipText,
                    ]}>
                    None / Not Included
                  </Text>
                </Pressable>
                {colOptions.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelectChange('dateColIndex', opt.value)}
                    style={[
                      styles.optionChip,
                      mapping.dateColIndex === opt.value && styles.activeOptionChip,
                    ]}>
                    <Text
                      style={[
                        styles.optionChipText,
                        mapping.dateColIndex === opt.value && styles.activeOptionChipText,
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Venue Column */}
            <View style={styles.fieldBox}>
              <Text style={[styles.fieldLabel, { fontFamily: GenZFonts.glofiumChunky }]}>
                📍 Venue / Room Location Column:
              </Text>
              <View style={styles.pickerContainer}>
                <Pressable
                  onPress={() => handleSelectChange('venueColIndex', -1)}
                  style={[
                    styles.optionChip,
                    mapping.venueColIndex === -1 && styles.activeOptionChip,
                  ]}>
                  <Text
                    style={[
                      styles.optionChipText,
                      mapping.venueColIndex === -1 && styles.activeOptionChipText,
                    ]}>
                    None / Not Included
                  </Text>
                </Pressable>
                {colOptions.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelectChange('venueColIndex', opt.value)}
                    style={[
                      styles.optionChip,
                      mapping.venueColIndex === opt.value && styles.activeOptionChip,
                    ]}>
                    <Text
                      style={[
                        styles.optionChipText,
                        mapping.venueColIndex === opt.value && styles.activeOptionChipText,
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Faculty Column */}
            <View style={styles.fieldBox}>
              <Text style={[styles.fieldLabel, { fontFamily: GenZFonts.glofiumChunky }]}>
                👨‍🏫 Faculty / Instructor Column:
              </Text>
              <View style={styles.pickerContainer}>
                <Pressable
                  onPress={() => handleSelectChange('facultyColIndex', -1)}
                  style={[
                    styles.optionChip,
                    mapping.facultyColIndex === -1 && styles.activeOptionChip,
                  ]}>
                  <Text
                    style={[
                      styles.optionChipText,
                      mapping.facultyColIndex === -1 && styles.activeOptionChipText,
                    ]}>
                    None / Not Included
                  </Text>
                </Pressable>
                {colOptions.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSelectChange('facultyColIndex', opt.value)}
                    style={[
                      styles.optionChip,
                      mapping.facultyColIndex === opt.value && styles.activeOptionChip,
                    ]}>
                    <Text
                      style={[
                        styles.optionChipText,
                        mapping.facultyColIndex === opt.value && styles.activeOptionChipText,
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Sample Rows Preview Table */}
          <Text style={[styles.previewSectionTitle, { fontFamily: GenZFonts.glofiumChunky }]}>
            🔍 Sample Rows Preview (File Top Rows):
          </Text>
          <ScrollView horizontal style={styles.tableScroll}>
            <View style={styles.tableBox}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                {analysis.headers.map((h, idx) => (
                  <Text key={idx} style={[styles.tableHeaderCell, { fontFamily: GenZFonts.offBitMono }]}>
                    {h || `Col ${idx + 1}`}
                  </Text>
                ))}
              </View>
              {/* Sample Rows */}
              {analysis.sampleRows.map((r, rIdx) => (
                <View key={rIdx} style={styles.tableDataRow}>
                  {analysis.headers.map((_, cIdx) => (
                    <Text key={cIdx} style={[styles.tableDataCell, { fontFamily: GenZFonts.gintoBody }]}>
                      {r[cIdx] || '-'}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Remember Template Checkbox Toggle */}
          <Pressable
            onPress={() => setRememberTemplate(!rememberTemplate)}
            style={styles.checkboxRow}>
            <View style={[styles.checkbox, rememberTemplate && styles.checkboxActive]}>
              {rememberTemplate ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={[styles.checkboxLabel, { fontFamily: GenZFonts.gintoBody }]}>
              🧠 Remember this template mapping for future uploads of this file layout
            </Text>
          </Pressable>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed]}
            onPress={() => onConfirm(mapping, rememberTemplate)}>
            <Text style={[styles.confirmBtnText, { fontFamily: GenZFonts.chunkoBold }]}>
              💾 APPLY SCHEMA & IMPORT TIMETABLE
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            onPress={onCancel}>
            <Text style={[styles.cancelBtnText, { fontFamily: GenZFonts.chunkoBold }]}>
              CANCEL
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24, 24, 27, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    padding: 16,
  },
  modalCard: {
    width: '95%',
    maxWidth: 580,
    maxHeight: '90%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 3,
    shadowColor: '#18181B',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
    color: '#18181B',
  },
  confidenceBadge: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    marginVertical: 8,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#18181B',
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  scrollArea: {
    maxHeight: 380,
    marginBottom: 16,
  },
  controlsGrid: {
    gap: 12,
    marginBottom: 16,
  },
  fieldBox: {
    backgroundColor: '#FFFBEA',
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#18181B',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    color: '#18181B',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#18181B',
    backgroundColor: '#FFFFFF',
  },
  activeOptionChip: {
    backgroundColor: '#FFF384',
    elevation: 2,
  },
  optionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52525B',
  },
  activeOptionChipText: {
    fontWeight: '900',
    color: '#18181B',
  },
  previewSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 6,
    color: '#18181B',
  },
  tableScroll: {
    marginBottom: 12,
  },
  tableBox: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#18181B',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF384',
    borderBottomWidth: 2,
    borderBottomColor: '#18181B',
  },
  tableHeaderCell: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 10,
    fontWeight: '900',
    minWidth: 110,
    color: '#18181B',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(24, 24, 27, 0.1)',
  },
  tableDataCell: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 11,
    minWidth: 110,
    color: '#18181B',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#E9D5FF',
    borderWidth: 2,
    borderColor: '#18181B',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#18181B',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#FFF384',
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '900',
    color: '#18181B',
  },
  checkboxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18181B',
    flex: 1,
  },
  actionButtons: {
    gap: 8,
  },
  confirmBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#18181B',
    backgroundColor: '#FFF384',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#18181B',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  confirmBtnText: {
    color: '#18181B',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cancelBtn: {
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#18181B',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#18181B',
    fontWeight: '900',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ translateY: 1 }],
  },
});
