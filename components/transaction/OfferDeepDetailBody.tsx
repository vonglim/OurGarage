import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { AppImage } from '@/components/ui/AppImage';
import { ui } from '@/constants/appUi';
import { formatUsd } from '@/lib/money';
import type { OfferMessageEntry } from '@/lib/negotiationOfferTypes';

const PHOTO_THUMB = 72;
const THUMB_RADIUS = 10;
const ITEM_PLACEHOLDER_COUNT = 4;

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export type OfferDeepDetailBodyProps = {
  scheduleRangeTitle: string;
  durationLabel: string;
  offerDailyRateLabel: string;
  negotiatedDeliverySummary: string;
  ownerDistanceLabel: string;
  requestLocationDisplay: string;
  brandModelText: string | null;
  descriptionText: string | null;
  /** From message line or `offers.item_condition` when present. */
  itemConditionText?: string | null;
  replacementValueText: string | null;
  estimatedPreauth: number | null;
  lateFeePerDay: number;
  extraOfferImages: string[];
  /** Optional URL when backend stores a dedicated verification photo for this offer. */
  verificationPhotoUri?: string | null;
  /** Opens full-screen preview when verification image is not part of `extraOfferImages`. */
  onVerificationPhotoPress?: () => void;
  historyEntries: OfferMessageEntry[];
  hasCurrentOfferDetails: boolean;
  historyStatusNote: string | null;
  offerMessageTrimmed: string;
  onGalleryImagePress: (indexInOfferImages: number) => void;
};

