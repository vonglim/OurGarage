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
};

export function CalendarDayCell({
  dayIso,
  visual,
  rangeRole,
  isToday,
  disabled,
  onPress,
}: CalendarDayCellProps) {
  if (dayIso == null) {
    return <View style={[styles.cell, styles.cellEmpty]} />;
  }

  const todayStr = isoDateFromLocalDate(new Date());
  const todayRing = isToday || dayIso === todayStr;

  const onPressWrapped = () => {
    if (disabled || !onPress) return;
    onPress(dayIso);
  };

  const showSoftRange =
    rangeRole === 'middle' || rangeRole === 'start' || rangeRole === 'end' || rangeRole === 'single';

  return (
    <Pressable
      onPress={onPressWrapped}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.cell,
        showSoftRange && styles.cellInRange,
        rangeRole === 'start' && styles.rangeLeft,
        rangeRole === 'end' && styles.rangeRight,
        rangeRole === 'single' && styles.rangeSingle,
        pressed && !disabled && onPress && styles.cellPressed,
      ]}
    >
      {todayRing ? <View style={styles.todayRing} pointerEvents="none" /> : null}
      <Text
        style={[
          styles.dayNum,
          disabled && styles.dayNumDisabled,
          visual === 'booked' && styles.dayBooked,
          visual === 'pending' && styles.dayPending,
          visual === 'blocked' && styles.dayBlocked,
        ]}
      >
        {Number(dayIso.slice(8, 10))}
      </Text>
      <View style={styles.dotRow} pointerEvents="none">
        {visual === 'booked' ? <View style={[styles.dot, styles.dotBooked]} /> : null}
        {visual === 'pending' ? <View style={[styles.dot, styles.dotPending]} /> : null}
        {visual === 'blocked' ? <View style={[styles.dot, styles.dotBlocked]} /> : null}
        {visual === 'available' && !disabled ? <View style={[styles.dot, styles.dotAvail]} /> : null}
      </View>
    </Pressable>
  );
}

const CELL_MIN_H = 48;

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    minHeight: CELL_MIN_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  cellEmpty: {
    opacity: 0,
  },
  cellInRange: {
    backgroundColor: 'rgba(15, 118, 110, 0.12)',
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
    borderColor: 'rgba(15, 118, 110, 0.45)',
    marginHorizontal: 1,
    marginVertical: 2,
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  dayNumDisabled: {
    color: ui.textSecondary,
    opacity: 0.45,
  },
  dayBooked: {
    color: ui.textSecondary,
  },
  dayPending: {
    color: '#B45309',
  },
  dayBlocked: {
    color: ui.textSecondary,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    minHeight: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotBooked: {
    backgroundColor: 'rgba(55, 65, 81, 0.85)',
  },
  dotPending: {
    backgroundColor: '#F59E0B',
  },
  dotBlocked: {
    backgroundColor: 'rgba(107, 114, 128, 0.75)',
  },
  dotAvail: {
    backgroundColor: 'rgba(15, 118, 110, 0.35)',
  },
});
