import type { SupabaseClient } from '@supabase/supabase-js';

import { deriveLifecyclePhaseFromRentalStatus } from '@/lib/rentalLifecyclePhase';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import {
  deriveDualConfirmation,
  fetchVerificationPhotos,
  fetchVerificationRows,
} from '@/lib/rentalVerification';
import {
  buildRentalWizardContextFlags,
  isPickupHandoffBilaterallyComplete,
  isReturnBilaterallyComplete,
} from '@/lib/rentalWizard/rentalWizardStepResolver';
import { fetchRentalWizardState } from '@/lib/rentalWizard/rentalWizardSeenState';
import type { RentalWizardContext, RentalWizardRentalRow } from '@/lib/rentalWizard/types';
import { resolveRentalPickupIso, resolveRentalReturnIso } from '@/lib/rentalExtensionProposal';

function rentalCodeFromId(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `Rental #${compact}`;
}

async function resolveDisplayTitle(
  supabase: SupabaseClient,
  rental: RentalWizardRentalRow
): Promise<string> {
  if (rental.listing_id) {
    const { data } = await supabase.from('listings').select('title').eq('id', rental.listing_id).maybeSingle();
    if (data?.title && String(data.title).trim()) return String(data.title).trim();
  }
  if (rental.request_id) {
    const { data } = await supabase.from('requests').select('title').eq('id', rental.request_id).maybeSingle();
    if (data?.title && String(data.title).trim()) return String(data.title).trim();
  }
  return 'Rental item';
}

export async function buildRentalWizardContext(
  supabase: SupabaseClient,
  rentalId: string,
  viewerUserId: string
): Promise<RentalWizardContext | null> {
  const { data: rentalData, error } = await supabase
    .from('rentals')
    .select('*')
    .eq('id', rentalId)
    .maybeSingle();

  if (error || !rentalData) return null;

  const rental = rentalData as RentalWizardRentalRow;
  if (rental.renter_user_id !== viewerUserId) {
    return null;
  }

  const { meetingCompleted, hasPendingProposal } = buildRentalWizardContextFlags(rental);
  const lifecyclePhase = deriveLifecyclePhaseFromRentalStatus(rental.status);
  const termsCompleted = rental.price != null && Number.isFinite(Number(rental.price));

  let verificationRows: Awaited<ReturnType<typeof fetchVerificationRows>> = [];
  let ownerPickupPhotoCount = 0;
  if (meetingCompleted) {
    verificationRows = await fetchVerificationRows(supabase, rentalId);
    const pickupPhotos = await fetchVerificationPhotos(supabase, rentalId, 'pickup');
    ownerPickupPhotoCount = pickupPhotos.filter((p) => p.role === 'owner').length;
  }

  const pickupAck = deriveDualConfirmation(verificationRows, 'pickup');
  const returnAck = deriveDualConfirmation(verificationRows, 'return');
  const pickupHandoffComplete = isPickupHandoffBilaterallyComplete({
    pickupAck,
    signedAt: rental.signed_at,
  });
  const returnHandoffComplete = isReturnBilaterallyComplete(returnAck);

  const wizardState = await fetchRentalWizardState(supabase, rentalId, viewerUserId);
  const displayTitle = await resolveDisplayTitle(supabase, rental);

  return {
    rentalId,
    viewerUserId,
    viewerRole: 'renter',
    rental,
    displayTitle,
    ownerDisplayName: getProfileNameForUserId(rental.owner_user_id),
    rentalCodeLabel: rentalCodeFromId(rentalId),
    lifecyclePhase,
    termsCompleted,
    meetingCompleted,
    hasPendingProposal,
    pickupHandoffComplete,
    returnHandoffComplete,
    pickupAck,
    returnAck,
    ownerPickupPhotoCount,
    pickupIso: resolveRentalPickupIso(rental),
    returnIso: resolveRentalReturnIso(rental),
    seenTransitions: wizardState.seenTransitions,
    wizardProgress: wizardState.wizardProgress,
    verificationRows,
  };
}
