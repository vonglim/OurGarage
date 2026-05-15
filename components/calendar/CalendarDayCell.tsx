import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type { DayAvailabilityVisual } from '@/lib/listingAvailability';
import { isoDateFromLocalDate } from '@/lib/listingAvailabilityDates';

export type RangeEdgeRole = 'none' | 'single' | 'start' | 'end' | 'middle';

export type CalendarDayCellProps = {
  dayIso: string | null;
  visual: DayAvailabilityVisual | 'outside';
  rangeRole: RangeEdgeRole;
  isToday: boolean;
  disabled: boolean;
  onPress?: (iso: string) => void;
  /** Tighter cell for embedded read-only month previews. */
  compact?: boolean;
};

function accessibilityStateLabel(visual: DayAvailabilityVisual | 'outside'): string {
  if (visual === 'outside') return '';
  if (visual === 'booked') return 'Booked, unavailable';
  if (visual === 'pending') return 'Pending hold';
  if (visual === 'blocked') return 'Blocked by host';
  return 'Open';
}

export function CalendarDayCell({
  dayIso,
  visual,
  rangeRole,
  isToday,
  disabled,
  onPress,
  compact = false,
}: CalendarDayCellProps) {
  if (dayIso == null) {
    return <View style={[styles.cell, compact && styles.cellCompact, styles.cellEmpty]} />;
  }

  const todayStr = isoDateFromLocalDate(new Date());
  const todayRing = isToday || dayIso === todayStr;

  const onPressWrapped = () => {
    if (disabled || !onPress) return;
    onPress(dayIso);
  };

  const showSoftRange =
    rangeRole === 'middle' || rangeRole === 'start' || rangeRole === 'end' || rangeRole === 'single';

  const n = Number(dayIso.slice(8, 10));
  const pendingShell = visual === 'pending';
  const strikeBooked = visual === 'booked';
  const strikeBlocked = visual === 'blocked';

  const useMutedDisabled = disabled && !pendingShell && !strikeBooked && !strikeBlocked;

  const dayNumStyles = [
    styles.dayNum,
    compact && styles.dayNumCompact,
    useMutedDisabled && styles.dayNumDisabled,
    pendingShell && styles.dayNumPending,
    strikeBooked && styles.dayNumBookedStrike,
    strikeBlocked && styles.dayNumBlockedStrike,
  ];

  const a11y =
    visual === 'outside' ? undefined : `${dayIso}. ${accessibilityStateLabel(visual)}${disabled ? ', not selectable' : ''}`;

  return (
    <Pressable
      onPress={onPressWrapped}
      disabled={disabled || !onPress}
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: disabled || !onPress }}
      style={({ pressed }) => [
        styles.cell,
        compact && styles.cellCompact,
        showSoftRange && styles.cellInRange,
        rangeRole === 'start' && styles.rangeLeft,
        rangeRole === 'end' && styles.rangeRight,
        rangeRole === 'single' && styles.rangeSingle,
        pressed && !disabled && onPress && styles.cellPressed,
      ]}
    >
      {todayRing ? <View style={[styles.todayRing, compact && styles.todayRingCompact]} pointerEvents="none" /> : null}
      <View style={[styles.dayCenter, compact && styles.dayCenterCompact]}>
        {pendingShell ? (
          <View style={[styles.pendingPill, compact && styles.pendingPillCompact]}>
            <Text style={dayNumStyles}>{n}</Text>
          </View>
        ) : strikeBooked || strikeBlocked ? (
          <View
            style={[
              styles.statePlate,
              compact && styles.statePlateCompact,
              strikeBooked && styles.statePlateBooked,
              strikeBlocked && styles.statePlateBlocked,
            ]}
          >
            <Text style={dayNumStyles}>{n}</Text>
          </View>
        ) : (
          <Text style={dayNumStyles}>{n}</Text>
        )}
      </View>
    </Pressable>
  );
}

const CELL_MIN_H = 46;
const CELL_MIN_H_COMPACT = 22;

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    minHeight: CELL_MIN_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  cellCompact: {
    minHeight: CELL_MIN_H_COMPACT,
    paddingVertical: 0,
  },
  cellEmpty: {
    opacity: 0,
  },
  cellInRange: {
    backgroundColor: 'rgba(51, 65, 85, 0.08)',
  },
  rangeLeft: {
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  rangeRight: {
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  rangeSingle: {
    borderRadius: 12,
  },
  cellPressed: {
    opacity: 0.88,
  },
  todayRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(51, 65, 85, 0.38)',
    marginHorizontal: 1,
    marginVertical: 2,
  },
  todayRingCompact: {
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 0,
    marginVertical: 1,
  },
  dayCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    minHeight: 28,
  },
  dayCenterCompact: {
    minWidth: 22,
    minHeight: 20,
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  dayNumCompact: {
    fontSize: 12,
    minWidth: 20,
  },
  dayNumDisabled: {
    color: ui.textSecondary,
    opacity: 0.45,
  },
  /** Pending: neutral “held” pill — no yellow dot. */
  dayNumPending: {
    color: ui.textPrimary,
    fontWeight: '600',
  },
  /** Booked: strong red strikethrough; text stays dark for contrast. */
  dayNumBookedStrike: {
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
    textDecorationColor: '#B91C1C',
    color: ui.textPrimary,
  },
  /** Blocked: softer gray strikethrough vs booked. */
  dayNumBlockedStrike: {
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
    textDecorationColor: 'rgba(100, 116, 139, 0.95)',
    color: 'rgba(71, 85, 105, 0.92)',
  },
  pendingPill: {
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(100, 116, 139, 0.22)',
  },
  pendingPillCompact: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statePlate: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statePlateCompact: {
    borderRadius: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  statePlateBooked: {
    backgroundColor: 'rgba(220, 38, 38, 0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.14)',
  },
  statePlateBlocked: {
    backgroundColor: 'rgba(71, 85, 105, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(100, 116, 139, 0.2)',
  },
});
