import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import type { Router } from 'expo-router';

import { alertOwnerPickupEvidenceLocked } from '@/lib/pickupEvidenceLock';
import {
  bucketOwnerPickupPhotos,
  type PickupPhotoLike,
} from '@/lib/pickupVerificationPhotoBuckets';
import { OPERATIONAL_VIDEO_LABEL } from '@/lib/timestampPossessionProofCopy';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

export const OPTIONAL_OPERATIONAL_VIDEO_MAX_SECONDS = 15;

/** Owner optional evidence in the `additional` pickup bucket (legacy photo or video). */
export function getOwnerOptionalAdditionalEvidence<T extends PickupPhotoLike>(
  ownerPickupEvidence: readonly T[]
): T[] {
  return bucketOwnerPickupPhotos([...ownerPickupEvidence]).additional;
}

/** Single-slot enforcement: one item max in `additional`, regardless of media kind. */
export function countOwnerOptionalAdditionalEvidence(
  ownerPickupEvidence: readonly PickupPhotoLike[]
): number {
  return getOwnerOptionalAdditionalEvidence(ownerPickupEvidence).length;
}

export function ownerOptionalVideoSlotFull(existingAdditionalCount: number): boolean {
  return existingAdditionalCount >= 1;
}

function beginOptionalVideoSession(rentalId: string): void {
  const st = useCameraSessionStore.getState();
  st.setCapturedPhotoUris([]);
  st.setRentalEvidenceSession({
    rentalId,
    phase: 'pickup',
    pickupPhotoCategory: 'additional',
    captureMode: 'video',
  });
}

export function navigateToOptionalOperationalVideoCapture(
  router: Pick<Router, 'push'>,
  rentalId: string,
  pickupEvidenceLocked = false
): void {
  if (pickupEvidenceLocked) {
    alertOwnerPickupEvidenceLocked();
    return;
  }
  if (Platform.OS === 'web') {
    Alert.alert(
      'Video evidence',
      `${OPERATIONAL_VIDEO_LABEL} is available in the OurGarage mobile app.`
    );
    return;
  }
  beginOptionalVideoSession(rentalId);
  router.push('/evidence-video-capture');
}

export async function pickOptionalOperationalVideoFromLibrary(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Photo library access', 'Allow library access to choose an optional video.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    videoMaxDuration: OPTIONAL_OPERATIONAL_VIDEO_MAX_SECONDS,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export function promptOwnerOptionalOperationalVideo(input: {
  router: Pick<Router, 'push'>;
  rentalId: string;
  ownerPickupEvidence: readonly PickupPhotoLike[];
  pickupEvidenceLocked?: boolean;
  onVideoReady?: (uri: string) => void | Promise<void>;
}): void {
  if (input.pickupEvidenceLocked) {
    alertOwnerPickupEvidenceLocked();
    return;
  }
  if (Platform.OS === 'web') {
    Alert.alert(
      'Video evidence',
      `${OPERATIONAL_VIDEO_LABEL} is available in the OurGarage mobile app.`
    );
    return;
  }
  const existingAdditionalCount = countOwnerOptionalAdditionalEvidence(input.ownerPickupEvidence);
  if (ownerOptionalVideoSlotFull(existingAdditionalCount)) {
    Alert.alert(
      'Video already added',
      `Only one ${OPERATIONAL_VIDEO_LABEL.toLowerCase()} is allowed. Remove the existing video before uploading another.`
    );
    return;
  }

  Alert.alert(
    OPERATIONAL_VIDEO_LABEL,
    `Record or choose one short video (max ${OPTIONAL_OPERATIONAL_VIDEO_MAX_SECONDS} seconds).`,
    [
      {
        text: 'Record video',
        onPress: () =>
          navigateToOptionalOperationalVideoCapture(
            input.router,
            input.rentalId,
            input.pickupEvidenceLocked
          ),
      },
      {
        text: 'Choose from library',
        onPress: () => {
          void (async () => {
            const uri = await pickOptionalOperationalVideoFromLibrary();
            if (!uri) return;
            beginOptionalVideoSession(input.rentalId);
            useCameraSessionStore.getState().setCapturedPhotoUris([uri]);
            await input.onVideoReady?.(uri);
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
}
