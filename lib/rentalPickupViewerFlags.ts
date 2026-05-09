import AsyncStorage from '@react-native-async-storage/async-storage';

export type RenterPickupViewerFlags = {
  reviewedOwnerPhotos: boolean;
  viewedTimestampProof: boolean;
};

export type OwnerPickupPhotoRevisionInput = {
  id: string;
  path?: string;
  pickupPhotoCategory?: string | null;
  createdAt?: string | null;
};

function storageKey(rentalId: string, userId: string): string {
  return `og.rentalPickupViewerFlags.${rentalId}.${userId}`;
}

/** Stable fingerprint of owner pickup evidence for invalidating renter auto-review flags. */
export function computeOwnerPickupEvidenceRevision(photos: readonly OwnerPickupPhotoRevisionInput[]): string {
  const parts = photos
    .map((p) => `${p.id}|${p.path ?? ''}|${String(p.pickupPhotoCategory ?? '')}|${String(p.createdAt ?? '')}`)
    .sort();
  const s = parts.join('\n');
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

type Stored = RenterPickupViewerFlags & { ownerPickupEvidenceRevision?: string };

/**
 * Load renter pickup viewer flags; if stored evidence revision does not match current owner pickup evidence,
 * clear auto-review flags and persist (manual checklist items are unchanged — stored server-side).
 */
export async function hydrateRenterPickupViewerFlagsFromEvidence(
  rentalId: string,
  userId: string,
  currentRevision: string
): Promise<RenterPickupViewerFlags> {
  let parsed: Stored = {
    reviewedOwnerPhotos: false,
    viewedTimestampProof: false,
  };
  try {
    const raw = await AsyncStorage.getItem(storageKey(rentalId, userId));
    if (raw) {
      const j = JSON.parse(raw) as Partial<Stored>;
      parsed = {
        reviewedOwnerPhotos: Boolean(j.reviewedOwnerPhotos),
        viewedTimestampProof: Boolean(j.viewedTimestampProof),
        ownerPickupEvidenceRevision:
          typeof j.ownerPickupEvidenceRevision === 'string' ? j.ownerPickupEvidenceRevision : undefined,
      };
    }
  } catch {
    /* use defaults */
  }
  const storedRev = parsed.ownerPickupEvidenceRevision;
  if (storedRev !== currentRevision) {
    const cleared: RenterPickupViewerFlags = { reviewedOwnerPhotos: false, viewedTimestampProof: false };
    await AsyncStorage.setItem(
      storageKey(rentalId, userId),
      JSON.stringify({ ...cleared, ownerPickupEvidenceRevision: currentRevision })
    );
    return cleared;
  }
  return {
    reviewedOwnerPhotos: parsed.reviewedOwnerPhotos,
    viewedTimestampProof: parsed.viewedTimestampProof,
  };
}

export async function saveRenterPickupViewerFlags(
  rentalId: string,
  userId: string,
  flags: RenterPickupViewerFlags,
  ownerPickupEvidenceRevision: string
): Promise<void> {
  await AsyncStorage.setItem(
    storageKey(rentalId, userId),
    JSON.stringify({ ...flags, ownerPickupEvidenceRevision })
  );
}
