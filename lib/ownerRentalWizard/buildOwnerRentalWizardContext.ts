import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildRentalWizardContextWithDiagnostics,
  type BuildRentalWizardContextResult,
} from '@/lib/rentalWizard/buildRentalWizardContext';
import type { OwnerRentalWizardContext } from '@/lib/ownerRentalWizard/types';

export async function buildOwnerRentalWizardContext(
  supabase: SupabaseClient,
  rentalId: string,
  viewerUserId: string
): Promise<OwnerRentalWizardContext | null> {
  const result = await buildOwnerRentalWizardContextWithDiagnostics(
    supabase,
    rentalId,
    viewerUserId
  );
  return result.ctx;
}

export async function buildOwnerRentalWizardContextWithDiagnostics(
  supabase: SupabaseClient,
  rentalId: string,
  viewerUserId: string
): Promise<BuildRentalWizardContextResult & { ctx: OwnerRentalWizardContext | null }> {
  const result = await buildRentalWizardContextWithDiagnostics(supabase, rentalId, viewerUserId, {
    expectedViewerRole: 'owner',
  });
  if (!result.ctx || result.ctx.viewerRole !== 'owner') {
    return { ctx: null, buildError: result.buildError };
  }
  return { ctx: result.ctx as OwnerRentalWizardContext, buildError: result.buildError };
}
