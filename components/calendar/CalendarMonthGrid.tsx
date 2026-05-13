import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import type { DayAvailabilityVisual } from '@/lib/listingAvailability';
import { compareIsoDate, isoDateFromLocalDate, monthLabel } from '@/lib/listingAvailabilityDates';

import { CalendarDayCell, type RangeEdgeRole } from './CalendarDayCell';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export type CalendarMonthGridProps = {
  year: number;
  monthIndex0: number;
  /** Map day ISO → visual state (only days in this month need values; others can be 'outside'). */
  getDayVisual: (iso: string) => DayAvailabilityVisual | 'outside';
  getRangeRole: (iso: string) => RangeEdgeRole;
  minSelectableIso?: string | null;
  maxSelectableIso?: string | null;
  /** If set, days before today are disabled for range pickers. */
  disablePast?: boolean;
  onPressDay?: (iso: string) => void;
  /** `ownerDay`: host can tap blocked days to edit; booked/pending stay locked. */
  selectionMode?: 'renterRange' | 'ownerDay';
  /** Display-only: show availability colors without disabling blocked/booked styling. */
  readOnly?: boolean;
  /** Tighter month chrome for embedded previews. */
  dense?: boolean;
};

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function CalendarMonthGrid({
  year,
  monthIndex0,
  getDayVisual,
  getRangeRole,
  minSelectableIso,
  maxSelectableIso,
  disablePast,
  onPressDay,
  selectionMode = 'renterRange',
  readOnly = false,
  dense = false,
}: CalendarMonthGridProps) {
  const todayIso = isoDateFromLocalDate(new Date());
  const { dayCells } = useMemo(() => {
    const firstDow = new Date(year, monthIndex0, 1).getDay();
    const dim = daysInMonth(year, monthIndex0);
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) {
      const part = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(part);
    }
    return { dayCells: cells };
  }, [year, monthIndex0]);

  const rows: (string | null)[][] = useMemo(() => {
    const out: (string | null)[][] = [];
    let row: (string | null)[] = [];
    for (const c of dayCells) {
      row.push(c);
      if (row.length === 7) {
        out.push(row);
        row = [];
      }
    }
    if (row.length) {
      while (row.length < 7) row.push(null);
      out.push(row);
    }
    return out;
  }, [dayCells]);

  return (
    <View style={[styles.wrap, dense && styles.wrapDense]}>
      <Text style={[styles.monthTitle, dense && styles.monthTitleDense]}>{monthLabel(year, monthIndex0)}</Text>
      <View style={[styles.weekHeader, dense && styles.weekHeaderDense]}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`${w}-${i}`} style={[styles.weekHeaderCell, dense && styles.weekHeaderCellDense]}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((week, wi) => (
        <View key={`w-${wi}`} style={[styles.weekRow, dense && styles.weekRowDense]}>
          {week.map((iso, di) => {
            if (iso == null) {
              return (
                <CalendarDayCell
                  key={`e-${wi}-${di}`}
                  dayIso={null}
                  visual="outside"
                  rangeRole="none"
                  isToday={false}
                  disabled={true}
                  compact={dense}
                />
              );
            }
            const visual = getDayVisual(iso);
            const rangeRole = getRangeRole(iso);
            let disabled = false;
            if (readOnly) {
              disabled = false;
            } else {
              if (disablePast && compareIsoDate(iso, todayIso) < 0) disabled = true;
              if (minSelectableIso && compareIsoDate(iso, minSelectableIso) < 0) disabled = true;
              if (maxSelectableIso && compareIsoDate(iso, maxSelectableIso) > 0) disabled = true;
              if (visual === 'booked' || visual === 'pending') disabled = true;
              else if (selectionMode === 'renterRange' && visual === 'blocked') disabled = true;
            }
            return (
              <CalendarDayCell
                key={iso}
                dayIso={iso}
                visual={visual}
                rangeRole={rangeRole}
                isToday={iso === todayIso}
                disabled={disabled}
                onPress={onPressDay}
                compact={dense}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: ui.spaceMd,
    paddingHorizontal: ui.spaceSm,
    backgroundColor: '#FFFFFF',
  },
  wrapDense: {
    paddingTop: 2,
    paddingBottom: 0,
    paddingHorizontal: 1,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: ui.spaceSm,
    paddingHorizontal: 4,
  },
  monthTitleDense: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekHeaderDense: {
    marginBottom: 2,
  },
  weekHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  weekHeaderCellDense: {
    fontSize: 9,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  weekRowDense: {
    marginBottom: 0,
  },
});
