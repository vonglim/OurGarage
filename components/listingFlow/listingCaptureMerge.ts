import type { MediaCaptureListingCommit } from '@/store/mediaCaptureSessionStore';

import type { ListingPhotoSlot, ListingWizardDraft } from './listingTypes';

function slotForUri(prev: ListingWizardDraft, uri: string): ListingPhotoSlot {
  if (prev.coverPhoto?.localUri === uri) {
    return {
      localUri: uri,
      remoteUrl: prev.coverPhoto.remoteUrl,
      uploading: false,
    };
  }
  const g = prev.galleryPhotos.find((x) => x.localUri === uri);
  if (g) {
    return { localUri: uri, remoteUrl: g.remoteUrl, uploading: false };
  }
  return { localUri: uri, remoteUrl: null, uploading: false };
}

/**
 * Maps a media-capture session result into listing cover + gallery slots,
 * preserving remote URLs for unchanged local URIs.
 */
export function mergeListingCaptureIntoDraft(
  prev: ListingWizardDraft,
  commit: MediaCaptureListingCommit
): Pick<ListingWizardDraft, 'coverPhoto' | 'galleryPhotos'> {
  if (!commit.items.length) {
    return { coverPhoto: null, galleryPhotos: [] };
  }
  const coverItem = commit.items.find((i) => i.id === commit.coverId) ?? commit.items[0];
  const coverPhoto = slotForUri(prev, coverItem.localUri);
  const galleryPhotos = commit.items
    .filter((i) => i.id !== coverItem.id)
    .map((i) => slotForUri(prev, i.localUri));
  return { coverPhoto, galleryPhotos };
}
