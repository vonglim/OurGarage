import React from 'react';

import { AppImage } from '@/components/ui/AppImage';

export type RentalEvidenceThumbnailSize =
  | 'handoffSquare'
  | 'handoffItem'
  | 'handoffWide'
  | 'handoffWideHero'
  | 'compact';

const SIZE_CONFIG: Record<
  RentalEvidenceThumbnailSize,
  { aspect: 'square' | 'wide'; width: number; rounded: number; maxWideHeight: number }
> = {
  handoffSquare: { aspect: 'square', width: 96, rounded: 12, maxWideHeight: 160 },
  /** Compact square for item grids (pickup preview). */
  handoffItem: { aspect: 'square', width: 88, rounded: 12, maxWideHeight: 160 },
  handoffWide: { aspect: 'wide', width: 280, rounded: 12, maxWideHeight: 152 },
  /** Slightly larger landscape tiles for serial / timestamp trust sections. */
  /** Supporting evidence scale (not banner-sized). */
  handoffWideHero: { aspect: 'wide', width: 228, rounded: 12, maxWideHeight: 118 },
  compact: { aspect: 'square', width: 60, rounded: 8, maxWideHeight: 160 },
};

export function RentalEvidenceThumbnail({
  uri,
  size,
  category,
  canDelete,
  onPress,
  onDelete,
}: {
  uri?: string | null;
  size: RentalEvidenceThumbnailSize;
  /** Optional label for accessibility (e.g. pickup category). */
  category?: string | null;
  canDelete: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const cfg = SIZE_CONFIG[size];
  const a11y =
    category != null && String(category).trim() !== ''
      ? category === 'timestamp_proof'
        ? 'Evidence photo, verification photo'
        : `Evidence photo, ${String(category).replace(/_/g, ' ')}`
      : 'Evidence photo';

  return (
    <AppImage
      uri={uri}
      aspect={cfg.aspect}
      width={cfg.width}
      rounded={cfg.rounded}
      maxWideHeight={cfg.maxWideHeight}
      canDelete={canDelete}
      onDelete={canDelete ? onDelete : undefined}
      onPress={onPress}
      accessibilityLabel={a11y}
    />
  );
}
