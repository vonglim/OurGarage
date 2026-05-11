import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { AppImage } from '@/components/ui/AppImage';
import { ui } from '@/constants/appUi';

import { InfoChip } from './InfoChip';
import { PlaceholderImage } from './PlaceholderImage';
import { transactionSuccess } from './transactionTokens';

const LISTING_THUMB = 72;

export type OfferSummaryCardProposalDeclined = {
  reason: string | null;
};

export type OfferSummaryCardProps = {
  /** `emphasis` = transactional green border; `neutral` = standard card chrome */
  tone?: 'emphasis' | 'neutral';
  showBestValueBadge?: boolean;
  ownerName: string;
  ratingLabel: string;
  isOnline?: boolean;
  totalFormatted: string;
  rateSubline: string;
  chips: { delivery: string; distance: string; area: string };
  listingTitle: string;
  listingDescription?: string | null;
  timeAgo: string;
  listingImageUri?: string | null;
  onListingImagePress?: () => void;
  onViewDetailsPress?: () => void;
  onChevronPress?: () => void;
  /** In-card “counter updated” diff lines (only for this thread). */
  counterUpdatedLines?: string[] | null;
  counterUpdatedTitle?: string;
  proposalDeclined?: OfferSummaryCardProposalDeclined | null;
};

export function OfferSummaryCard({
  tone = 'emphasis',
  showBestValueBadge,
  ownerName,
  ratingLabel,
  isOnline,
  totalFormatted,
  rateSubline,
  chips,
  listingTitle,
  listingDescription,
  timeAgo,
  listingImageUri,
  onListingImagePress,
  onViewDetailsPress,
  onChevronPress,
  counterUpdatedLines,
  counterUpdatedTitle = 'Counter updated',
  proposalDeclined,
}: OfferSummaryCardProps) {
  const hasImage = Boolean(listingImageUri && listingImageUri.trim().length > 0);
  const cardFrame = tone === 'emphasis' ? styles.cardEmphasis : styles.cardNeutral;

  return (
    <View style={cardFrame} accessibilityRole="summary">
      <View style={styles.cardTopRow}>
        {showBestValueBadge ? (
          <View style={styles.bestValue}>
            <Text style={styles.bestValueText}>Best value</Text>
          </View>
        ) : (
          <View />
        )}
        <Pressable
          onPress={onChevronPress ?? onViewDetailsPress}
          accessibilityRole="button"
          accessibilityLabel="Offer options"
          hitSlop={12}
          pressOpacityFeedback
        >
          <Ionicons name="chevron-forward" size={20} color={ui.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.ownerPriceRow}>
        <View style={styles.ownerBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.ownerName} numberOfLines={2}>
              {ownerName}
            </Text>
            {isOnline ? <View style={styles.onlineDot} /> : null}
          </View>
          <Text style={styles.ratingLine} numberOfLines={1}>
            {ratingLabel}
          </Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.totalPrice} numberOfLines={1}>
            {totalFormatted}
          </Text>
          <Text style={styles.rateSub} numberOfLines={2}>
            {rateSubline}
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <InfoChip icon="car-outline" label={chips.delivery} />
        <InfoChip icon="location-outline" label={chips.distance} />
        <InfoChip icon="map-outline" label={chips.area} />
      </View>

      <View style={styles.listingDivider} />

      <View style={styles.listingRow}>
        {hasImage ? (
          <AppImage
            uri={listingImageUri!}
            aspect="square"
            width={LISTING_THUMB}
            rounded={12}
            accessibilityLabel="Listing photo"
            onPress={onListingImagePress}
          />
        ) : (
          <PlaceholderImage
            width={LISTING_THUMB}
            height={LISTING_THUMB}
            rounded={12}
            onPress={onListingImagePress}
          />
        )}
        <View style={styles.listingTextCol}>
          <Text style={styles.listingTitle} numberOfLines={2}>
            {listingTitle}
          </Text>
          {listingDescription ? (
            <Text style={styles.listingDesc} numberOfLines={3}>
              {listingDescription}
            </Text>
          ) : null}
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
      </View>

      {proposalDeclined != null ? (
        <View style={styles.inCardProposal}>
          <Text style={styles.inCardProposalTitle}>Proposal declined</Text>
          {proposalDeclined.reason ? (
            <>
              <Text style={styles.inCardProposalSubtitle}>Optional reason:</Text>
              <Text style={styles.inCardProposalReason}>{proposalDeclined.reason}</Text>
            </>
          ) : (
            <Text style={styles.inCardProposalMeta}>No reason was provided.</Text>
          )}
          <Text style={styles.inCardProposalHint}>
            You can still accept the last terms or send a counter while negotiation limits allow.
          </Text>
        </View>
      ) : null}

      {counterUpdatedLines != null && counterUpdatedLines.length > 0 ? (
        <View style={styles.counterInset}>
          <Text style={styles.counterInsetTitle}>{counterUpdatedTitle}</Text>
          <Text style={styles.counterInsetSubtitle}>Updated terms:</Text>
          {counterUpdatedLines.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 24)}`} style={styles.counterInsetBullet}>
              • {line}
            </Text>
          ))}
        </View>
      ) : null}

      {onViewDetailsPress ? (
        <Pressable
          onPress={onViewDetailsPress}
          pressOpacityFeedback={false}
          haptic
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          accessibilityRole="button"
          accessibilityLabel="View offer details"
        >
          <Text style={styles.ctaText}>View Offer Details</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardEmphasis: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    padding: ui.padCard,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: transactionSuccess.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardNeutral: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    padding: ui.padCard,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bestValue: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: transactionSuccess.badgeBg,
  },
  bestValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: transactionSuccess.badgeText,
    letterSpacing: 0.2,
  },
  ownerPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  ownerBlock: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ownerName: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.primary,
    flexShrink: 1,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: transactionSuccess.dot,
  },
  ratingLine: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  priceBlock: {
    alignItems: 'flex-end',
    maxWidth: '46%',
  },
  totalPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: ui.primary,
  },
  rateSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    textAlign: 'right',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  listingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginVertical: 14,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  listingTextCol: {
    flex: 1,
    minWidth: 0,
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.primary,
    lineHeight: 22,
  },
  listingDesc: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 20,
  },
  timeAgo: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  inCardProposal: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  inCardProposalTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inCardProposalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78350F',
    marginBottom: 4,
  },
  inCardProposalReason: {
    fontSize: 15,
    color: '#451A03',
    lineHeight: 22,
  },
  inCardProposalMeta: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  inCardProposalHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  counterInset: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: 1,
    borderColor: 'rgba(11,31,58,0.12)',
  },
  counterInsetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  counterInsetSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 6,
  },
  counterInsetBullet: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 2,
  },
  cta: {
    marginTop: 16,
    width: '100%',
    minHeight: 48,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.background,
  },
  ctaPressed: {
    backgroundColor: ui.surfaceTintPrimary,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.primary,
  },
});
