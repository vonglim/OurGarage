/** Canonical meetup lifecycle colors — inspection, authorization, active. */
export const MEETUP_LIFECYCLE_THEME = {
  equipment_inspection: {
    phase: 17,
    label: 'Equipment Inspection',
    primary: '#7C3AED',
    primaryPressed: '#6D28D9',
    soft: '#F5F3FF',
    softBorder: '#DDD6FE',
    onPrimary: '#FFFFFF',
    progressDot: '#7C3AED',
    progressInactive: '#E9D5FF',
  },
  rental_authorization: {
    phase: 18,
    label: 'Rental Authorization',
    primary: '#EA580C',
    primaryPressed: '#C2410C',
    soft: '#FFF7ED',
    softBorder: '#FED7AA',
    onPrimary: '#FFFFFF',
    progressDot: '#EA580C',
    progressInactive: '#FFEDD5',
  },
  rental_active: {
    phase: 19,
    label: 'Rental Active',
    primary: '#16A34A',
    primaryPressed: '#15803D',
    soft: '#F0FDF4',
    softBorder: '#BBF7D0',
    onPrimary: '#FFFFFF',
    progressDot: '#16A34A',
    progressInactive: '#DCFCE7',
  },
} as const;

export type MeetupLifecyclePhaseKey = keyof typeof MEETUP_LIFECYCLE_THEME;
