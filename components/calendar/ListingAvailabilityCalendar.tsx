import React, { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { dayVisualState, type ListingAvailabilityRow } from '@/lib/listingAvailability';
import { compareIsoDate } from '@/lib/listingAvailabilityDates';
import { hydrateListingAvailability, useListingAvailabilityStore } from '@/store/listingAvailabilityStore';

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
  if (!start || !end) return 'none';
  if (compareIsoDate(iso, start) < 0 || compareIsoDate(iso, end) > 0) return 'none';
  if (start === end) return 'single';
  if (iso === start) return 'start';
  if (iso === end) return 'end';
  return 'middle';
}

export type ListingAvailabilityCalendarProps = {
  listingId: string;
  highlightRange?: { start: string; end: string } | null;
  selectionMode?: 'renterRange' | 'ownerDay';
  onOwnerDayPress?: (iso: string, visual: ReturnType<typeof dayVisualState>) => void;
  rowsOverride?: ListingAvailabilityRow[] | null;
};

/**
 * Full vertical month scroller with availability coloring.
 */
export function ListingAvailabilityCalendar({
  listingId,
  highlightRange,
  selectionMode = 'ownerDay',
  onOwnerDayPress,
  rowsOverride,
}: ListingAvailabilityCalendarProps) {
  const lid = listingId.trim();
  const storeRows = useListingAvailabilityStore((s) => s.byListingId[lid] ?? []);
  const rows = rowsOverride ?? storeRows;
  const months = useMemo(() => enumerateMonths(1, 18), []);

  useEffect(() => {
    if (!lid) return;
    void hydrateListingAvailability(lid);
  }, [lid]);

  const initialY = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    const idx = months.findIndex((m) => m.key === key);
    return Math.max(0, idx) * 360;
  }, [months]);

  const getDayVisual = useCallback((iso: string) => dayVisualState(iso, rows), [rows]);

  const getRangeRole = useCallback(
    (iso: string) => {
      if (!highlightRange) return 'none' as RangeEdgeRole;
      return rangeRoleFor(iso, highlightRange.start, highlightRange.end);
    },
    [highlightRange]
  );

  const onPressDay =
    selectionMode === 'ownerDay' && onOwnerDayPress
      ? (iso: string) => onOwnerDayPress(iso, dayVisualState(iso, rows))
      : undefined;

  return (
    <View style={styles.wrap} key={lid}>
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
            disablePast={false}
            onPressDay={onPressDay}
            selectionMode={selectionMode}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    minHeight: 400,
  },
});
