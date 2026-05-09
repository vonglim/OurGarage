import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RenbyEquipmentListing } from '@/lib/renbyListings';
import { formatRenbyDistance, formatRenbyPricePerDay } from '@/lib/renbyListings';
import { CardPressable } from '@/components/CardPressable';
import { AppImage } from '@/components/ui/AppImage';
import { ui } from '@/constants/appUi';

type Props = {
  listing: RenbyEquipmentListing;
  onPress: () => void;
};

export function EquipmentListingCard({ listing, onPress }: Props) {
  return (
    <CardPressable
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${formatRenbyPricePerDay(listing.pricePerDay)}, ${formatRenbyDistance(listing.distanceMiles)}`}
      onPress={onPress}
      style={styles.pressWrap}
    >
      <View style={styles.card}>
        <AppImage
          uri={listing.imageUrl}
          aspect="wide"
          stretch
          rounded={0}
          maxWideHeight={160}
          accessibilityLabel={listing.title}
        />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {listing.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.price}>{formatRenbyPricePerDay(listing.pricePerDay)}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.distance}>{formatRenbyDistance(listing.distanceMiles)}</Text>
          </View>
        </View>
      </View>
    </CardPressable>
  );
}

const styles = StyleSheet.create({
  pressWrap: {
    marginBottom: ui.spaceMd,
  },
  card: {
    backgroundColor: ui.cardBg,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: ui.padCard,
    paddingTop: 14,
    paddingBottom: ui.padCard,
    gap: 6,
  },
  title: {
    fontSize: ui.fontTitleCard - 2,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  price: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.primary,
  },
  dot: {
    fontSize: ui.fontSecondary,
    color: ui.textSecondary,
    marginHorizontal: 2,
  },
  distance: {
    fontSize: ui.fontSecondary,
    color: ui.textSecondary,
  },
});
