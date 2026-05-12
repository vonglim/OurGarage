import { uploadOfferImage } from '@/lib/uploadOfferImage';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useMediaCaptureSessionStore } from '@/store/mediaCaptureSessionStore';

import { mergeListingCaptureIntoDraft } from './listingCaptureMerge';
import type { ListingWizardDraft } from './listingTypes';

type DraftUpdater = (patch: Partial<ListingWizardDraft> | ((prev: ListingWizardDraft) => ListingWizardDraft)) => void;

async function uploadSlot(uri: string, onDone: (remote: string) => void, onFail: () => void) {
  try {
    const remoteUrl = await uploadOfferImage(uri);
    onDone(remoteUrl);
  } catch {
    showFeedbackToast('Could not upload. Try again.');
    onFail();
  }
}

/**
 * Applies a pending media-capture commit from {@link useMediaCaptureSessionStore} and starts uploads.
 * Called from Listing wizard screen focus so it still runs if step-1 body unmounts during `/media-capture`.
 */
export function applyPendingListingCaptureIfAny(updateDraft: DraftUpdater, readDraft: () => ListingWizardDraft): void {
  const commit = useMediaCaptureSessionStore.getState().takeListingPendingCommit();
  if (!commit?.items.length) return;

  const prev = readDraft();
  const patch = mergeListingCaptureIntoDraft(prev, commit);
  updateDraft(patch);

  const cover = patch.coverPhoto;
  if (cover?.localUri && !cover.remoteUrl) {
    const uri = cover.localUri;
    const prevCover = prev.coverPhoto;
    updateDraft({ coverPhoto: { ...cover, uploading: true } });
    void uploadSlot(
      uri,
      (remoteUrl) => updateDraft({ coverPhoto: { localUri: uri, remoteUrl, uploading: false } }),
      () => updateDraft({ coverPhoto: prevCover })
    );
  }

  for (const slot of patch.galleryPhotos) {
    if (!slot.localUri || slot.remoteUrl) continue;
    const uri = slot.localUri;
    updateDraft((p) => ({
      ...p,
      galleryPhotos: p.galleryPhotos.map((s) => (s.localUri === uri ? { ...s, uploading: true } : s)),
    }));
    void uploadSlot(
      uri,
      (remoteUrl) =>
        updateDraft((p) => ({
          ...p,
          galleryPhotos: p.galleryPhotos.map((s) =>
            s.localUri === uri ? { ...s, remoteUrl, uploading: false } : s
          ),
        })),
      () =>
        updateDraft((p) => ({
          ...p,
          galleryPhotos: p.galleryPhotos.filter((s) => s.localUri !== uri),
        }))
    );
  }
}
