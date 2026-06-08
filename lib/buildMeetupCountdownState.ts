import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';

export type MeetupCountdownStatus = 'normal' | 'upcoming' | 'imminent' | 'overdue';

export type MeetupCountdownState = {
  status: MeetupCountdownStatus;
  title: string;
  subtitle: string | null;
  footnote: string | null;
  icon: 'time-outline' | 'alarm-outline' | 'location-outline' | 'warning-outline';
  /** Refresh title every minute when pickup is within 3 hours and not overdue. */
  useLiveCountdown: boolean;
};

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_24H = 24 * MS_HOUR;
const MS_3H = 3 * MS_HOUR;
const MS_30M = 30 * MS_MINUTE;
const MS_DAY = MS_24H;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function calendarDayDiff(targetMs: number, nowMs: number): number {
  return Math.round((startOfLocalDay(new Date(targetMs)) - startOfLocalDay(new Date(nowMs))) / MS_DAY);
}

function formatTimeOnly(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatMinutesUntil(msUntil: number): string {
  const totalMinutes = Math.max(0, Math.ceil(msUntil / MS_MINUTE));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    const hourLabel = `${hours} hour${hours === 1 ? '' : 's'}`;
    const minuteLabel = `${minutes} minute${minutes === 1 ? '' : 's'}`;
    return `${hourLabel} ${minuteLabel}`;
  }
  return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
}

export function buildMeetupCountdownState(
  pickupIso: string | null | undefined,
  nowMs: number = getEffectiveNowMs()
): MeetupCountdownState {
  const iso = typeof pickupIso === 'string' ? pickupIso.trim() : '';
  if (!iso) {
    return {
      status: 'normal',
      title: 'Pickup time not set',
      subtitle: 'Coordinate pickup details with the other party.',
      footnote: null,
      icon: 'time-outline',
      useLiveCountdown: false,
    };
  }

  const pickupMs = Date.parse(iso);
  if (!Number.isFinite(pickupMs)) {
    return {
      status: 'normal',
      title: 'Pickup time not set',
      subtitle: 'Coordinate pickup details with the other party.',
      footnote: null,
      icon: 'time-outline',
      useLiveCountdown: false,
    };
  }

  const msUntil = pickupMs - nowMs;

  if (msUntil < 0) {
    return {
      status: 'overdue',
      title: 'Pickup time has passed',
      subtitle: 'Check messages and coordinate with the other party.',
      footnote: null,
      icon: 'warning-outline',
      useLiveCountdown: false,
    };
  }

  if (msUntil <= MS_30M) {
    return {
      status: 'imminent',
      title: `Pickup starts in ${formatMinutesUntil(msUntil)}`,
      subtitle: null,
      footnote: 'Head to the meetup location soon.',
      icon: 'location-outline',
      useLiveCountdown: true,
    };
  }

  if (msUntil <= MS_3H) {
    return {
      status: 'upcoming',
      title: `Pickup in ${formatMinutesUntil(msUntil)}`,
      subtitle: null,
      footnote: null,
      icon: 'alarm-outline',
      useLiveCountdown: true,
    };
  }

  const timePart = formatTimeOnly(iso);
  const dayDiff = calendarDayDiff(pickupMs, nowMs);

  if (msUntil <= MS_24H) {
    if (dayDiff === 1) {
      return {
        status: 'upcoming',
        title: `Pickup tomorrow at ${timePart}`,
        subtitle: null,
        footnote: null,
        icon: 'time-outline',
        useLiveCountdown: false,
      };
    }
    if (dayDiff === 0) {
      return {
        status: 'upcoming',
        title: `Pickup today at ${timePart}`,
        subtitle: null,
        footnote: null,
        icon: 'time-outline',
        useLiveCountdown: false,
      };
    }
    return {
      status: 'upcoming',
      title: `Pickup at ${timePart}`,
      subtitle: formatWizardDateTime(iso),
      footnote: null,
      icon: 'time-outline',
      useLiveCountdown: false,
    };
  }

  const daysUntil = Math.max(dayDiff, 1);
  return {
    status: 'normal',
    title: `Pickup in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
    subtitle: formatWizardDateTime(iso),
    footnote: null,
    icon: 'time-outline',
    useLiveCountdown: false,
  };
}
