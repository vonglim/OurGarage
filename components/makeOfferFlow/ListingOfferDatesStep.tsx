import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ListingDateRangePicker } from '@/components/calendar/ListingDateRangePicker';
import { WizardSubtitle } from '@/components/WizardSubtitle';
import { ui } from '@/constants/appUi';
import { wizardStepTitleStyle } from '@/constants/wizardCopy';
import { billingDaysInclusive, type ListingAvailabilityRow } from '@/lib/listingAvailability';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import type { ListingRenterOfferDraft } from '@/lib/listingOfferFromDraft';

/** Minimal draft slice for date range UI (full offer draft is a superset). */
export type ListingOfferDatesDraftSlice = Pick<ListingRenterOfferDraft, 'rentalStartIso' | 'rentalEndIso'>;

type Props = {
  listingId: string;
  rows: ListingAvailabilityRow[];
  draft: ListingOfferDatesDraftSlice;
  onChangeDates: (start: string | null, end: string | null) => void;
  ignoreOfferId?: string | null;
};

export function ListingOfferDatesStep({ listingId, rows, draft, onChangeDates, ignoreOfferId }: Props) {
  const days =
    draft.rentalStartIso && draft.rentalEndIso
      ? billingDaysInclusive(draft.rentalStartIso, draft.rentalEndIso)
      : 0;
  return (
    <View style={styles.pad}>
      <Text style={wizardStepTitleStyle}>When do you need it?</Text>
      <WizardSubtitle>Choose your rental dates. Unavailable days can&apos;t be selected.</WizardSubtitle>
      <ListingDateRangePicker
        listingId={listingId}
        rows={rows}
        startDate={draft.rentalStartIso}
        endDate={draft.rentalEndIso}
        onChange={onChangeDates}
        ignoreOfferId={ignoreOfferId}
        dense
      />
      {draft.rentalStartIso && draft.rentalEndIso ? (
        <View style={styles.summary}>
          <Text style={styles.summaryLine}>
            {formatIsoDateMedium(draft.rentalStartIso)} → {formatIsoDateMedium(draft.rentalEndIso)}
          </Text>
          <Text style={styles.summaryMeta}>{days} day(s) total</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: 4,
    paddingTop: 8,
    flex: 1,
  },
  summary: {
    marginTop: ui.spaceMd,
    paddingVertical: ui.spaceSm,
    paddingHorizontal: ui.spaceMd,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  summaryLine: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  summaryMeta: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
});
