import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { dayVisualState, isDateRangeAvailable, type ListingAvailabilityRow } from '@/lib/listingAvailability';
import { compareIsoDate } from '@/lib/listingAvailabilityDates';
import { showFeedbackToast } from '@/store/feedbackToastStore';

import { CalendarMonthGrid } from './CalendarMonthGrid';
import type { RangeEdgeRole } from './CalendarDayCell';

type MonthItem = { year: number; month: number; key: string };

function enumerateMonths(monthsBack: number, monthsForward: number): MonthItem[] {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  const total = monthsBack + monthsForward + 1;
  const out: MonthItem[] = [];
  for (let i = 0; i < total; i++) {
    out.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      key: `${d.getFullYear()}-${d.getMonth()}`,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function rangeRoleFor(iso: string, start: string | null, end: string | null): RangeEdgeRole {
  if (!start) return 'none';
  if (!end) return compareIsoDate(iso, start) === 0 ? 'single' : 'none';
  if (compareIsoDate(iso, start) < 0 || compareIsoDate(iso, end) > 0) return 'none';
  if (start === end) return 'single';
  if (iso === start) return 'start';
  if (iso === end) return 'end';
  return 'middle';
}

export type ListingDateRangePickerProps = {
  listingId: string;
  rows: ListingAvailabilityRow[];
  startDate: string | null;
  endDate: string | null;
  onChange: (start: string | null, end: string | null) => void;
  ignoreOfferId?: string | null;
  /** Tighter cells (e.g. offer wizard) — same availability logic as full calendar. */
  dense?: boolean;
};

/**
 * Scrollable months + inclusive range selection (anchor, then end).
 */
export function ListingDateRangePicker({
  listingId,
  rows,
  startDate,
  endDate,
  onChange,
  ignoreOfferId,
  dense = false,
}: ListingDateRangePickerProps) {
  const months = useMemo(() => enumerateMonths(1, 18), []);
  const initialY = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    const idx = months.findIndex((m) => m.key === key);
    return Math.max(0, idx) * 360;
  }, [months]);

  const onPressDay = useCallback(
    (iso: string) => {
      if (startDate == null || (startDate != null && endDate != null)) {
        onChange(iso, null);
        return;
      }
      const lo = compareIsoDate(iso, startDate) < 0 ? iso : startDate;
      const hi = compareIsoDate(iso, startDate) < 0 ? startDate : iso;
      if (!isDateRangeAvailable(lo, hi, rows, { ignoreOfferId: ignoreOfferId ?? undefined })) {
        showFeedbackToast('Those dates aren’t available.');
        return;
      }
      onChange(lo, hi);
    },
    [startDate, endDate, rows, ignoreOfferId, onChange]
  );

  const getDayVisual = useCallback(
    (iso: string) => dayVisualState(iso, rows, { ignoreOfferId: ignoreOfferId ?? undefined }),
    [rows, ignoreOfferId]
  );
  const getRangeRole = useCallback(
    (iso: string) => rangeRoleFor(iso, startDate, endDate),
    [startDate, endDate]
  );

  return (
    <View style={styles.wrap} key={listingId}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: initialY }}
        keyboardShouldPersistTaps="handled"
      >
        {months.map((item) => (
          <CalendarMonthGrid
            key={item.key}
            year={item.year}
            monthIndex0={item.month}
            getDayVisual={getDayVisual}
            getRangeRole={getRangeRole}
            disablePast
            onPressDay={onPressDay}
            selectionMode="renterRange"
            dense={dense}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusInput,
    overflow: 'hidden',
    minHeight: 360,
  },
});
