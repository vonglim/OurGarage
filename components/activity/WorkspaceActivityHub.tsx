import { Pressable } from '@/components/Pressable';
import { shadowCard, ui } from '@/constants/appUi';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export type RentingWorkspaceSection = 'rentals' | 'offers' | 'requests' | 'saved';
export type MyShopWorkspaceSection = 'inbox' | 'rentals' | 'listings' | 'earnings';

type NudgeProps = {
  onDismiss: () => void;
  counterpartyFirstName: string;
  onOpenRental: () => void;
};

function RentalNudgeCard({ onDismiss, counterpartyFirstName, onOpenRental }: NudgeProps) {
  return (
    <View style={styles.nudgeOuter}>
      <View style={styles.nudgeCard}>
        <View style={styles.nudgeTopRow}>
          <Text style={styles.nudgeEyebrow}>Action needed</Text>
          <Pressable
            pressOpacityFeedback={false}
            haptic
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss rental workspace reminder"
            style={({ pressed }) => [styles.nudgeDismissBtn, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="close" size={22} color={ui.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.nudgeTitle}>Rental agreement ready</Text>
        <Text style={styles.nudgeBody}>
          {`Coordinate pickup location and times with ${counterpartyFirstName}.`}
        </Text>
        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={onOpenRental}
          style={({ pressed }) => [styles.nudgeCta, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel="Open rental workspace"
        >
          <Text style={styles.nudgeCtaLabel}>Open rental workspace</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GlanceMini({
  icon,
  iconBg,
  iconColor,
  countLabel,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  countLabel: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      pressOpacityFeedback={false}
      haptic
      onPress={onPress}
      style={({ pressed }) => [styles.glanceCard, pressed && styles.glanceCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${countLabel}`}
    >
      <View style={[styles.glanceIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.glanceCount}>{countLabel}</Text>
      <Text style={styles.glanceTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.glanceSub} numberOfLines={2}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function NavRow({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  badgeCount,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  badgeCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      pressOpacityFeedback={false}
      haptic
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.navIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.navMid}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navDesc} numberOfLines={2}>
          {description}
        </Text>
      </View>
      {badgeCount > 0 ? (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
        </View>
      ) : (
        <View style={styles.navBadgeSpacer} />
      )}
      <Ionicons name="chevron-forward" size={18} color={ui.textSecondary} />
    </Pressable>
  );
}

type RentingHubProps = {
  nudge: null | { rentalId: string; counterpartyFirstName: string };
  onDismissNudge: () => void;
  onOpenRental: (id: string) => void;
  goSection: (s: RentingWorkspaceSection) => void;
  activeRentalCount: number;
  nextPickupHint: string;
  listingOfferCount: number;
  requestCount: number;
  savedCount: number;
};

export function WorkspaceRentingHub({
  nudge,
  onDismissNudge,
  onOpenRental,
  goSection,
  activeRentalCount,
  nextPickupHint,
  listingOfferCount,
  requestCount,
  savedCount,
}: RentingHubProps) {
  return (
    <View style={styles.hubOuter}>
      {nudge ? (
        <RentalNudgeCard
          onDismiss={onDismissNudge}
          counterpartyFirstName={nudge.counterpartyFirstName}
          onOpenRental={() => onOpenRental(nudge.rentalId)}
        />
      ) : null}
      <Text style={styles.sectionHeading}>At a glance</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.glanceRow}
      >
        <GlanceMini
          icon="calendar-outline"
          iconBg="rgba(37, 99, 235, 0.12)"
          iconColor="#2563EB"
          countLabel={String(activeRentalCount)}
          title="Active rentals"
          subtitle={nextPickupHint}
          onPress={() => goSection('rentals')}
        />
        <GlanceMini
          icon="pricetag-outline"
          iconBg="rgba(124, 58, 237, 0.12)"
          iconColor="#7C3AED"
          countLabel={String(listingOfferCount)}
          title="Offers sent"
          subtitle={listingOfferCount > 0 ? 'View offers' : 'No offers yet'}
          onPress={() => goSection('offers')}
        />
        <GlanceMini
          icon="document-text-outline"
          iconBg="rgba(202, 138, 4, 0.14)"
          iconColor="#CA8A04"
          countLabel={String(requestCount)}
          title="Requests"
          subtitle={requestCount > 0 ? 'View requests' : 'Post a request'}
          onPress={() => goSection('requests')}
        />
        <GlanceMini
          icon="ribbon-outline"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor="#16A34A"
          countLabel={String(savedCount)}
          title="Saved items"
          subtitle="Browse listings"
          onPress={() => goSection('saved')}
        />
      </ScrollView>

      <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>Your activity</Text>
      <NavRow
        icon="calendar-outline"
        iconBg="rgba(37, 99, 235, 0.12)"
        iconColor="#2563EB"
        title="Active rentals"
        description="Upcoming pickups and active rentals"
        badgeCount={activeRentalCount}
        onPress={() => goSection('rentals')}
      />
      <NavRow
        icon="pricetag-outline"
        iconBg="rgba(124, 58, 237, 0.12)"
        iconColor="#7C3AED"
        title="Offers"
        description="Offers you've sent on listings"
        badgeCount={listingOfferCount}
        onPress={() => goSection('offers')}
      />
      <NavRow
        icon="document-text-outline"
        iconBg="rgba(202, 138, 4, 0.14)"
        iconColor="#CA8A04"
        title="Requests"
        description="Borrow requests you've posted and offers from lenders"
        badgeCount={requestCount}
        onPress={() => goSection('requests')}
      />
      <NavRow
        icon="ribbon-outline"
        iconBg="rgba(22, 163, 74, 0.12)"
        iconColor="#16A34A"
        title="Saved items"
        description="Listings you've saved for later"
        badgeCount={savedCount}
        onPress={() => goSection('saved')}
      />
    </View>
  );
}

type MyShopHubProps = {
  goSection: (s: MyShopWorkspaceSection) => void;
  inboxCount: number;
  inboxSub: string;
  activeRentalCount: number;
  pickupHint: string;
  listingsCount: number;
  earningsLabel: string;
  earningsSub: string;
};

export function WorkspaceMyShopHub({
  goSection,
  inboxCount,
  inboxSub,
  activeRentalCount,
  pickupHint,
  listingsCount,
  earningsLabel,
  earningsSub,
}: MyShopHubProps) {
  return (
    <View style={styles.hubOuter}>
      <Text style={styles.sectionHeading}>At a glance</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.glanceRow}
      >
        <GlanceMini
          icon="file-tray-full-outline"
          iconBg="rgba(37, 99, 235, 0.12)"
          iconColor="#2563EB"
          countLabel={String(inboxCount)}
          title="Inbox"
          subtitle={inboxSub}
          onPress={() => goSection('inbox')}
        />
        <GlanceMini
          icon="calendar-outline"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor="#16A34A"
          countLabel={String(activeRentalCount)}
          title="Active rentals"
          subtitle={pickupHint}
          onPress={() => goSection('rentals')}
        />
        <GlanceMini
          icon="storefront-outline"
          iconBg="rgba(124, 58, 237, 0.12)"
          iconColor="#7C3AED"
          countLabel={String(listingsCount)}
          title="Listings"
          subtitle="Live on Renby"
          onPress={() => goSection('listings')}
        />
        <GlanceMini
          icon="cash-outline"
          iconBg="rgba(202, 138, 4, 0.14)"
          iconColor="#CA8A04"
          countLabel={earningsLabel}
          title="Earnings"
          subtitle={earningsSub}
          onPress={() => goSection('earnings')}
        />
      </ScrollView>

      <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>Your shop</Text>
      <NavRow
        icon="file-tray-full-outline"
        iconBg="rgba(37, 99, 235, 0.12)"
        iconColor="#2563EB"
        title="Inbox"
        description="Offers and booking requests from renters"
        badgeCount={inboxCount}
        onPress={() => goSection('inbox')}
      />
      <NavRow
        icon="calendar-outline"
        iconBg="rgba(22, 163, 74, 0.12)"
        iconColor="#16A34A"
        title="Active rentals"
        description="Manage pickups, active rentals, and returns"
        badgeCount={activeRentalCount}
        onPress={() => goSection('rentals')}
      />
      <NavRow
        icon="storefront-outline"
        iconBg="rgba(124, 58, 237, 0.12)"
        iconColor="#7C3AED"
        title="Listings"
        description="Your items, availability, and pricing"
        badgeCount={listingsCount}
        onPress={() => goSection('listings')}
      />
      <NavRow
        icon="cash-outline"
        iconBg="rgba(202, 138, 4, 0.14)"
        iconColor="#CA8A04"
        title="Earnings"
        description="Payouts, history, and performance"
        badgeCount={0}
        onPress={() => goSection('earnings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hubOuter: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.25,
    marginBottom: 8,
  },
  sectionHeadingSpaced: {
    marginTop: 16,
  },
  glanceRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  glanceCard: {
    width: 100,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  glanceCardPressed: {
    opacity: 0.94,
    backgroundColor: ui.surfaceTintPrimary,
  },
  glanceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  glanceCount: {
    fontSize: 19,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.35,
    marginBottom: 2,
  },
  glanceTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 13,
    marginBottom: 2,
  },
  glanceSub: {
    fontSize: 10,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 13,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginBottom: 8,
    ...shadowCard,
  },
  navRowPressed: {
    opacity: 0.94,
    backgroundColor: ui.surfaceTintPrimary,
  },
  navIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navMid: {
    flex: 1,
    minWidth: 0,
  },
  navTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  navDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 16,
  },
  navBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 163, 74, 0.14)',
  },
  navBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  navBadgeSpacer: {
    width: 22,
    height: 22,
  },
  nudgeOuter: {
    marginBottom: 12,
  },
  nudgeCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234, 88, 12, 0.25)',
    ...shadowCard,
  },
  nudgeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nudgeEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  nudgeDismissBtn: {
    padding: 4,
    marginRight: -4,
  },
  nudgeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  nudgeBody: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  nudgeCta: {
    alignSelf: 'stretch',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  nudgeCtaLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
});
