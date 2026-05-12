import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ListingOfferWizard } from '@/components/makeOfferFlow/ListingOfferWizard';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { buildListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { fetchListingOwnerUserId, isToolListingOwner } from '@/lib/listingOwnership';
import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { getListingById } from '@/store/listingsStore';
import type { ToolListing } from '@/store/listingsStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function MakeOfferListingScreen() {
  const params = useLocalSearchParams<{
    listingId?: string | string[];
    durationKey?: string | string[];
    dayCount?: string | string[];
  }>();
  const listingId = firstParam(params.listingId)?.trim();
  const durationKey = firstParam(params.durationKey) === 'multi' ? 'multi' : 'full';
  const dayCount = Math.max(1, parseInt(firstParam(params.dayCount) ?? '1', 10) || 1);
  const billingDayCount = durationKey === 'multi' ? dayCount : 1;

  const currentUserId = useAuthUserId();
  const [ownerUserId, setOwnerUserId] = useState('');

  useFocusEffect(
    useCallback(() => {
      void hydrateListingsFromSupabase();
    }, [])
  );

  const listing = useMemo(() => (listingId ? getListingById(listingId) : undefined), [listingId]);

  const heroUrl = useMemo(() => {
    if (!listing) return null;
    const urls = normalizeListingImages((listing as ToolListing & { images?: string[] }).images)
      .map((u) => u.trim())
      .filter(Boolean);
    return urls[0] ?? null;
  }, [listing]);

  useEffect(() => {
    if (!listingId) return;
    const fromRow = listing?.ownerUserId?.trim();
    if (fromRow) {
      setOwnerUserId(fromRow);
      return;
    }
    let cancelled = false;
    void fetchListingOwnerUserId(listingId).then((id) => {
      if (!cancelled && id) setOwnerUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, listing?.ownerUserId]);

  const isOwn = useMemo(
    () => isToolListingOwner(listing, currentUserId),
    [listing, currentUserId]
  );

  const snapshot = useMemo(() => {
    if (!listing) return null;
    const images = normalizeListingImages((listing as ToolListing & { images?: string[] }).images).filter(Boolean);
    return buildListingIntentSnapshot(listing, images);
  }, [listing]);

  if (!listingId) {
    return (
      <ScreenWrapper style={{ backgroundColor: ui.background, flex: 1 }}>
        <Text style={{ padding: 24, color: ui.textSecondary }}>Missing listing.</Text>
      </ScreenWrapper>
    );
  }

  if (!listing || !snapshot) {
    return (
      <ScreenWrapper style={{ backgroundColor: ui.background, flex: 1 }}>
        <ScreenEntrance style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: ui.textSecondary, textAlign: 'center' }}>Loading listing…</Text>
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }

  if (isOwn) {
    return (
      <ScreenWrapper style={{ backgroundColor: ui.background, flex: 1 }}>
        <ScreenEntrance style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: ui.textSecondary, textAlign: 'center' }}>
            You can’t make an offer on your own listing.
          </Text>
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }

  if (!ownerUserId.trim()) {
    return (
      <ScreenWrapper style={{ backgroundColor: ui.background, flex: 1 }}>
        <ScreenEntrance style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: ui.textSecondary, textAlign: 'center' }}>Resolving host…</Text>
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }

  return (
    <ListingOfferWizard
      listing={listing}
      snapshot={snapshot}
      ownerUserId={ownerUserId.trim()}
      billingDayCount={billingDayCount}
      heroUrl={heroUrl}
    />
  );
}