export function OfferDeepDetailBody({
  scheduleRangeTitle,
  durationLabel,
  offerDailyRateLabel,
  negotiatedDeliverySummary,
  ownerDistanceLabel,
  requestLocationDisplay,
  brandModelText,
  descriptionText,
  itemConditionText,
  replacementValueText,
  estimatedPreauth,
  lateFeePerDay,
  extraOfferImages,
  verificationPhotoUri,
  onVerificationPhotoPress,
  historyEntries,
  hasCurrentOfferDetails,
  historyStatusNote,
  offerMessageTrimmed,
  onGalleryImagePress,
}: OfferDeepDetailBodyProps) {
  const [protectionExpanded, setProtectionExpanded] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const offerImages = extraOfferImages;
  const photoCount = offerImages.length;
  const verificationTrimmed = verificationPhotoUri?.trim() ?? '';
  const hasVerificationImage = verificationTrimmed.length > 0;
  const verificationInGalleryIndex = hasVerificationImage
    ? offerImages.findIndex((u) => u === verificationTrimmed)
    : -1;
  const verificationOpensGallery = verificationInGalleryIndex >= 0;
  const dedupedItemImages =
    hasVerificationImage && verificationOpensGallery
      ? offerImages.filter((u) => u !== verificationTrimmed)
      : offerImages;
  const showItemPlaceholders = offerImages.length === 0;
  const viewAllDisabled = photoCount === 0;

  const openVerification = () => {
    if (!hasVerificationImage) return;
    if (verificationOpensGallery) {
      onGalleryImagePress(verificationInGalleryIndex);
    } else {
      onVerificationPhotoPress?.();
    }
  };

  const InfoRow = ({
    label,
    value,
    subtext,
    accessibilityLabel: a11yLabel,
  }: {
    label: string;
    value: string;
    subtext?: string | null;
    accessibilityLabel?: string;
  }) => (
    <View accessible={Boolean(a11yLabel)} accessibilityLabel={a11yLabel}>
      <View style={styles.infoRowMain}>
        <Text style={styles.infoKey}>{label}</Text>
        <View style={styles.infoValueCol}>
          <Text style={styles.infoValue} numberOfLines={2}>
            {value}
          </Text>
          {subtext ? (
            <Text style={styles.infoSubtext} numberOfLines={3}>
              {subtext}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionKicker}>REQUEST SUMMARY</Text>
        <View style={styles.requestCard}>
          <View style={styles.requestRow}>
            <View style={styles.requestIconWell}>
              <Ionicons name="calendar-outline" size={18} color={ui.primary} />
            </View>
            <View style={styles.requestTextCol}>
              <Text style={styles.requestTitle} numberOfLines={1}>
                {scheduleRangeTitle}
              </Text>
              <Text style={styles.requestSubtitle} numberOfLines={1}>
                {durationLabel}
              </Text>
            </View>
            <View style={styles.requestChevronSpacer} />
          </View>
          <View style={styles.requestDivider} />

          <View style={styles.requestRow}>
            <View style={styles.requestIconWell}>
              <Ionicons name="cash-outline" size={18} color={ui.primary} />
            </View>
            <View style={styles.requestTextCol}>
              <Text style={styles.requestTitle} numberOfLines={1}>
                {offerDailyRateLabel}
              </Text>
              <Text style={styles.requestSubtitle} numberOfLines={1}>
                {negotiatedDeliverySummary}
              </Text>
            </View>
            <View style={styles.requestChevronSpacer} />
          </View>
          <View style={styles.requestDivider} />

          <View style={styles.requestRow}>
            <View style={styles.requestIconWell}>
              <Ionicons name="location-outline" size={18} color={ui.primary} />
            </View>
            <View style={styles.requestTextCol}>
              <Text style={styles.requestTitle} numberOfLines={1}>
                {requestLocationDisplay}
              </Text>
              <Text style={styles.requestSubtitle} numberOfLines={1}>
                {ownerDistanceLabel}
              </Text>
            </View>
            <View style={styles.requestChevronSpacer} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.photosCard}>
          <View style={styles.photosHeaderRow}>
            <Text style={styles.photosSectionTitle}>ITEM PHOTOS</Text>
            {viewAllDisabled ? (
              <Text style={styles.photosEmptyMeta} accessibilityRole="text">
                No photos
              </Text>
            ) : (
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => onGalleryImagePress(0)}
                accessibilityRole="button"
                accessibilityLabel={`View all photos (${photoCount})`}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.photosViewAll}>View all ({photoCount})</Text>
              </Pressable>
            )}
          </View>

          {showItemPlaceholders ? (
            <Text style={styles.photosHelper}>Photos help verify the item and condition.</Text>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photosGallery}
            style={styles.photosGalleryScroll}
          >
            {hasVerificationImage ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={openVerification}
                accessibilityRole="button"
                accessibilityLabel="Timestamp proof required. Username and date on note beside item in same photo."
                style={({ pressed }) => [
                  styles.thumbShell,
                  styles.verificationShell,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <AppImage
                  uri={verificationTrimmed}
                  aspect="square"
                  width={PHOTO_THUMB}
                  rounded={THUMB_RADIUS}
                  accessibilityLabel="Timestamp proof required thumbnail"
                />
                <View style={styles.verificationStrip} pointerEvents="none">
                  <Ionicons name="shield-checkmark" size={9} color="#FFFFFF" />
                  <Text style={styles.verificationStripText} numberOfLines={1}>
                    Verification
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View
                style={[styles.thumbShell, styles.verificationShell, styles.verificationEmpty]}
                accessibilityLabel="Timestamp proof required placeholder. Note with username and date beside item."
              >
                <Ionicons name="shield-checkmark-outline" size={18} color="rgba(107, 114, 128, 0.5)" />
                <Text style={styles.verificationEmptyLabel} numberOfLines={1}>
                  Verification
                </Text>
              </View>
            )}

            {showItemPlaceholders
              ? Array.from({ length: ITEM_PLACEHOLDER_COUNT }).map((_, i) => (
                  <View
                    key={`item-ph-${i}`}
                    style={[styles.thumbShell, styles.photoPlaceholder]}
                    accessibilityLabel={`Empty item photo slot ${i + 1}`}
                  >
                    <Ionicons name="image-outline" size={20} color="rgba(107, 114, 128, 0.45)" />
                  </View>
                ))
              : dedupedItemImages.map((img, i) => {
                  const galleryIndex = offerImages.indexOf(img);
                  return (
                    <Pressable
                      key={`${img}-${i}`}
                      pressOpacityFeedback={false}
                      onPress={() => onGalleryImagePress(galleryIndex >= 0 ? galleryIndex : i)}
                      style={({ pressed }) => [styles.thumbShell, pressed && { opacity: 0.92 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Offer item photo ${galleryIndex + 1}`}
                    >
                      <AppImage
                        uri={img}
                        aspect="square"
                        width={PHOTO_THUMB}
                        rounded={THUMB_RADIUS}
                      />
                    </Pressable>
                  );
                })}
          </ScrollView>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.moreCard}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() => setProtectionExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={protectionExpanded ? 'Hide more details' : 'Show more details'}
          >
            <View style={styles.moreHeaderRow}>
              <Text style={styles.moreHeaderLabel}>MORE DETAILS</Text>
              <View style={styles.moreHeaderAction}>
                <Text style={styles.moreHeaderActionText}>{protectionExpanded ? 'Hide' : 'Show'}</Text>
                <Ionicons
                  name={protectionExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={ui.primary}
                />
              </View>
            </View>
          </Pressable>

          {descriptionText ? <Text style={styles.moreDescription}>{descriptionText}</Text> : null}

          {protectionExpanded ? (
            <View style={styles.moreRows}>
              <View style={styles.infoGroup}>
                <InfoRow label="Brand & model" value={brandModelText ?? '—'} />
                {itemConditionText?.trim() ? (
                  <InfoRow label="Item condition" value={itemConditionText.trim()} />
                ) : null}
                <InfoRow label="Delivery" value={negotiatedDeliverySummary || '—'} />
                <InfoRow label="Replacement value" value={replacementValueText ?? '—'} />
              </View>
              <View style={styles.infoGroupSeparator} />
              <View style={styles.infoGroup}>
                <InfoRow
                  label="Estimated authorization hold"
                  value={estimatedPreauth != null ? formatUsd(estimatedPreauth) : '—'}
                  subtext="Temporary authorization only — not an immediate charge."
                />
                <InfoRow
                  label="Late fees"
                  value="Managed automatically"
                  subtext="Calculated using platform policy after grace period."
                  accessibilityLabel={`Late fees. Managed automatically. Reference rate if late: ${formatUsd(lateFeePerDay)} per day for this agreed total.`}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionLabel}>Offer History</Text>
      {hasCurrentOfferDetails ? (
        <View style={styles.historyRow}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() =>
              setExpandedHistory((prev) => ({
                ...prev,
                currentOfferDetails: !prev.currentOfferDetails,
              }))
            }
            style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              expandedHistory.currentOfferDetails
                ? 'Current offer details, expanded. Tap to hide.'
                : 'Current offer details. Tap to view.'
            }
          >
            <Text style={styles.historyRowName} numberOfLines={1}>
              Current offer details
            </Text>
            <View style={styles.historyAction}>
              <Text style={styles.historyChevron}>
                {expandedHistory.currentOfferDetails ? 'Hide' : 'View'}
              </Text>
              <Ionicons
                name={expandedHistory.currentOfferDetails ? 'chevron-up' : 'chevron-forward'}
                size={16}
                color={ui.textSecondary}
              />
            </View>
          </Pressable>
          {expandedHistory.currentOfferDetails ? (
            <>
              {offerMessageTrimmed ? (
                <Text style={styles.historyRowMessage}>{offerMessageTrimmed}</Text>
              ) : null}
              {historyStatusNote ? <Text style={styles.historyRowMessage}>{historyStatusNote}</Text> : null}
            </>
          ) : null}
        </View>
      ) : null}
      {historyEntries.length === 0 && !hasCurrentOfferDetails ? (
        <Text style={styles.mutedSmall}>No older offers on this request.</Text>
      ) : (
        historyEntries.map((h) => (
          <View key={`${h.at}-${h.authorId}-${h.kind}`} style={styles.historyRow}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() =>
                setExpandedHistory((prev) => {
                  const key = `${h.at}-${h.authorId}-${h.kind}`;
                  return { ...prev, [key]: !prev[key] };
                })
              }
              style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
            >
              <Text style={styles.historyRowName} numberOfLines={1}>
                {h.kind} · {getTimeAgo(h.at)}
                {h.price != null && Number.isFinite(h.price) ? ` · ${formatUsd(h.price)}` : ''}
              </Text>
              <Text style={styles.historyChevron}>
                {expandedHistory[`${h.at}-${h.authorId}-${h.kind}`] ? 'Hide' : 'View'}
              </Text>
            </Pressable>
            {expandedHistory[`${h.at}-${h.authorId}-${h.kind}`] && h.body?.trim() ? (
              <Text style={styles.historyRowMessage}>{h.body.trim()}</Text>
            ) : null}
          </View>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  sectionKicker: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 10,
  },
  requestCard: {
    backgroundColor: ui.background,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.borderLight,
    overflow: 'hidden',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  requestIconWell: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: ui.surfaceTintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  requestTextCol: {
    flex: 1,
    minWidth: 0,
  },
  requestTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  requestSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  requestDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.borderLight,
    marginLeft: 58,
  },
  requestChevronSpacer: {
    width: 20,
  },
  photosCard: {
    backgroundColor: ui.background,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 9,
  },
  photosHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  photosSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  photosHelper: {
    fontSize: 11,
    fontWeight: '500',
    color: ui.textSecondary,
    opacity: 0.88,
    marginBottom: 9,
    lineHeight: 14,
  },
  photosViewAll: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.primary,
  },
  photosEmptyMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    opacity: 0.55,
    letterSpacing: 0.15,
  },
  photosGalleryScroll: {
    alignSelf: 'stretch',
    maxHeight: PHOTO_THUMB + 2,
  },
  photosGallery: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingRight: 0,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: PHOTO_THUMB,
  },
  thumbShell: {
    position: 'relative',
    width: PHOTO_THUMB,
    height: PHOTO_THUMB,
    borderRadius: THUMB_RADIUS,
    overflow: 'hidden',
    backgroundColor: ui.surfaceGrouped,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 31, 58, 0.018)',
    borderWidth: 1,
    borderColor: 'rgba(11, 31, 58, 0.045)',
    borderStyle: 'dashed',
  },
  verificationShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 163, 74, 0.12)',
    backgroundColor: 'rgba(22, 163, 74, 0.028)',
  },
  verificationEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationEmptyLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 4,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(22, 101, 52, 0.58)',
    letterSpacing: 0.1,
  },
  verificationStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(11, 31, 58, 0.38)',
  },
  verificationStripText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.12,
  },
  moreCard: {
    backgroundColor: ui.background,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    overflow: 'hidden',
  },
  moreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  moreHeaderLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  moreHeaderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moreHeaderActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.primary,
  },
  moreDescription: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    paddingTop: 0,
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 16,
  },
  moreRows: {
    paddingTop: 2,
    paddingBottom: 6,
  },
  infoGroup: {
    paddingHorizontal: 14,
    gap: 11,
  },
  infoGroupSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(11, 31, 58, 0.07)',
    marginHorizontal: 18,
    marginVertical: 10,
  },
  infoRowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoKey: {
    flexShrink: 1,
    flexGrow: 0,
    width: '28%',
    maxWidth: 108,
    minWidth: 0,
    paddingRight: 6,
    paddingTop: 1,
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
    lineHeight: 15,
    letterSpacing: 0.15,
    opacity: 0.95,
  },
  infoValueCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'flex-end',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(34, 34, 34, 0.88)',
    textAlign: 'right',
    lineHeight: 17,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  infoSubtext: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 13,
    textAlign: 'right',
    alignSelf: 'stretch',
    opacity: 0.88,
    maxWidth: '100%',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 6,
    marginTop: 0,
  },
  mutedSmall: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  historyRow: {
    backgroundColor: ui.background,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignSelf: 'stretch',
  },
  historyHeaderPressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    minHeight: 22,
  },
  historyRowPressed: {
    opacity: 0.92,
  },
  historyRowName: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textPrimary,
    flex: 1,
    letterSpacing: 0.15,
  },
  historyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyChevron: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.2,
  },
  historyRowMessage: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
});
