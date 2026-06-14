/**
 * User-facing copy for owner `timestamp_proof` pickup evidence (`pickup_photo_category`).
 * Proves the owner physically possessed the item on the rental date immediately before handoff.
 */

import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';

/** Modal title and compact references. */
export const TIMESTAMP_POSSESSION_PROOF_LABEL = 'Timestamp proof';

/** Photo tiles and section headers. */
export const TIMESTAMP_POSSESSION_PROOF_TILE_LABEL = 'Timestamp proof (Required)';

export const CURRENT_CONDITION_PHOTOS_LABEL = 'Current condition photos';

export const OPERATIONAL_VIDEO_LABEL = 'Video (Optional)';

export const TIMESTAMP_POSSESSION_PROOF_EVIDENCE_BUNDLE =
  `${CURRENT_CONDITION_PHOTOS_LABEL} · Serial · ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL}`;

/** Note contents — shown in explainers and helpers. */
export const TIMESTAMP_POSSESSION_PROOF_NOTE_LINES = [
  '@username',
  "today's date",
  'rental ID (optional)',
] as const;

export const TIMESTAMP_POSSESSION_PROOF_REQUIREMENT =
  'One photo with the item and handwritten note in the same frame. On the note: @username, today\'s date, rental ID optional.';

export const TIMESTAMP_POSSESSION_PROOF_EXPLAINER_LEAD =
  'Handwrite @username and today\'s date on a note, place it beside the item, and capture both in one photo before handoff.';

export const TIMESTAMP_POSSESSION_PROOF_VERIFY_BULLETS = [
  'Item and note appear in the same photo',
  'Note shows @username and today\'s date (rental ID optional)',
  'Taken on the rental date shortly before handoff',
] as const;

export const TIMESTAMP_POSSESSION_PROOF_TIPS = [
  '@username and today\'s date on the note',
  'Rental ID on the note is optional',
  'Lay the note beside the item — both in frame',
] as const;

export const TIMESTAMP_POSSESSION_PROOF_GOOD_PHOTO_BULLETS = [
  'Item + note in one frame',
  '@username and today\'s date on note',
  'Clear, well lit, taken before handoff',
] as const;

export const TIMESTAMP_POSSESSION_PROOF_HELPER =
  'Required: item + note in one photo (@username, date on note).';

export const TIMESTAMP_POSSESSION_PROOF_EMPTY_BODY =
  'Required photo: full item and note in the same frame (@username + today\'s date on note).';

export const TIMESTAMP_POSSESSION_PROOF_EMPTY_TITLE = 'No timestamp proof yet';

export const TIMESTAMP_POSSESSION_PROOF_EMPTY_OWNER =
  `Use the ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL} tile. Item and note must appear in one photo (@username + date on note).`;

export const TIMESTAMP_POSSESSION_PROOF_EMPTY_RENTER_WAITING = 'Waiting for timestamp proof (Required)';

export const TIMESTAMP_POSSESSION_PROOF_EMPTY_RENTER_BODY =
  'Required: one photo with the full item and a note showing @username and today\'s date in the same frame.';

export const TIMESTAMP_POSSESSION_PROOF_RENTER_REVIEW =
  'Open timestamp proof (Required). Confirm @username and today\'s date on the note beside the item in the same photo.';

export const TIMESTAMP_POSSESSION_PROOF_OWNER_PREP =
  `Capture ${CURRENT_CONDITION_PHOTOS_LABEL.toLowerCase()}, serial, and ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL.toLowerCase()}, then finish your prep checklist. ${OPERATIONAL_VIDEO_LABEL} is welcome but not required.`;

export const TIMESTAMP_POSSESSION_PROOF_OWNER_PREP_BANNER =
  `Capture ${CURRENT_CONDITION_PHOTOS_LABEL.toLowerCase()}, serial, and ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL.toLowerCase()}, finish your prep checklist, then confirm when the item is ready.`;

export const TIMESTAMP_POSSESSION_PROOF_CAMERA_HINT =
  `Open the camera from ${CURRENT_CONDITION_PHOTOS_LABEL}, Serial, ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL}, or ${OPERATIONAL_VIDEO_LABEL} so each capture is saved to the right group.`;

export const TIMESTAMP_POSSESSION_PROOF_CHECKLIST_RENTER =
  'Confirm @username + date on timestamp proof (Required)';

export const TIMESTAMP_POSSESSION_PROOF_CHECKLIST_RENTER_AUTO =
  'Auto-checked when you open timestamp proof (Required)';

export const TIMESTAMP_POSSESSION_PROOF_CHECKLIST_OWNER = 'Timestamp proof (Required)';

export const TIMESTAMP_POSSESSION_PROOF_CHECKLIST_OWNER_AUTO =
  'Required: item + note in one photo (@username, today\'s date on note; rental ID optional).';

export const TIMESTAMP_POSSESSION_PROOF_SECTION_SUB =
  'Required evidence — proves possession on the rental date before handoff, not an older listing photo.';

export const TIMESTAMP_POSSESSION_PROOF_EXAMPLE_PANEL_BODY =
  'Note beside the item in one photo: @username, today\'s date, rental ID optional.';

export const TIMESTAMP_POSSESSION_PROOF_EXAMPLE_ACCESSIBILITY =
  'View enlarged timestamp proof example';

export const TIMESTAMP_POSSESSION_PROOF_OWNER_WAITING_RENTER =
  `The owner still needs ${CURRENT_CONDITION_PHOTOS_LABEL.toLowerCase()}, serial, and ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL.toLowerCase()} before pickup can be confirmed.`;

export const TIMESTAMP_POSSESSION_PROOF_OWNER_UPLOAD_INCOMPLETE =
  `The owner still needs ${CURRENT_CONDITION_PHOTOS_LABEL.toLowerCase()}, serial, and ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL.toLowerCase()}.`;

export const TIMESTAMP_POSSESSION_PROOF_MODAL_CAPTION_OWNER =
  'Timestamp proof (Required): item and note in one photo. Note: @username, today\'s date, rental ID optional.';

export const TIMESTAMP_POSSESSION_PROOF_MODAL_CAPTION_RENTER =
  'Confirm @username and today\'s date on the note beside the item in the same photo.';

/** @deprecated Use TIMESTAMP_POSSESSION_PROOF_LABEL — kept for import stability. */
export const TIMESTAMP_POSSESSION_PROOF_LABEL_SHORT = TIMESTAMP_POSSESSION_PROOF_LABEL;

export function pickupPhotoCategoryDisplayLabel(
  category: PickupPhotoCategory | null | undefined
): string {
  if (category === 'timestamp_proof') return TIMESTAMP_POSSESSION_PROOF_LABEL;
  if (category === 'item') return CURRENT_CONDITION_PHOTOS_LABEL;
  if (category === 'serial') return 'Serial / model';
  if (category === 'additional') return OPERATIONAL_VIDEO_LABEL;
  return 'Photo';
}
