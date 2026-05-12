import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { MakeOfferWizardGate } from '@/components/makeOfferFlow/MakeOfferWizard';

/**
 * UI-only guided Make an Offer flow (mock state).
 * Backend negotiation is not wired here yet.
 */
export default function MakeOfferScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = params.requestId == null ? undefined : Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  return <MakeOfferWizardGate requestIdStr={requestId} />;
}
